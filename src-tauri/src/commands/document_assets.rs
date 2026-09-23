//! What a read of one open document resolves against: the names its hashes carry, and
//! where the files it names live.

use std::sync::Arc;

use super::game_index::built_game_index;
use crate::error::{AppError, AppResult};
use crate::state::SettingsState;
use ltk_hash::{BinHash, Hash as _, WadHash};
use ltk_manager_core::bin_document::{
    AssetLookup, BinDocument, BinDocumentId, BinDocuments, ProjectNames, RowNames,
};
use ltk_manager_core::game_index::GameIndex;
use ltk_manager_core::hashtables::{BinHashTablesState, WadPathResolverState};
use ltk_manager_core::object_index::{parse_hash, CacheNames};
use ltk_manager_core::preview::AssetRef;
use ltk_manager_core::workshop::LayerChunks;
use tauri::{AppHandle, Manager};

/// An object hash a command was handed, `0x` and eight hex digits.
pub(super) fn parse_entry(entry: &str) -> AppResult<BinHash> {
    parse_hash(entry)
        .ok_or_else(|| AppError::ValidationFailed(format!("Not an object hash: {entry}")))
}

/// Run `read` over the open document `document`, with the names and the asset lookup it
/// resolves against, and with the document store unlocked.
///
/// A name field resolves against the document's own project first and the install's
/// game index second, and a read is the first to build that index where nothing has. An
/// install the index cannot be built over leaves every asset unplaced rather than failing
/// the read.
pub(super) fn read_resolved<T>(
    app: &AppHandle,
    document: BinDocumentId,
    read: impl FnOnce(&BinDocument, &dyn RowNames, &dyn AssetLookup) -> AppResult<T>,
) -> AppResult<T> {
    with_resolution(app, Some(document), |names, assets| {
        let open = app.state::<BinDocuments>().document(document)?;
        read(&open, names, assets)
    })
}

/// Run `resolve` with the names and the asset lookup a read of `document` resolves
/// against, and without the document store held.
///
/// For a read that also reads files the document names, which must not hold the store
/// while the archive is read. No document resolves against the install alone, which is
/// what a viewport drawing outside a project does.
pub(super) fn with_resolution<T>(
    app: &AppHandle,
    document: Option<BinDocumentId>,
    resolve: impl FnOnce(&dyn RowNames, &dyn AssetLookup) -> AppResult<T>,
) -> AppResult<T> {
    let bin = app.state::<BinHashTablesState>().get();
    let wad = app.state::<Arc<WadPathResolverState>>().get();
    let cache = CacheNames::new(&bin, &wad);
    /* Chunks are the project's rather than the document's, so any open document of it
    answers, and an absent one answers empty. */
    let chunks = document.map_or_else(
        || Arc::new(LayerChunks::default()),
        |document| app.state::<BinDocuments>().chunks_of(document),
    );
    let names = ProjectNames::new(&cache, &chunks);
    resolve(&names, &assets_over(app, &chunks))
}

/// Run `locate` with the asset lookup of the project `near` sits in.
///
/// For a file a tab opens with no document open beside it, such as a map's geometry. An
/// asset outside any project resolves against the install alone.
pub(super) fn with_assets_near<T>(
    app: &AppHandle,
    near: &AssetRef,
    locate: impl FnOnce(&dyn AssetLookup) -> T,
) -> T {
    let chunks = LayerChunks::of(near);
    locate(&assets_over(app, &chunks))
}

fn assets_over<'a>(app: &AppHandle, chunks: &'a LayerChunks) -> DocumentAssets<'a> {
    let config = app.state::<SettingsState>().config();
    DocumentAssets {
        chunks,
        index: built_game_index(app, &config)
            .map(|(index, _)| index)
            .inspect_err(|e| tracing::debug!("No game index for a document's assets: {e}"))
            .ok(),
    }
}

/// Where the bytes of a name a document carries live.
///
/// The layer's copy answers before the install's, which is the order a `file` link is
/// decided in ("Links" in docs/ux/BIN_EDITOR.md).
struct DocumentAssets<'a> {
    chunks: &'a LayerChunks,
    index: Option<Arc<GameIndex>>,
}

impl AssetLookup for DocumentAssets<'_> {
    /// The tree answers a path the tables name, and the unnamed group answers the
    /// rest by the path's hash, which is how the game reaches a chunk either way.
    fn locate(&self, path: &str) -> Option<AssetRef> {
        if let Some(asset) = self.chunks.asset_at(path) {
            return Some(asset.clone());
        }
        /* Lowercase because that is the one spelling a resolved WAD path has. */
        let index = self.index.as_ref()?;
        let file = index
            .file_at(&path.to_lowercase())
            .or_else(|| index.unnamed_at(WadHash::hash_str(path).0))?;
        Some(AssetRef::GameChunk {
            wad: file.wad,
            path_hash: file.path_hash,
            project: None,
        })
    }

    fn locate_chunk(&self, hash: WadHash) -> Option<AssetRef> {
        if let Some(asset) = self.chunks.asset_of_chunk(hash) {
            return Some(asset.clone());
        }
        let file = self.index.as_ref()?.unnamed_at(hash.0)?;
        Some(AssetRef::GameChunk {
            wad: file.wad,
            path_hash: file.path_hash,
            project: None,
        })
    }
}
