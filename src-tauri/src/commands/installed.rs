//! The installed game as the bin editor and the viewers read it.

use std::sync::Arc;

use crate::error::AppResult;
use crate::services::objects::index::ObjectIndexState;
use crate::state::SettingsState;
use ltk_hash::BinHash;
use ltk_manager_core::bin_document::{GameCopy, RowNames};
use ltk_manager_core::game_wads::WadCache;
use ltk_manager_core::hashtables::{BinHashTablesState, WadPathResolverState};
use ltk_manager_core::meta_schema::{self, MetaSchema};
use ltk_manager_core::object_index::{CacheNames, ObjectIndexSnapshot};
use ltk_manager_core::problems::GameBuild;
use tauri::{AppHandle, Manager};

/// The installed game as a declared document reads it: the shared tables for names, and
/// the object index for an entry a reference names.
pub(crate) struct InstalledGame(pub(crate) AppHandle);

impl GameCopy for InstalledGame {
    /// An index that is not ready answers no entry.
    fn declaring_chunk(&self, entry: BinHash) -> AppResult<Option<Vec<u8>>> {
        let ObjectIndexSnapshot::Ready(index) = self.0.state::<ObjectIndexState>().snapshot()
        else {
            return Ok(None);
        };
        let Some(first) = index
            .declared(entry)
            .and_then(|declared| declared.declarations.into_iter().next())
        else {
            return Ok(None);
        };
        let config = self.0.state::<SettingsState>().config();
        first
            .asset
            .read(&config, &self.0.state::<WadCache>())
            .map(Some)
    }

    fn with_names(&self, read: &mut dyn FnMut(&dyn RowNames)) {
        let bin = self.0.state::<BinHashTablesState>().get();
        let wad = self.0.state::<Arc<WadPathResolverState>>().get();
        read(&CacheNames::new(&bin, &wad));
    }
}

/// The shared meta schema and the installed game's content build, which keys every
/// answer read out of it.
pub(crate) fn installed_schema(app_handle: &AppHandle) -> (Arc<MetaSchema>, Option<GameBuild>) {
    let config = app_handle.state::<SettingsState>().config();
    let build = GameBuild::installed(&config);
    (meta_schema::shared(build), build)
}
