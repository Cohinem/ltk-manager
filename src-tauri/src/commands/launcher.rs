use std::path::PathBuf;
use std::sync::Arc;

use parking_lot::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::error::{AppResult, IpcResult};
use crate::events::TauriEventSink;
use crate::mods::ModLibraryState;
use crate::patcher::{PatcherHostState, PatcherState};
use crate::state::{IncidentStoreState, SettingsState};
use ltk_manager_core::config::Config;
use ltk_manager_core::events::EventSink;
use ltk_manager_core::launcher::{
    detect_install_mismatch, InstallMismatch, LaunchAvailability, LaunchOutcome, LaunchTarget,
    LauncherError, LeagueLauncher, SessionStarted, StopFlag,
};

use super::off_thread;
use super::patcher::{start_patcher_inner, PatcherConfig};
use super::settings::save_settings_inner;

/// The one [`LeagueLauncher`] the app shares.
///
/// Held rather than built per command for two reasons: the progress observer is
/// a construction-time property, so building per call would thread the event
/// sink through every signature, and the session watcher and window hider both
/// outlive the command that started them.
pub struct LauncherState(Arc<LeagueLauncher>);

impl LauncherState {
    /// Build the launcher from the settings the app started with.
    ///
    /// # Errors
    ///
    /// Only for a launcher that cannot be configured at all, which is a bug in
    /// `ltk-manager-core` rather than a machine the user can fix.
    pub fn new(app: &AppHandle, config: &Config) -> Result<Self, LauncherError> {
        let events: Arc<dyn EventSink> = Arc::new(TauriEventSink::new(app.clone()));
        Ok(Self(Arc::new(LeagueLauncher::new(config, events)?)))
    }

    /// The launcher itself. Clone the `Arc` to hand it to a background thread.
    pub fn launcher(&self) -> &Arc<LeagueLauncher> {
        &self.0
    }
}

/// Keeps one launch in flight at a time, and holds the flag that calls it off.
///
/// A double-clicked button must not produce two requests: the second would
/// race the first's handoff, or arrive after League has come up and resolve to
/// a pointless [`ltk_manager_core::launcher::LaunchRoute::AlreadyRunning`].
///
/// The flag is per attempt rather than per launcher, because a stopped one
/// stays stopped - a Cancel on this launch must not pre-cancel the next.
#[derive(Default)]
pub struct LaunchState(Mutex<Option<StopFlag>>);

impl LaunchState {
    /// Claim the in-flight slot with a fresh stop flag, or `None` when a launch
    /// is already running.
    #[must_use]
    fn acquire(&self) -> Option<(LaunchGuard<'_>, StopFlag)> {
        let mut in_flight = self.0.lock();
        if in_flight.is_some() {
            return None;
        }

        let stop = StopFlag::new();
        *in_flight = Some(stop.clone());
        Some((LaunchGuard { state: self }, stop))
    }

    /// Call the launch in flight off, reporting whether there was one.
    fn cancel(&self) -> bool {
        let in_flight = self.0.lock();
        let Some(stop) = in_flight.as_ref() else {
            return false;
        };

        stop.stop();
        true
    }
}

/// Releases the slot on every exit path, including the error ones.
struct LaunchGuard<'a> {
    state: &'a LaunchState,
}

impl Drop for LaunchGuard<'_> {
    fn drop(&mut self) {
        *self.state.0.lock() = None;
    }
}

/// Ask the Riot Client to launch League.
#[tauri::command]
pub fn launch_league(
    target: Option<LaunchTarget>,
    launcher: State<LauncherState>,
    launch: State<LaunchState>,
) -> IpcResult<Option<LaunchOutcome>> {
    let result = launch_league_inner(target, &launcher, &launch);
    if let Err(ref e) = result {
        tracing::error!(error = ?e, "Launch League failed");
    }
    result.into()
}

fn launch_league_inner(
    target: Option<LaunchTarget>,
    launcher: &State<LauncherState>,
    launch: &State<LaunchState>,
) -> AppResult<Option<LaunchOutcome>> {
    let Some((_guard, stop)) = launch.acquire() else {
        tracing::debug!("Launch already in flight, ignoring the request");
        return Ok(None);
    };

    tracing::info!("Launching League");
    Ok(Some(launcher.launcher().launch(target, &stop)?))
}

/// Call off the launch that is in flight, if there is one.
///
/// Answers `false` when nothing was running, which is what a Cancel pressed
/// just as the request landed looks like.
///
/// Stopping abandons the wait and not the launch: a request the Riot Client
/// already accepted still starts a game, exactly as a timeout would leave it.
#[tauri::command]
pub fn cancel_launch(launch: State<LaunchState>) -> IpcResult<bool> {
    IpcResult::ok(launch.cancel())
}

/// Ask the Riot Client to close the game it launched.
///
/// Only useful while a session is live - the client refuses to close a product
/// it never started.
#[tauri::command]
pub fn stop_league(launcher: State<LauncherState>) -> IpcResult<()> {
    let result: AppResult<()> = launcher.launcher().close().map_err(Into::into);
    if let Err(ref e) = result {
        tracing::error!(error = ?e, "Stop League failed");
    }
    result.into()
}

/// Whether a launch is possible right now. Drives the button's state, so it
/// reports rather than fails.
#[tauri::command]
pub fn get_launch_availability(launcher: State<LauncherState>) -> IpcResult<LaunchAvailability> {
    IpcResult::ok(launcher.launcher().availability())
}

/// The League session the Riot Client has open, and start following it.
///
/// What a frontend asks on mount. Events alone are not enough there: a session
/// that began before the webview did announced itself to nobody, which is
/// exactly the case after the manager is restarted mid-game.
#[tauri::command]
pub fn get_league_session(launcher: State<LauncherState>) -> IpcResult<Option<SessionStarted>> {
    IpcResult::ok(launcher.launcher().follow_current_session())
}

/// The install the client's League session runs from, against the one the
/// manager is set up for.
///
/// `None` when they agree, when no client or session answers, or when the
/// registry does not know the configured path. Read-only against the client.
#[tauri::command]
#[specta::specta]
pub async fn check_install_mismatch(app_handle: AppHandle) -> IpcResult<Option<InstallMismatch>> {
    let configured = app_handle.state::<SettingsState>().config().league_path;
    off_thread(move || Ok(configured.as_deref().and_then(detect_install_mismatch))).await
}

/// Points the manager at `install_root`, and puts the patcher session back up
/// on an overlay built from it.
///
/// A running session is stopped, the path is saved the way Settings saves it,
/// and the session starts again with the config it ran with and a forced
/// rebuild. Without a running session the overlay is rebuilt and left for the
/// next start.
#[tauri::command]
#[specta::specta]
pub async fn switch_league_install(install_root: String, app_handle: AppHandle) -> IpcResult<()> {
    off_thread(move || switch_league_install_inner(&app_handle, PathBuf::from(install_root))).await
}

fn switch_league_install_inner(app_handle: &AppHandle, install_root: PathBuf) -> AppResult<()> {
    let patcher_state = app_handle.state::<PatcherState>();
    let settings_state = app_handle.state::<SettingsState>();
    let last_config = patcher_state.with(|state| state.last_config.clone());
    let was_running = patcher_state.request_stop();
    if was_running {
        tracing::info!("Stopping the patcher to switch the League install");
        patcher_state.wait_for_stop()?;
    }

    let mut settings = settings_state.0.lock().clone();
    settings.config.league_path = Some(install_root);
    save_settings_inner(settings.clone(), app_handle, &settings_state)?;

    match last_config.filter(|_| was_running) {
        Some(config) => {
            tracing::info!("Starting the patcher again on the switched install");
            start_patcher_inner(
                PatcherConfig::from_stored(config, true),
                app_handle,
                &patcher_state,
                &app_handle.state::<PatcherHostState>(),
                &settings_state,
                &app_handle.state::<ModLibraryState>(),
                &app_handle.state::<IncidentStoreState>(),
            )
        }
        None => {
            let library = app_handle.state::<ModLibraryState>().0.clone();
            library.rebuild_overlay(&settings.config).map(|_| ())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A double-clicked Play button must produce one request, not two.
    #[test]
    fn only_one_launch_is_in_flight_at_a_time() {
        let state = LaunchState::default();

        let first = state.acquire();
        assert!(first.is_some());
        assert!(state.acquire().is_none());

        drop(first);
        assert!(state.acquire().is_some());
    }

    /// Cancel reaches the flag the launch is watching, and says so - the UI
    /// needs to tell "cancelling" apart from "there was nothing to cancel".
    #[test]
    fn cancelling_stops_the_flag_the_launch_holds() {
        let state = LaunchState::default();
        assert!(!state.cancel());

        let (_guard, stop) = state.acquire().unwrap();
        assert!(!stop.is_stopped());

        assert!(state.cancel());
        assert!(stop.is_stopped());
    }

    /// A stopped flag stays stopped, so the next attempt has to get its own or
    /// it would be cancelled before it started.
    #[test]
    fn each_attempt_gets_a_fresh_flag() {
        let state = LaunchState::default();

        let (guard, first) = state.acquire().unwrap();
        state.cancel();
        drop(guard);

        let (_guard, second) = state.acquire().unwrap();
        assert!(first.is_stopped());
        assert!(!second.is_stopped());
    }
}
