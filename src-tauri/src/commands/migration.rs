use super::off_thread;
use crate::error::{AppResult, IpcResult};
use crate::mods::{BulkInstallResult, CslolModInfo, ModLibraryState};
use crate::patcher::PatcherState;
use crate::state::SettingsState;
use ltk_manager_core::mods::LayoutMigrationState;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

use super::mods::reject_if_patcher_running;

/// What the library layout migration has to say for itself this launch.
///
/// The run starts with the app and is usually over before the webview finishes
/// loading, so asking is what gets its report on screen — the event announcing
/// it may have been emitted to nobody.
#[tauri::command]
pub fn get_layout_migration_state(
    library: State<ModLibraryState>,
) -> IpcResult<LayoutMigrationState> {
    let result: AppResult<LayoutMigrationState> = Ok(library.0.layout_migration_state());
    result.into()
}

/// Scan a cslol-manager directory for importable mods.
#[tauri::command]
pub async fn scan_cslol_mods(directory: String) -> IpcResult<Vec<CslolModInfo>> {
    off_thread(move || crate::mods::scan_cslol_directory(&PathBuf::from(directory))).await
}

/// Import selected mods from a cslol-manager installation.
#[tauri::command]
pub async fn import_cslol_mods(
    app_handle: AppHandle,
    directory: String,
    selected_folders: Vec<String>,
) -> IpcResult<BulkInstallResult> {
    let setup: AppResult<_> = (|| {
        let patcher = app_handle.state::<PatcherState>();
        reject_if_patcher_running(&patcher)?;
        let config = app_handle.state::<SettingsState>().0.lock().config.clone();
        let library = app_handle.state::<ModLibraryState>().0.clone();
        Ok((config, library))
    })();

    let (config, library) = match setup {
        Ok(v) => v,
        Err(e) => return IpcResult::from(Err::<BulkInstallResult, _>(e)),
    };

    off_thread(move || {
        crate::mods::import_cslol_mods(
            &library,
            &config,
            &PathBuf::from(&directory),
            &selected_folders,
        )
    })
    .await
}
