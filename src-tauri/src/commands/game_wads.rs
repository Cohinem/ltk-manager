//! Read-only browsing of the game's WAD archives.

use super::off_thread;
use crate::error::IpcResult;
use crate::state::SettingsState;
use ltk_manager_core::game_wads::{GameArchives, GameWadEntry, GameWadSummary};
use ltk_manager_core::hashtables::WadPathResolverState;
use tauri::{AppHandle, Manager};

/// List the game's WAD archives under `DATA/FINAL`, sorted by name.
#[tauri::command]
pub async fn get_game_wads(app_handle: AppHandle) -> IpcResult<Vec<GameWadSummary>> {
    let config = match app_handle.state::<SettingsState>().config() {
        Ok(config) => config,
        Err(e) => return IpcResult::from(Err::<Vec<GameWadSummary>, _>(e)),
    };
    off_thread(move || GameArchives::resolve(&config)?.list()).await
}

/// Read the chunk list of one game WAD archive.
///
/// Path hashes resolve through the shared hashtable cache when it is
/// populated. Otherwise every path comes back null.
#[tauri::command]
pub async fn read_game_wad(
    wad_name: String,
    app_handle: AppHandle,
) -> IpcResult<Vec<GameWadEntry>> {
    let config = match app_handle.state::<SettingsState>().config() {
        Ok(config) => config,
        Err(e) => return IpcResult::from(Err::<Vec<GameWadEntry>, _>(e)),
    };
    off_thread(move || {
        let archives = GameArchives::resolve(&config)?;
        let resolver = app_handle.state::<WadPathResolverState>().get()?;
        archives.read(&wad_name, resolver.tables())
    })
    .await
}
