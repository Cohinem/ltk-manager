use crate::error::{AppError, AppResult, IpcResult};
use crate::state::SettingsState;
use ltk_manager_core::strings::{StringKeyIndexState, StringKeySearchResult};
use tauri::{AppHandle, State};

/// Search known stringtable field names for the workshop strings editor.
///
/// The first call builds the suggestion index (downloading the CommunityDragon
/// key list when missing and reading the game stringtable for value previews),
/// so it can take a few seconds; subsequent calls are instant.
#[tauri::command]
pub fn search_string_keys(
    query: String,
    limit: Option<u32>,
    app_handle: AppHandle,
    settings: State<SettingsState>,
    index: State<StringKeyIndexState>,
) -> IpcResult<StringKeySearchResult> {
    search_string_keys_inner(&query, limit, &app_handle, &settings, &index).into()
}

fn search_string_keys_inner(
    query: &str,
    limit: Option<u32>,
    app_handle: &AppHandle,
    settings: &SettingsState,
    index: &StringKeyIndexState,
) -> AppResult<StringKeySearchResult> {
    let config = settings.config()?;
    let cache_dir = crate::state::get_app_data_dir(app_handle)
        .ok_or_else(|| AppError::Other("Could not determine app data directory".to_string()))?
        .join("hashes");

    let index = index.get_or_build(&cache_dir, &config)?;
    let limit = limit.unwrap_or(50).min(200) as usize;
    Ok(index.search(query, limit))
}
