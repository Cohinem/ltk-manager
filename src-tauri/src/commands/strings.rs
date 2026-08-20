use crate::error::{AppError, AppResult, IpcResult};
use crate::state::SettingsState;
use ltk_manager_core::strings::{StringKeyIndex, StringKeyIndexState, StringKeySearchResult};
use std::collections::HashMap;
use std::sync::Arc;
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
    let index = suggestion_index(app_handle, settings, index)?;
    let limit = limit.unwrap_or(50).min(200) as usize;
    Ok(index.search(query, limit))
}

/// Current in-game text for override keys, for the editor's original line.
///
/// Shares the suggestion index with [`search_string_keys`], first-call build
/// cost included. A key the game does not resolve is absent from the map.
#[tauri::command]
pub fn lookup_string_values(
    keys: Vec<String>,
    app_handle: AppHandle,
    settings: State<SettingsState>,
    index: State<StringKeyIndexState>,
) -> IpcResult<HashMap<String, String>> {
    lookup_string_values_inner(&keys, &app_handle, &settings, &index).into()
}

fn lookup_string_values_inner(
    keys: &[String],
    app_handle: &AppHandle,
    settings: &SettingsState,
    index: &StringKeyIndexState,
) -> AppResult<HashMap<String, String>> {
    let index = suggestion_index(app_handle, settings, index)?;
    Ok(index.lookup(keys))
}

fn suggestion_index(
    app_handle: &AppHandle,
    settings: &SettingsState,
    index: &StringKeyIndexState,
) -> AppResult<Arc<StringKeyIndex>> {
    let config = settings.config()?;
    let cache_dir = crate::state::get_app_data_dir(app_handle)
        .ok_or_else(|| AppError::Other("Could not determine app data directory".to_string()))?
        .join("hashes");
    index.get_or_build(&cache_dir, &config)
}
