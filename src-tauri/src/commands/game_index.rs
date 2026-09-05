//! Read-only browsing of the game's archives folded into one tree.

use std::sync::Arc;

use super::object_index::ObjectIndexState;
use super::off_thread;
use crate::error::{AppError, AppResult, IpcResult};
use crate::state::SettingsState;
use ltk_manager_core::config::Config;
use ltk_manager_core::game_index::{
    FindGeneration, GameDirListing, GameFindResult, GameIndex, GameIndexState, GameIndexStats,
    GameSearchResult, SearchGeneration,
};
use ltk_manager_core::game_wads::{GameArchives, WadCache};
use ltk_manager_core::hashtables::WadPathResolverState;
use ltk_manager_core::matcher::{FindQuery, PatternSyntax};
use tauri::{AppHandle, Manager};

/// Report what the folded game index holds, building it on first use.
#[tauri::command]
pub async fn get_game_index(app_handle: AppHandle) -> IpcResult<GameIndexStats> {
    with_index(app_handle, |index| Ok(index.stats())).await
}

/// List one directory of the folded game index.
///
/// `path` is `""` for the root, and otherwise a path a previous listing
/// returned. Path hashes resolve through the shared hashtable cache when it is
/// populated. Otherwise every file reads as its hash.
#[tauri::command]
pub async fn read_game_dir(path: String, app_handle: AppHandle) -> IpcResult<GameDirListing> {
    with_index(app_handle, move |index| {
        index.read_dir(&path).ok_or_else(|| {
            AppError::InvalidPath(format!("No such directory in the game index: {path}"))
        })
    })
    .await
}

/// Rank every file of the install against `query`, best first.
///
/// The scan reads the index rather than a list of paths, because building
/// 819,136 of those per keystroke costs more than the matching does. A call
/// that a later one overtakes gives up part way and says so, so a query typed
/// one character at a time runs one whole scan rather than one per character.
///
/// An empty query matches nothing. The palette only reaches this source once
/// something is typed.
#[tauri::command]
pub async fn search_game_index(
    query: String,
    app_handle: AppHandle,
) -> IpcResult<GameSearchResult> {
    let ticket = app_handle.state::<SearchGeneration>().claim();
    let overtaken = {
        let app_handle = app_handle.clone();
        move || app_handle.state::<SearchGeneration>().overtook(ticket)
    };

    with_index(app_handle, move |index| {
        let result = index.search(&query, overtaken);
        tracing::debug!(
            query = %query,
            hits = result.hits.len(),
            total = result.total,
            superseded = result.superseded,
            "Searched the game index"
        );
        Ok(result)
    })
    .await
}

/// Every file of the install matching `pattern`, in tree order.
///
/// The full-results twin of [`search_game_index`]: nothing is ranked, every
/// hit comes back up to the index's own cap, and `regex` reads the pattern as
/// a regular expression rather than as its characters. Either way the match is
/// case-insensitive, which is the only case a resolved WAD path has.
///
/// An empty pattern matches nothing rather than everything. A pattern that
/// does not parse reports `VALIDATION_FAILED` with the parser's own message,
/// which the search box shows under the input.
#[tauri::command]
pub async fn find_in_game_index(
    pattern: String,
    regex: bool,
    app_handle: AppHandle,
) -> IpcResult<GameFindResult> {
    let syntax = if regex {
        PatternSyntax::Regex
    } else {
        PatternSyntax::Literal
    };
    let query = match FindQuery::parse(&pattern, syntax) {
        Ok(query) => query,
        Err(e) => {
            return IpcResult::from(Err::<GameFindResult, _>(AppError::ValidationFailed(
                e.to_string(),
            )));
        }
    };

    let ticket = app_handle.state::<FindGeneration>().claim();
    let overtaken = {
        let app_handle = app_handle.clone();
        move || app_handle.state::<FindGeneration>().overtook(ticket)
    };

    with_index(app_handle, move |index| {
        let Some(query) = query else {
            return Ok(GameFindResult {
                hits: Vec::new(),
                total: 0,
                superseded: false,
                unnamed: false,
            });
        };

        let result = index.find(&query, overtaken);
        tracing::debug!(
            pattern = %pattern,
            regex,
            hits = result.hits.len(),
            total = result.total,
            superseded = result.superseded,
            "Ran a full search of the game index"
        );
        Ok(result)
    })
    .await
}

/// Drop the built index, so the next read walks the install again.
///
/// Unmounts the cached archives with it, and drops the object index, which
/// was fed by this one. Asking for a fresh index is the one signal the app
/// gets that the install changed under it, and a mount taken before a patch
/// would keep answering from the chunk table it read then.
#[tauri::command]
pub async fn refresh_game_index(app_handle: AppHandle) -> IpcResult<()> {
    app_handle
        .state::<GameIndexState>()
        .clear()
        .and_then(|()| app_handle.state::<WadCache>().clear())
        .and_then(|()| app_handle.state::<ObjectIndexState>().clear())
        .into()
}

/// Run `read` against the index, building it when this is the first call.
///
/// The build walks every archive of the install, so it runs on a blocking
/// thread and the state it lands in keeps it for every reader after this one.
async fn with_index<T, F>(app_handle: AppHandle, read: F) -> IpcResult<T>
where
    T: Send + 'static,
    F: FnOnce(&GameIndex) -> AppResult<T> + Send + 'static,
{
    let config = match app_handle.state::<SettingsState>().config() {
        Ok(config) => config,
        Err(e) => return IpcResult::from(Err::<T, _>(e)),
    };

    off_thread(move || {
        let (index, _) = built_game_index(&app_handle, &config)?;
        read(&index)
    })
    .await
}

/// The game index over the install `config` names, and the archives it was read from.
///
/// Builds the index when this is the first call, on the thread it is called
/// from, so a caller reaches for it from a blocking thread. The object index
/// build takes the archives too, which is why they come back beside it.
///
/// # Errors
///
/// Fails when the install cannot be resolved, the hash tables cannot be
/// opened, or the build fails.
pub(super) fn built_game_index(
    app_handle: &AppHandle,
    config: &Config,
) -> AppResult<(Arc<GameIndex>, GameArchives)> {
    let archives = GameArchives::resolve(config)?;
    let resolver = app_handle.state::<Arc<WadPathResolverState>>().get()?;
    let index = app_handle
        .state::<GameIndexState>()
        .get_or_build(&archives, resolver.tables())?;
    Ok((index, archives))
}
