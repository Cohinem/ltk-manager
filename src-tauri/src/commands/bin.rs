//! The bin viewer's document: open it, read the rows under one node, close it.
//!
//! The tree stays in [`BinDocuments`] (ADR-0026). A call carries the id the open
//! answered and an address in the wire form of ADR-0027.

use std::sync::Arc;

use super::off_thread;
use crate::error::{AppError, AppResult, IpcResult};
use crate::state::SettingsState;
use ltk_manager_core::bin_document::{BinDocumentHandle, BinDocumentId, BinDocuments, BinRows};
use ltk_manager_core::game_wads::WadCache;
use ltk_manager_core::hashtables::{BinHashTablesState, WadPathResolverState};
use ltk_manager_core::meta_schema::{self, ClassSchema};
use ltk_manager_core::object_index::{parse_hash, CacheNames};
use ltk_manager_core::preview::AssetRef;
use ltk_manager_core::problems::GameBuild;
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
/// of the property path, empty for the object itself. Every row carries what the meta
/// schema declares for its field at the install's build.
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
        let build = installed_build(&app_handle)?;
        let schema = meta_schema::shared(build);
        app_handle.state::<BinDocuments>().read(document, |open| {
            Ok(open.children(entry, &path, offset, limit, &names, Some(schema.at(build)))?)
        })
    })
    .await
}

/// One class's fields and their declared kinds at the install's build.
///
/// Read out of the meta schema. `None` for a class the schema does not describe.
/// `class_hash` is `0x` and eight hex digits.
#[tauri::command]
pub async fn class_schema(
    class_hash: String,
    app_handle: AppHandle,
) -> IpcResult<Option<ClassSchema>> {
    off_thread(move || {
        let class = parse_hash(&class_hash)
            .ok_or_else(|| AppError::ValidationFailed(format!("Not a class hash: {class_hash}")))?;
        let build = installed_build(&app_handle)?;
        Ok(meta_schema::shared(build).class_schema(class, build))
    })
    .await
}

/// The content build of the installed game, which every schema answer is keyed on.
fn installed_build(app_handle: &AppHandle) -> AppResult<Option<GameBuild>> {
    let config = app_handle.state::<SettingsState>().config()?;
    Ok(GameBuild::installed(&config))
}

/// Drop an open document. An id that is not open is left as it is.
#[tauri::command]
pub fn bin_close(document: BinDocumentId, app_handle: AppHandle) -> IpcResult<()> {
    app_handle.state::<BinDocuments>().close(document).into()
}
