//! The bin object index: warm it, drop it, and search it.

use super::game_index::built_game_index;
use super::off_thread;
use crate::error::{AppErrorResponse, AppResult, IpcResult};
use crate::state::SettingsState;
use ltk_manager_core::config::Config;
use ltk_manager_core::hashtables::{HashtableCache, WadPathResolverState};
use ltk_manager_core::object_index::{
    self, parse_hash, BuildTicket, CacheNames, DeclaredObject, ObjectIndex, ObjectIndexSnapshot,
    ObjectSearchGeneration, ObjectSearchResult,
};
use ltk_manager_core::problems::budget::files_at_once;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use ts_rs::TS;

/// The managed object index, keeping a failed build as the error the frontend reads.
pub type ObjectIndexState = object_index::ObjectIndexState<AppErrorResponse>;

/// What a search answers, given the slot the index is in.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ObjectSearch {
    /// Nothing has warmed the index, or the switch that gates it is off.
    Absent,
    /// A build is running, so the rows are on their way.
    Building,
    /// The last build failed, and the next warm retries it.
    Failed { error: AppErrorResponse },
    /// The index answered.
    Ready(ObjectSearchResult),
}

/// Build the object index, unless one is built or building.
///
/// The game index is built first when it is not, because the object build is
/// fed by it. The call returns once the build lands, and a build that fails
/// leaves the failure in the state for a search to report.
#[tauri::command]
pub async fn warm_object_index(app_handle: AppHandle) -> IpcResult<()> {
    let config = match app_handle.state::<SettingsState>().config() {
        Ok(config) => config,
        Err(e) => return IpcResult::from(Err::<(), _>(e)),
    };

    off_thread(move || {
        let state = app_handle.state::<ObjectIndexState>();
        let Some(ticket) = state.begin()? else {
            return Ok(());
        };
        let built = build(&app_handle, &config, &state, ticket);
        state.finish(ticket, built.map_err(AppErrorResponse::from))
    })
    .await
}

/// The index over the install `config` names, named through the shared tables.
///
/// A cache the machine never synced names nothing, and the index is built
/// unnamed rather than not at all: a search then says so.
fn build(
    app: &AppHandle,
    config: &Config,
    state: &ObjectIndexState,
    ticket: BuildTicket,
) -> AppResult<ObjectIndex> {
    let (game, archives) = built_game_index(app, config)?;
    let index = ObjectIndex::build(&game, &archives, files_at_once(), &|| {
        !state.is_current(ticket)
    })?;

    let cache = match HashtableCache::shared() {
        Ok(cache) => cache,
        Err(e) => {
            tracing::debug!("No hashtable cache to name the object index from: {e}");
            return Ok(index);
        }
    };
    let wad = app.state::<Arc<WadPathResolverState>>().get()?;
    Ok(index.named(&CacheNames::new(&cache.bin_tables(), &wad)))
}

/// Drop the object index, and the result of any build still running.
#[tauri::command]
pub async fn drop_object_index(app_handle: AppHandle) -> IpcResult<()> {
    app_handle.state::<ObjectIndexState>().clear().into()
}

/// Rank every bin object of the install against `query`, best first.
///
/// Answers for the slot the index is in, so a query that arrives while the
/// build runs reads as building rather than as nothing. The scan carries a
/// generation of its own, apart from the game scan's, so a keystroke gives up
/// only the object scan it overtakes.
#[tauri::command]
pub async fn search_object_index(query: String, app_handle: AppHandle) -> IpcResult<ObjectSearch> {
    let ticket = app_handle.state::<ObjectSearchGeneration>().claim();
    let overtaken = {
        let app_handle = app_handle.clone();
        move || {
            app_handle
                .state::<ObjectSearchGeneration>()
                .overtook(ticket)
        }
    };

    off_thread(move || {
        let index = match app_handle.state::<ObjectIndexState>().snapshot()? {
            ObjectIndexSnapshot::Absent => return Ok(ObjectSearch::Absent),
            ObjectIndexSnapshot::Building => return Ok(ObjectSearch::Building),
            ObjectIndexSnapshot::Failed(error) => return Ok(ObjectSearch::Failed { error }),
            ObjectIndexSnapshot::Ready(index) => index,
        };

        let result = index.search(&query, overtaken);
        tracing::debug!(
            query = %query,
            hits = result.hits.len(),
            total = result.total,
            superseded = result.superseded,
            "Searched the bin object index"
        );
        Ok(ObjectSearch::Ready(result))
    })
    .await
}

/// What the index holds for a set of object hashes, given the slot the index is in.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum DeclaredObjects {
    /// Nothing has warmed the index, or the switch that gates it is off.
    Absent,
    /// A build is running. The answer is on its way.
    Building,
    /// The last build failed, and the next warm retries it.
    Failed { error: AppErrorResponse },
    /// By the object's hash, `0x` and eight hex digits. A hash nothing declares is absent.
    Ready {
        objects: HashMap<String, DeclaredObject>,
    },
}

/// Every declaration of each of `object_hashes` the install holds, by hash.
///
/// Answers for the slot the index is in. The project rows say nothing about
/// overrides while it is absent, and an object tab offers the build.
#[tauri::command]
pub async fn declared_objects(
    object_hashes: Vec<String>,
    app_handle: AppHandle,
) -> IpcResult<DeclaredObjects> {
    off_thread(move || {
        let index = match app_handle.state::<ObjectIndexState>().snapshot()? {
            ObjectIndexSnapshot::Absent => return Ok(DeclaredObjects::Absent),
            ObjectIndexSnapshot::Building => return Ok(DeclaredObjects::Building),
            ObjectIndexSnapshot::Failed(error) => return Ok(DeclaredObjects::Failed { error }),
            ObjectIndexSnapshot::Ready(index) => index,
        };
        let objects = object_hashes
            .into_iter()
            .filter_map(|text| {
                let declared = index.declared(parse_hash(&text)?)?;
                Some((text, declared))
            })
            .collect();
        Ok(DeclaredObjects::Ready { objects })
    })
    .await
}

/// Resolve the index's names again out of the tables a sync just installed.
///
/// The rows are the install's and stay. A slot that holds no ready index is
/// left alone.
pub fn rename_after_sync(app: &AppHandle) {
    let cache = match HashtableCache::shared() {
        Ok(cache) => cache,
        Err(e) => {
            tracing::debug!("No hashtable cache to rename the object index from: {e}");
            return;
        }
    };
    let wad = match app.state::<Arc<WadPathResolverState>>().get() {
        Ok(wad) => wad,
        Err(e) => {
            tracing::warn!("Could not open the WAD tables to rename the object index: {e}");
            return;
        }
    };
    let bin = cache.bin_tables();
    let names = CacheNames::new(&bin, &wad);
    if let Err(e) = app
        .state::<ObjectIndexState>()
        .rename(|index| index.named(&names))
    {
        tracing::warn!("Could not rename the object index after a hashtable sync: {e}");
    }
}

#[cfg(test)]
mod tests;
