//! Hashtable cache commands: status and sync.

use super::off_thread;
use crate::error::IpcResult;
use crate::events::TauriEventSink;
use crate::mods::ModLibraryState;
use crate::state::SettingsState;
use ltk_manager_core::game_index::GameIndexState;
use ltk_manager_core::hashtables::{
    HashtableCache, HashtableCacheStatus, HashtableSyncReport, HashtableUpdateCheck,
    WadPathResolverState,
};
use ltk_manager_core::mods::HealthSweepState;
use ltk_manager_core::problems::BinNames;
use ltk_manager_core::strings::StringKeyIndexState;
use tauri::{AppHandle, Manager};

/// User agent sent with hashtable release downloads.
const SYNC_USER_AGENT: &str = concat!("ltk-manager/", env!("CARGO_PKG_VERSION"));

/// Report what the shared hashtable cache currently holds.
///
/// A cache that was never synced is a normal report, not an error.
#[tauri::command]
pub async fn get_hashtable_cache_status() -> IpcResult<HashtableCacheStatus> {
    off_thread(|| Ok(HashtableCache::shared()?.status()?)).await
}

/// Report what the latest published release has that the cache does not.
///
/// Reads the remote manifest and nothing else: no download, no install, and no
/// update lock, so this is safe to run unasked and safe while another process
/// is midway through a sync.
#[tauri::command]
pub async fn check_hashtable_updates() -> IpcResult<HashtableUpdateCheck> {
    off_thread(|| Ok(HashtableCache::shared()?.check(SYNC_USER_AGENT)?)).await
}

/// Download the latest published hashtables into the shared cache.
///
/// Emits `hashtable-sync-progress` once per asset download. `force`
/// re-downloads every table even when the local copy already matches.
///
/// A run that installed something drops everything read out of the old tables,
/// so the next caller sees the names the new ones give.
#[tauri::command]
pub async fn sync_hashtables(force: bool, app: AppHandle) -> IpcResult<HashtableSyncReport> {
    off_thread(move || {
        let events = TauriEventSink::new(app.clone());
        let report = HashtableCache::shared()?.sync(force, SYNC_USER_AGENT, &events)?;

        if !report.up_to_date {
            reopen_after_sync(&app);
            sweep_after_sync(&app);
        }
        Ok(report)
    })
    .await
}

/// Drop everything read out of the tables a sync has just replaced.
///
/// The next caller opens what the sync wrote. Shared by the Settings sync and
/// by the one the startup sweep runs in front of itself, so the two cannot
/// forget different halves of it.
pub fn reopen_after_sync(app: &AppHandle) {
    app.state::<std::sync::Arc<WadPathResolverState>>()
        .invalidate();
    app.state::<StringKeyIndexState>().clear();
    if let Err(e) = app.state::<GameIndexState>().clear() {
        tracing::warn!("Could not drop the game index after a hashtable sync: {e}");
    }
    BinNames::invalidate_game_index();
}

/// Re-check the library against the tables the sync just installed.
///
/// A verdict's basis names the cache it was taken against, so every stored one
/// is now stale - and a badge that waited for the next launch to say so would
/// leave the user reading a verdict this press has already disproved. On a
/// thread of its own, because a sweep reads every mod and the press it answers
/// is a table download.
///
/// One sweep at a time. Two would share a verdict file, a progress event and
/// one cancel between them, so the reader would watch two runs' counters fight
/// over the status bar while the ✕ stopped whichever started last.
fn sweep_after_sync(app: &AppHandle) {
    let library = app.state::<ModLibraryState>().0.clone();
    if let HealthSweepState::Running { .. } = library.health_sweep_state() {
        tracing::info!("A library sweep is already running, so the sync leaves it to that one");
        return;
    }

    let Ok(settings) = app
        .state::<SettingsState>()
        .0
        .lock()
        .map(|held| held.clone())
    else {
        tracing::warn!("Could not read the settings to sweep after a hashtable sync");
        return;
    };

    std::thread::spawn(move || {
        if let Err(e) = library.sweep_mod_health(&settings.config) {
            tracing::warn!("Could not sweep mod health after a hashtable sync: {e}");
        }
    });
}
