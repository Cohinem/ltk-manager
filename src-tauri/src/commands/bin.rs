//! The bin viewer's document: open it, read the rows under one node, close it.
//!
//! The tree stays in [`BinDocuments`] (ADR-0026). A call carries the id the open
//! answered and an address in the wire form of ADR-0027.

use std::sync::Arc;

use super::off_thread;
use crate::error::{AppError, IpcResult};
use crate::state::SettingsState;
use ltk_manager_core::bin_document::{BinDocumentHandle, BinDocumentId, BinDocuments, BinRows};
use ltk_manager_core::game_wads::WadCache;
use ltk_manager_core::hashtables::{BinHashTablesState, WadPathResolverState};
use ltk_manager_core::object_index::{parse_hash, CacheNames};
use ltk_manager_core::preview::AssetRef;
use tauri::{AppHandle, Manager};

/// Parse `asset` as a bin and keep it open, answering the header and the root rows.
#[tauri::command]
pub async fn bin_open(asset: AssetRef, app_handle: AppHandle) -> IpcResult<BinDocumentHandle> {
    off_thread(move || {
        let config = app_handle.state::<SettingsState>().config()?;
        let bytes = asset.read(&config, &app_handle.state::<WadCache>())?;
        let store = app_handle.state::<BinDocuments>();
        let document = store.open(&bytes)?;

        let bin = app_handle.state::<BinHashTablesState>().get()?;
        let wad = app_handle.state::<Arc<WadPathResolverState>>().get()?;
        let names = CacheNames::new(&bin, &wad);
        store.read(document, |open| {
            Ok(BinDocumentHandle {
                document,
                header: open.header(),
                rows: open.roots(&names),
            })
        })
    })
    .await
}

/// The rows under one node of an open document, `offset` in and at most `limit` of them.
///
/// `entry` is the object's hash as `0x` and eight hex digits. `path` is the wire form
/// of the property path, empty for the object itself.
#[tauri::command]
pub async fn bin_children(
    document: BinDocumentId,
    entry: String,
    path: String,
    offset: usize,
    limit: usize,
    app_handle: AppHandle,
) -> IpcResult<BinRows> {
    off_thread(move || {
        let entry = parse_hash(&entry)
            .ok_or_else(|| AppError::ValidationFailed(format!("Not an object hash: {entry}")))?;
        let bin = app_handle.state::<BinHashTablesState>().get()?;
        let wad = app_handle.state::<Arc<WadPathResolverState>>().get()?;
        let names = CacheNames::new(&bin, &wad);
        app_handle.state::<BinDocuments>().read(document, |open| {
            Ok(open.children(entry, &path, offset, limit, &names)?)
        })
    })
    .await
}

/// Drop an open document. An id that is not open is left as it is.
#[tauri::command]
pub fn bin_close(document: BinDocumentId, app_handle: AppHandle) -> IpcResult<()> {
    app_handle.state::<BinDocuments>().close(document).into()
}
