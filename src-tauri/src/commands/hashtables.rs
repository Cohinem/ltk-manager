//! Hashtable cache commands: status and sync.

use super::off_thread;
use crate::error::IpcResult;
use crate::events::TauriEventSink;
use ltk_manager_core::game_index::GameIndexState;
use ltk_manager_core::hashtables::{
    HashtableCache, HashtableCacheStatus, HashtableSyncReport, WadPathResolverState,
};
use ltk_manager_core::strings::StringKeyIndexState;
use tauri::{AppHandle, Manager};

/// User agent sent with hashtable release downloads.
const SYNC_USER_AGENT: &str = concat!("ltk-manager/", env!("CARGO_PKG_VERSION"));

/// Report what the shared hashtable cache currently holds.
///
/// A cache that was never synced is a normal report, not an error.
#[tauri::command]
pub async fn get_hashtable_cache_status() -> IpcResult<HashtableCacheStatus> {
    off_thread(|| Ok(HashtableCache::discover()?.status()?)).await
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
        let report = HashtableCache::discover()?.sync(force, SYNC_USER_AGENT, &events)?;

        if !report.up_to_date {
            app.state::<WadPathResolverState>().invalidate();
            app.state::<StringKeyIndexState>().clear();
            app.state::<GameIndexState>().clear()?;
        }
        Ok(report)
    })
    .await
}
