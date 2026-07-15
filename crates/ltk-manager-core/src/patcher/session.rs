//! Per-session orchestration of the persistent injection host.
//!
//! Ties the [`PatcherHost`] lifecycle to the [`Injector`] event loop for one
//! patching session: ensure a usable host, configure it, start the scan, drive
//! the event loop until the game exits or the caller stops, then hand the
//! host's event stream back for the next session. UI-facing conditions are
//! reported through [`PatcherEvents`], keeping this module frontend-agnostic.

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex};

use super::host::{HostConfig, HostError, HostLine, PatcherHost};
use super::injector::{Injector, InjectorError, InjectorEvent, WadScanFailure};

/// Notable conditions the patcher core surfaces to the embedding application
/// while a session runs. The Tauri shell adapts these to UI events; a CLI can
/// map them to log output. Grows as more of the patcher orchestration moves
/// into core (phase changes, errors, linked-bin warnings).
pub trait PatcherEvents: Send {
    /// One or more archives failed the injected DLL's integrity scan, so no
    /// mods were applied and the session auto-stops.
    fn wad_scan_failed(&self, failures: Vec<WadScanFailure>);
}

/// Fatal error from one injection session.
#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    /// The host process could not be spawned, configured, or started.
    #[error(transparent)]
    Host(#[from] HostError),
    /// The injection session itself failed.
    #[error(transparent)]
    Injector(#[from] InjectorError),
}

/// Ensure the overlay prefix ends with a path separator, as the host's
/// `config prefix` command expects a directory prefix.
pub fn normalize_overlay_prefix(prefix: &str) -> String {
    let mut normalized = prefix.to_string();
    if !normalized.ends_with(std::path::MAIN_SEPARATOR) {
        normalized.push(std::path::MAIN_SEPARATOR);
    }
    normalized
}

/// Run one injection session against the persistent host, blocking until the
/// game exits or `stop_flag` is set.
///
/// Ensures a usable host (spawning or respawning as needed), configures it,
/// starts the scan, and drives the injector's event loop. On exit the host's
/// event stream is handed back for reuse by the next session - unless the host
/// died, in which case it is cleared so the next start respawns.
pub fn run_injection_session<E: PatcherEvents + 'static>(
    host: &Arc<Mutex<Option<PatcherHost>>>,
    injector_exe: &Path,
    elevate: bool,
    config: &HostConfig,
    stop_flag: &AtomicBool,
    events: E,
) -> Result<(), SessionError> {
    let host_lines = ensure_host_started(host, injector_exe, elevate, config)?;

    // Blocks until the game closes or the patcher is stopped.
    let (result, host_lines) = Injector::new()
        .with_elevate(elevate)
        .on_event(move |event| match event {
            InjectorEvent::WadScanFailed { failures } => events.wad_scan_failed(failures),
        })
        .run_session(host_lines, host, stop_flag);

    // Hand the event stream back to the host so the next session reuses it -
    // unless the host died, in which case clear it so the next start respawns.
    if let Ok(mut guard) = host.lock() {
        let alive = guard.as_mut().map(|h| h.is_alive()).unwrap_or(false);
        if alive {
            guard
                .as_mut()
                .expect("host present when alive")
                .restore_events(host_lines);
        } else {
            *guard = None;
        }
    }

    result.map_err(SessionError::from)
}

/// Configure the persistent host and begin a scan session, returning its event
/// stream. Reuses the live host so its elevated worker (and UAC prompt) persist
/// across start/stop; respawns if it is missing, dead, or the elevation mode
/// changed (the `--elevate` flag is fixed at spawn).
fn ensure_host_started(
    host_arc: &Arc<Mutex<Option<PatcherHost>>>,
    exe_path: &Path,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_overlay_prefix_appends_separator() {
        let normalized = normalize_overlay_prefix("overlay");
        assert_eq!(normalized, format!("overlay{}", std::path::MAIN_SEPARATOR));
    }

    #[test]
    fn normalize_overlay_prefix_keeps_existing_separator() {
        let prefix = format!("overlay{}", std::path::MAIN_SEPARATOR);
        assert_eq!(normalize_overlay_prefix(&prefix), prefix);
    }
}
