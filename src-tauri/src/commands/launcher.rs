use std::sync::Mutex;

use tauri::{AppHandle, State};

use crate::error::{AppResult, IpcResult, MutexResultExt};
use crate::events::TauriEventSink;
use crate::state::SettingsState;
use ltk_manager_core::launcher::{self, LaunchAvailability, LaunchOutcome, LaunchTarget};

/// Keeps one launch in flight at a time.
///
/// A double-clicked button must not produce two requests: the second would
/// race the first's handoff, or arrive after League has come up and resolve to
/// a pointless [`ltk_manager_core::launcher::LaunchRoute::AlreadyRunning`].
#[derive(Default)]
pub struct LaunchState(Mutex<bool>);

impl LaunchState {
    /// Claim the in-flight slot, or `None` when a launch is already running.
    fn acquire(&self) -> AppResult<Option<LaunchGuard<'_>>> {
        let mut in_flight = self.0.lock().mutex_err()?;
        if *in_flight {
            return Ok(None);
        }
        *in_flight = true;
        Ok(Some(LaunchGuard { state: self }))
    }
}

/// Releases the slot on every exit path, including the error ones.
struct LaunchGuard<'a> {
    state: &'a LaunchState,
}

impl Drop for LaunchGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut in_flight) = self.state.0.lock() {
            *in_flight = false;
        }
    }
}

/// Ask the Riot Client to launch League.
#[tauri::command]
pub fn launch_league(
    target: Option<LaunchTarget>,
    app: AppHandle,
    settings: State<SettingsState>,
    launch: State<LaunchState>,
) -> IpcResult<Option<LaunchOutcome>> {
    let result = launch_league_inner(target, &app, &settings, &launch);
    if let Err(ref e) = result {
        tracing::error!(error = ?e, "Launch League failed");
    }
    result.into()
}

fn launch_league_inner(
    target: Option<LaunchTarget>,
    app: &AppHandle,
    settings: &State<SettingsState>,
    launch: &State<LaunchState>,
) -> AppResult<Option<LaunchOutcome>> {
    let Some(_guard) = launch.acquire()? else {
        tracing::debug!("Launch already in flight, ignoring the request");
        return Ok(None);
    };

    let config = settings.config()?;
    let target = target.unwrap_or_else(launcher::league_target);
    tracing::info!("Launching {}/{}", target.product_id, target.patchline_id);

    let events = TauriEventSink::new(app.clone());
    Ok(Some(launcher::launch_league(&config, &target, &events)?))
}

/// Whether a launch is possible right now. Drives the button's state, so it
/// reports rather than fails.
#[tauri::command]
pub fn get_launch_availability(settings: State<SettingsState>) -> IpcResult<LaunchAvailability> {
    let result: AppResult<LaunchAvailability> = settings
        .config()
        .map(|config| launcher::launch_availability(&config));
    result.into()
}
