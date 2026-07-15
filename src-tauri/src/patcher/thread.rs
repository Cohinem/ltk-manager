//! Background patching thread: builds the overlay, drives the persistent host
//! through one injection session, and emits the patcher's UI events.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex};
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

use crate::error::{AppError, AppErrorResponse, AppResult, MutexResultExt};
use crate::mods::ModLibrary;
use crate::state::Settings;

use super::host::{HostConfig, HostError, HostLine, HostLogLevel, PatcherHost};
use super::injector::{Injector, InjectorEvent};
use super::{PatcherPhase, PatcherStateInner, StoredPatcherConfig};

/// One archive that failed the integrity scan, sent in [`WadScanFailedPayload`].
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct WadScanFailureInfo {
    /// The offending archive (e.g. `TahmKench.wad.client`), if its name parsed.
    pub wad: Option<String>,
    /// The NTSTATUS-style code the scan reported (e.g. `c0000229` skinhack,
    /// `c000003e` corrupt WAD).
    pub status: String,
}

/// Payload for the `patcher-wad-scan-failed` event, emitted when the injected
/// DLL's integrity scan rejects one or more modded archives. When this fires
/// the patcher auto-stops and applies no mods for the session.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct WadScanFailedPayload {
    /// The archives that failed the scan, de-duplicated. May be empty if no
    /// names could be parsed from the scan log.
    pub failures: Vec<WadScanFailureInfo>,
}

/// Payload for the `linked-bins-warning` event, emitted after a patcher start whose
/// single overlay build found enabled mods with unresolved linked dependencies (only
/// when `linked_bin_check_enabled`). Injection is non-fatal, so this never blocks the
/// start - it drives a non-blocking toast. The per-mod badges and the reachable
/// `LinkedBinWarningDialog` carry the detail (fetched via `get_linked_bin_offenders`).
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct LinkedBinWarningPayload {
    /// Number of enabled mods flagged in the latest build.
    pub count: u32,
}

/// Per-session inputs for [`PatcherThread::start`], resolved by the command
/// layer before the patcher state is claimed.
pub(crate) struct SessionParams {
    pub injector_exe: PathBuf,
    pub settings: Settings,
    pub library: ModLibrary,
    pub workshop_paths: Vec<PathBuf>,
    pub host_flags: u32,
    pub should_elevate: bool,
    pub is_workshop: bool,
}

/// Inputs moved into the background patcher thread.
pub struct PatcherThread {
    app_handle: AppHandle,
    state: Arc<Mutex<PatcherStateInner>>,
    host: Arc<Mutex<Option<PatcherHost>>>,
    stop_flag: Arc<AtomicBool>,
    injector_exe: PathBuf,
    settings: Settings,
    library: ModLibrary,
    workshop_paths: Vec<PathBuf>,
    host_flags: u32,
    should_elevate: bool,
    is_workshop: bool,
}

impl PatcherThread {
    /// Atomically claim the patcher state and spawn the session thread.
    ///
    /// The running check and every start side effect (stop-flag reset, phase,
    /// config stash for hot-reload, tray flip, handle store) happen under one
    /// lock, so a concurrent start can't slip between them and respawn the
    /// shared host under a live session.
    pub(crate) fn start(
        app_handle: &AppHandle,
        state: &Arc<Mutex<PatcherStateInner>>,
        host: &Arc<Mutex<Option<PatcherHost>>>,
        config: StoredPatcherConfig,
        params: SessionParams,
    ) -> AppResult<()> {
        let mut patcher_state = state.lock().mutex_err()?;
        if patcher_state.is_running() {
            return Err(AppError::Other("Patcher is already running".to_string()));
        }

        patcher_state.stop_flag.store(false, Ordering::SeqCst);
        patcher_state.phase = PatcherPhase::Building;
        patcher_state.last_config = Some(config);

        // Under the same lock so the session's failure path (which resets the
        // tray after locking the state) can't run before the flip to Loading.
        let loading = if params.is_workshop {
            crate::tray::AppTrayState::WorkshopLoading
        } else {
            crate::tray::AppTrayState::LibraryLoading
        };
        let _ = crate::tray::set_tray_state(app_handle.clone(), loading);

        let SessionParams {
            injector_exe,
            settings,
            library,
            workshop_paths,
            host_flags,
            should_elevate,
            is_workshop,
        } = params;
        let session = Self {
            app_handle: app_handle.clone(),
            state: Arc::clone(state),
            host: Arc::clone(host),
            stop_flag: Arc::clone(&patcher_state.stop_flag),
            injector_exe,
            settings,
            library,
            workshop_paths,
            host_flags,
            should_elevate,
            is_workshop,
        };
        patcher_state.thread_handle = Some(thread::spawn(move || session.run()));
        Ok(())
    }

    fn run(self) {
        let Some(overlay_prefix) = self.build_overlay() else {
            return;
        };
        self.run_session(overlay_prefix);
    }

    /// Build the overlay and return its prefix path, or `None` on failure/early
    /// stop (UI state already reset). The build also records linked-bin offenders
    /// into `LinkedBinState`; we read the count only to drive the advisory toast.
    fn build_overlay(&self) -> Option<String> {
        let (overlay_root, offender_count) =
            match self
                .library
                .ensure_overlay(&self.settings, &self.workshop_paths, false)
            {
                Ok(v) => v,
                Err(e) => {
                    tracing::error!(error = ?e, "Overlay build failed");
                    let error_response: AppErrorResponse = e.into();
                    let _ = self.app_handle.emit("patcher-error", &error_response);
                    self.reset_to_idle();
                    return None;
                }
            };

        if self.stop_flag.load(Ordering::SeqCst) {
            tracing::info!("Stop requested after overlay build, exiting");
            self.reset_to_idle();
            return None;
        }

        self.check_linked_bins(offender_count);

        tracing::info!("Using overlay root: {}", overlay_root.display());
        Some(self.normalize_overlay_prefix(&overlay_root.display().to_string()))
    }

    fn normalize_overlay_prefix(&self, prefix: &str) -> String {
        let mut normalized = prefix.to_string();
        if !normalized.ends_with(std::path::MAIN_SEPARATOR) {
            normalized.push(std::path::MAIN_SEPARATOR);
        }
        normalized
    }

    fn check_linked_bins(&self, offender_count: usize) {
        // TODO: move the linked-bin check into the workshop - we can check
        // for the missing linked bins when a given mod project is opened by
        // iterating over all linked bins in the mod, overlaying their paths,
        // and checking if they exist. This would allow us to show the user
        // the missing linked bins before they even start the patcher.
        if self.settings.linked_bin_check_enabled && offender_count > 0 {
            let _ = self.app_handle.emit(
                "linked-bins-warning",
                LinkedBinWarningPayload {
                    count: offender_count as u32,
                },
            );
        }
    }

    /// Configure the host, run its event loop until the game exits or the user
    /// stops, then reset UI state.
    fn run_session(&self, overlay_prefix: String) {
        if let Ok(mut s) = self.state.lock() {
            s.phase = PatcherPhase::Patching;
            s.config_path = Some(overlay_prefix.clone());
        }
        self.set_tray(if self.is_workshop {
            crate::tray::AppTrayState::WorkshopOn
        } else {
            crate::tray::AppTrayState::LibraryOn
        });

        let host_config = HostConfig {
            prefix: overlay_prefix,
            log_level: HostLogLevel::Info,
            flags: self.host_flags,
        };

        let events = match ensure_host_started(
            &self.host,
            &self.injector_exe,
            self.should_elevate,
            &host_config,
        ) {
            Ok(rx) => rx,
            Err(e) => {
                tracing::error!("Failed to start injection host: {}", e);
                let error_response: AppErrorResponse = AppError::Other(e.to_string()).into();
                let _ = self.app_handle.emit("patcher-error", &error_response);
                self.reset_to_idle();
                return;
            }
        };

        // Blocks until the game closes or the patcher is stopped.
        let event_handle = self.app_handle.clone();
        let (result, events) = Injector::new()
            .with_elevate(self.should_elevate)
            .on_event(move |event| match event {
                InjectorEvent::WadScanFailed { failures } => {
                    let payload = WadScanFailedPayload {
                        failures: failures
                            .into_iter()
                            .map(|f| WadScanFailureInfo {
                                wad: f.wad,
                                status: f.status,
                            })
                            .collect(),
                    };
                    let _ = event_handle.emit("patcher-wad-scan-failed", payload);
                }
            })
            .run_session(events, &self.host, &self.stop_flag);

        // Hand the event stream back to the host so the next session reuses it -
        // unless the host died, in which case clear it so the next start respawns.
        if let Ok(mut guard) = self.host.lock() {
            let alive = guard.as_mut().map(|h| h.is_alive()).unwrap_or(false);
            if alive {
                guard
                    .as_mut()
                    .expect("host present when alive")
                    .restore_events(events);
            } else {
                *guard = None;
            }
        }

        match result {
            Ok(()) => tracing::info!("Injector stopped"),
            Err(e) => {
                tracing::error!("Injector error: {}", e);
                let error_response: AppErrorResponse = AppError::Other(e.to_string()).into();
                let _ = self.app_handle.emit("patcher-error", &error_response);
            }
        }

        self.reset_to_idle();
        tracing::info!("Patcher thread exiting");
    }

    /// Reset phase, config path, and tray icon. Runs on every thread exit path.
    fn reset_to_idle(&self) {
        if let Ok(mut s) = self.state.lock() {
            s.phase = PatcherPhase::Idle;
            s.config_path = None;
        }
        self.set_tray(crate::tray::AppTrayState::Default);
    }

    fn set_tray(&self, tray_state: crate::tray::AppTrayState) {
        let _ = crate::tray::set_tray_state(self.app_handle.clone(), tray_state);
    }
}

/// Configure the persistent host and begin a scan session, returning its event
/// stream. Reuses the live host so its elevated worker (and UAC prompt) persist
/// across start/stop; respawns if it is missing, dead, or the elevation mode
/// changed (the `--elevate` flag is fixed at spawn).
fn ensure_host_started(
    host_arc: &Arc<Mutex<Option<PatcherHost>>>,
    exe_path: &std::path::Path,
    elevate: bool,
    config: &HostConfig,
) -> Result<Receiver<HostLine>, HostError> {
    let mut guard = host_arc
        .lock()
        .map_err(|_| HostError::Protocol("patcher host lock poisoned".to_string()))?;

    // `drain_events` clears the previous session's trailing lines and doubles as
    // a liveness probe: a lost or disconnected stream means the host can't serve
    // another session even if the process is still alive.
    let needs_spawn = match guard.as_mut() {
        None => true,
        Some(host) => !host.is_alive() || host.elevated() != elevate || !host.drain_events(),
    };
    if needs_spawn {
        if let Some(mut old) = guard.take() {
            // Graceful shutdown tears down a (possibly elevated) worker instead of
            // orphaning it; a dead host returns at once.
            old.shutdown();
        }
        *guard = Some(PatcherHost::spawn(exe_path, elevate)?);
    }

    let result = {
        let host = guard.as_mut().expect("host present after ensure");
        host.configure(config).and_then(|_| host.start_scan())
    };
    if let Err(e) = result {
        // A failed handshake may leave the host wedged; shut it down so the next
        // start spawns clean.
        if let Some(mut broken) = guard.take() {
            broken.shutdown();
        }
        return Err(e);
    }

    Ok(guard
        .as_mut()
        .expect("host present after ensure")
        .take_events()
        .expect("event stream present on a freshly spawned or reused host"))
}
