//! Background patching thread: builds the overlay, runs the injection session,
//! rebuilds between games when the library changes, and reports everything
//! user-facing through [`PatcherEvents`].

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use ltk_telemetry::Telemetry;

use crate::mods::ModLibrary;
use crate::overlay::{OverlayBuild, WorkshopTestProject};
use ltk_manager_base::config::Config;
use ltk_manager_base::error::{AppError, AppResult, message_with_sources};
use ltk_manager_runtime::diagnostics::binary_id::PatcherBinaries;
use ltk_manager_runtime::diagnostics::incident::SessionFailure;
use ltk_manager_runtime::diagnostics::store::IncidentStore;
use ltk_manager_runtime::launcher::is_game_running;

use super::pipeline::IncidentPipeline;
use ltk_manager_runtime::patcher::error::PatcherError;
use ltk_manager_runtime::patcher::events::PatcherEvents;
use ltk_manager_runtime::patcher::host::{HostConfig, HostLogLevel, PatcherHost};
use ltk_manager_runtime::patcher::injector::SessionEnd;
use ltk_manager_runtime::patcher::recorder::GameRecorder;
use ltk_manager_runtime::patcher::refresh::OverlayRefresh;
use ltk_manager_runtime::patcher::session::{self, SessionError, SessionObserver};
use ltk_manager_runtime::patcher::state::{PatcherPhase, PatcherStateInner, StoredPatcherConfig};

/// How long a rebuild waits for the last game's process to let go of the overlay.
const GAME_RELEASE_TIMEOUT: Duration = Duration::from_secs(10);

/// How often a rebuild checks whether the game process is gone.
const GAME_RELEASE_POLL: Duration = Duration::from_millis(100);

/// The workshop projects a session started from `config` tests.
pub fn workshop_tests(config: &StoredPatcherConfig) -> Vec<WorkshopTestProject> {
    let layers = config.workshop_layers.as_ref();

    config
        .workshop_projects
        .iter()
        .flatten()
        .map(|path| WorkshopTestProject {
            path: PathBuf::from(path),
            enabled_layers: layers
                .and_then(|layers| layers.get(path))
                .map(|names| names.iter().cloned().collect()),
        })
        .collect()
}

/// Per-session inputs for [`PatcherThread::start`], resolved by the caller
/// before the patcher state is claimed.
pub struct SessionParams {
    pub injector_exe: PathBuf,
    pub config: Config,
    pub library: ModLibrary,
    pub workshop_projects: Vec<WorkshopTestProject>,
    pub host_flags: u32,
    pub should_elevate: bool,
    pub patcher_binaries: PatcherBinaries,
    /// Where the session's incidents are written.
    pub incident_store: Arc<IncidentStore>,
    /// Whether the overlay is built from scratch rather than reused.
    pub force_rebuild: bool,
    /// Where the session reports that it ended.
    pub telemetry: Telemetry,
}

/// Inputs moved into the background patcher thread.
pub struct PatcherThread {
    events: Arc<dyn PatcherEvents>,
    observer: Arc<SessionObserver>,
    state: Arc<Mutex<PatcherStateInner>>,
    host: Arc<Mutex<Option<PatcherHost>>>,
    stop_flag: Arc<AtomicBool>,
    refresh: Arc<OverlayRefresh>,
    injector_exe: PathBuf,
    config: Config,
    library: ModLibrary,
    workshop_projects: Vec<WorkshopTestProject>,
    host_flags: u32,
    should_elevate: bool,
    force_rebuild: bool,
}

impl PatcherThread {
    /// Atomically claim the patcher state and spawn the session thread.
    ///
    /// The running check and every start side effect (stop-flag reset, phase,
    /// config stash for hot-reload, the `Building` notification, handle store)
    /// happen under one lock, so a concurrent start can't slip between them and
    /// respawn the shared host under a live session.
    pub fn start(
        events: Arc<dyn PatcherEvents>,
        state: &Arc<Mutex<PatcherStateInner>>,
        host: &Arc<Mutex<Option<PatcherHost>>>,
        stored_config: StoredPatcherConfig,
        params: SessionParams,
    ) -> AppResult<()> {
        let mut patcher_state = state.lock();
        if patcher_state.is_running() {
            return Err(PatcherError::AlreadyRunning.into());
        }

        let origin = stored_config.origin();
        patcher_state.stop_flag.store(false, Ordering::SeqCst);
        patcher_state.begin_session(origin.clone());
        patcher_state.last_config = Some(stored_config);

        // Announced under the same lock so the session's failure path (which
        // resets the phase after locking the state) can't be observed before
        // the flip to `Building`.
        events.phase_changed(PatcherPhase::Building);

        let SessionParams {
            injector_exe,
            config,
            library,
            workshop_projects,
            host_flags,
            should_elevate,
            patcher_binaries,
            incident_store,
            force_rebuild,
            telemetry,
        } = params;
        let pipeline = Arc::new(IncidentPipeline::new(
            config.clone(),
            host_flags,
            library.clone(),
            workshop_projects.clone(),
            incident_store,
            Arc::clone(&events),
            telemetry,
        ));
        let observer = Arc::new(SessionObserver::new(
            Arc::clone(&events),
            GameRecorder::new(origin, should_elevate, patcher_binaries),
            Arc::new(move |record| pipeline.spawn(record)),
        ));
        let session = Self {
            events,
            observer,
            state: Arc::clone(state),
            host: Arc::clone(host),
            stop_flag: Arc::clone(&patcher_state.stop_flag),
            refresh: Arc::clone(&patcher_state.overlay_refresh),
            injector_exe,
            config,
            library,
            workshop_projects,
            host_flags,
            should_elevate,
            force_rebuild,
        };
        patcher_state.thread_handle = Some(thread::spawn(move || session.run()));
        Ok(())
    }

    fn run(self) {
        let mut force_rebuild = self.force_rebuild;
        let mut first_build = true;

        loop {
            let Some((overlay_prefix, offender_count)) = self.build_overlay(force_rebuild) else {
                return;
            };
            if first_build {
                self.check_linked_bins(offender_count);
            }
            force_rebuild = false;
            first_build = false;

            if self.run_session(overlay_prefix) == SessionEnd::Stopped {
                break;
            }
            self.resume_building();
        }

        self.reset_to_idle();
        tracing::info!("Patcher thread exiting");
    }

    /// Build the overlay and return its prefix path with the count of mods
    /// missing linked bins, or `None` on failure or an early stop (state
    /// already reset).
    fn build_overlay(&self, force_rebuild: bool) -> Option<(String, usize)> {
        self.refresh.clear();

        let stop_flag = Arc::clone(&self.stop_flag);
        let build = match self.library.ensure_overlay(
            &self.config,
            &self.workshop_projects,
            force_rebuild,
            move || stop_flag.load(Ordering::SeqCst),
        ) {
            Ok(build) => build,
            Err(AppError::Overlay(ltk_overlay::Error::CalledOff)) => {
                tracing::info!("Stop requested during overlay build, exiting");
                self.reset_to_idle();
                return None;
            }
            Err(e) => {
                tracing::error!(error = ?e, "Overlay build failed");
                self.observer.session_failed(SessionFailure::Build {
                    kind: e.kind(),
                    category: e.overlay_category(),
                    message: message_with_sources(&e),
                });
                self.events.error(e);
                self.reset_to_idle();
                return None;
            }
        };

        let OverlayBuild {
            overlay_root,
            outcome,
        } = build;
        // Refreshes the library badges. Advisory, so it happens even if we are
        // about to bail on a stop request - the data is already correct.
        let offender_count = outcome.linked_bin_offenders.len();
        self.library.record_overlay_build(outcome);

        if self.stop_flag.load(Ordering::SeqCst) {
            tracing::info!("Stop requested after overlay build, exiting");
            self.reset_to_idle();
            return None;
        }

        tracing::info!("Using overlay root: {}", overlay_root.display());
        Some((
            session::normalize_overlay_prefix(&overlay_root.display().to_string()),
            offender_count,
        ))
    }

    fn check_linked_bins(&self, offender_count: usize) {
        // TODO: move the linked-bin check into the workshop - we can check
        // for the missing linked bins when a given mod project is opened by
        // iterating over all linked bins in the mod, overlaying their paths,
        // and checking if they exist. This would allow us to show the user
        // the missing linked bins before they even start the patcher.
        if self.config.linked_bin_check_enabled && offender_count > 0 {
            self.events.linked_bin_warning(offender_count as u32);
        }
    }

    /// Run one injection session via the core orchestration, blocking until the
    /// caller stops or a library edit asks for a rebuild. A failure is reported
    /// and ends the session.
    fn run_session(&self, overlay_prefix: String) -> SessionEnd {
        self.enter_patching(overlay_prefix.clone());

        let host_config = HostConfig {
            prefix: overlay_prefix,
            log_level: if self.config.verbose_patcher_logging {
                HostLogLevel::Debug
            } else {
                HostLogLevel::Info
            },
            flags: self.host_flags,
        };

        let result = session::run_injection_session(
            &self.host,
            &self.injector_exe,
            self.should_elevate,
            &host_config,
            &self.stop_flag,
            &self.refresh,
            Arc::clone(&self.observer),
        );

        match result {
            Ok(SessionEnd::Refresh) => SessionEnd::Refresh,
            Ok(SessionEnd::Stopped) => {
                tracing::info!("Injector stopped");
                self.observer.session_stopped();
                SessionEnd::Stopped
            }
            Err(e) => {
                match &e {
                    SessionError::Host(err) => {
                        tracing::error!("Failed to start injection host: {}", err)
                    }
                    SessionError::Injector(err) => tracing::error!("Injector error: {}", err),
                }
                let error = PatcherError::from(e);
                if let PatcherError::InjectionFailed { stage, message } = &error {
                    self.observer.session_failed(SessionFailure::Injection {
                        stage: *stage,
                        message: message.clone(),
                    });
                }
                self.events.error(AppError::from(error));
                SessionEnd::Stopped
            }
        }
    }

    /// Return to the build phase for a rebuild, once the last game's process has
    /// let go of the overlay or the wait runs out.
    fn resume_building(&self) {
        self.state.lock().resume_building();
        self.events.phase_changed(PatcherPhase::Building);

        let deadline = Instant::now() + GAME_RELEASE_TIMEOUT;
        while is_game_running() && !self.stop_flag.load(Ordering::SeqCst) {
            if Instant::now() >= deadline {
                tracing::warn!("Game still running, rebuilding the overlay anyway");
                break;
            }
            thread::sleep(GAME_RELEASE_POLL);
        }
    }

    /// Move the session to patching against the overlay the build produced.
    ///
    /// Records the transition, then announces it - in that order, so an
    /// embedder that reads the shared state from its listener never sees the
    /// old value.
    fn enter_patching(&self, overlay_prefix: String) {
        self.state.lock().enter_patching(overlay_prefix);
        self.events.phase_changed(PatcherPhase::Patching);
    }

    /// Close the session. Runs on every thread exit path.
    fn reset_to_idle(&self) {
        self.state.lock().end_session();
        self.events.phase_changed(PatcherPhase::Idle);
    }
}

#[cfg(test)]
mod tests;
