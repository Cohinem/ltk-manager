use crate::error::{AppResult, IpcResult};
use crate::state::SettingsState;
use ltk_manager_core::strings::{StringKeyIndex, StringKeyIndexState, StringKeySearchResult};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;

/// Search known stringtable field names for the workshop strings editor.
///
/// The first call builds the suggestion index, reading the shared cache's
/// `rst-xxh3` table and the game stringtable for value previews, so it can take
/// a moment. Subsequent calls are instant.
#[tauri::command]
pub fn search_string_keys(
    query: String,
    limit: Option<u32>,
    settings: State<SettingsState>,
    index: State<StringKeyIndexState>,
) -> IpcResult<StringKeySearchResult> {
    search_string_keys_inner(&query, limit, &settings, &index).into()
}

fn search_string_keys_inner(
    query: &str,
    limit: Option<u32>,
    settings: &SettingsState,
    index: &StringKeyIndexState,
) -> AppResult<StringKeySearchResult> {
    let index = suggestion_index(settings, index)?;
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
    settings: State<SettingsState>,
    index: State<StringKeyIndexState>,
) -> IpcResult<HashMap<String, String>> {
    lookup_string_values_inner(&keys, &settings, &index).into()
}

fn lookup_string_values_inner(
    keys: &[String],
    settings: &SettingsState,
    index: &StringKeyIndexState,
) -> AppResult<HashMap<String, String>> {
    let index = suggestion_index(settings, index)?;
    Ok(index.lookup(keys))
}

fn suggestion_index(
    settings: &SettingsState,
    index: &StringKeyIndexState,
) -> AppResult<Arc<StringKeyIndex>> {
    index.get_or_build(&settings.config()?)
}
