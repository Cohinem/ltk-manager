//! The bin editor's document: open it, read the rows under one node, edit a leaf, save
//! it, close it.
//!
//! The tree stays in [`BinDocuments`] (ADR-0026), one per asset, shared by the file
//! tab and the object tabs over it (ADR-0028). A call carries the id the open answered
//! and an address in the wire form of ADR-0027.

use std::sync::Arc;

use super::object_index::ObjectIndexState;
use super::off_thread;
use crate::error::{AppError, AppResult, IpcResult};
use crate::state::SettingsState;
use ltk_hash::BinHash;
use ltk_manager_core::bin_document::{
    AddableFields, BinDocumentHandle, BinDocumentId, BinDocuments, BinFindResult, BinRow, BinRows,
    ClassChoice, DeclareContext, DeclaredState, GameCopy, LeafValue, NewItem, NewProperty,
    ProjectNames, RowDeclaration, RowNames,
};
use ltk_manager_core::game_wads::WadCache;
use ltk_manager_core::hashtables::{BinHashTablesState, WadPathResolverState};
use ltk_manager_core::meta_schema::{self, ClassSchema, MetaSchema, PatchSchema};
use ltk_manager_core::object_index::{parse_hash, CacheNames, ObjectIndexSnapshot};
use ltk_manager_core::preview::AssetRef;
use ltk_manager_core::problems::GameBuild;
use ltk_manager_core::workshop::ProjectDir;
use tauri::{AppHandle, Manager};

/// The window an object open reads its properties under: every one of them. A class
/// declares tens of fields, and a page is for a container.
const WHOLE: usize = usize::MAX;

/// Hold `asset` open as a bin, answering the header and the rows at depth zero.
///
/// With no `entry`, the rows are one per object. With one, `0x` and eight hex digits,
/// the rows are that object's properties and the answer carries its header facts.
#[tauri::command]
#[specta::specta]
pub async fn bin_open(
    asset: AssetRef,
    entry: Option<String>,
    app_handle: AppHandle,
) -> IpcResult<BinDocumentHandle> {
    off_thread(move || {
        let entry = entry
            .map(|text| {
                parse_hash(&text).ok_or_else(|| {
                    AppError::ValidationFailed(format!("Not an object hash: {text}"))
                })
            })
            .transpose()?;

        let config = app_handle.state::<SettingsState>().config();
        let store = app_handle.state::<BinDocuments>();
        let read = || asset.read(&config, &app_handle.state::<WadCache>());
        let document = match &asset {
            AssetRef::GameChunk {
                path_hash,
                project: Some(project),
                ..
            } => {
                let chunk_hash = u64::from_str_radix(path_hash, 16).map_err(|_| {
                    AppError::InvalidPath(format!("Not a chunk path hash: {path_hash}"))
                })?;
                store.open_declared(asset.clone(), chunk_hash, || {
                    let (schema, build) = installed_schema(&app_handle);
                    let context = DeclareContext {
                        project: ProjectDir::open(project)?,
                        schema: PatchSchema::new(schema, build),
                        game: Arc::new(InstalledGame(app_handle.clone())),
                    };
                    Ok((read()?, context))
                })?
            }
            _ => store.open(asset.clone(), read)?,
        };

        let bin = app_handle.state::<BinHashTablesState>().get();
        let wad = app_handle.state::<Arc<WadPathResolverState>>().get();
        let cache = CacheNames::new(&bin, &wad);
        let chunks = store.chunks_of(document);
        let names = ProjectNames::new(&cache, &chunks);
        let (schema, build) = installed_schema(&app_handle);
        store.read(document, |open| {
            let read_only = open.read_only(&asset);
            let at = Some(schema.at(build));
            let (rows, object) = match entry {
                Some(entry) => (
                    open.children(entry, "", 0, WHOLE, &names, at)?.rows,
                    Some(open.object(entry, &names, at)?),
                ),
                None => (open.roots(&names, at), None),
            };
            Ok(BinDocumentHandle {
                document,
                header: open.header(&names),
                rows,
                object,
                read_only,
                declared: open.declared_state(),
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
#[specta::specta]
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
        let bin = app_handle.state::<BinHashTablesState>().get();
        let wad = app_handle.state::<Arc<WadPathResolverState>>().get();
        let cache = CacheNames::new(&bin, &wad);
        let chunks = app_handle.state::<BinDocuments>().chunks_of(document);
        let names = ProjectNames::new(&cache, &chunks);
        let (schema, build) = installed_schema(&app_handle);
        app_handle.state::<BinDocuments>().read(document, |open| {
            Ok(open.children(entry, &path, offset, limit, &names, Some(schema.at(build)))?)
        })
    })
    .await
}

/// Every row of an open document whose name or value holds `query`, in tree order.
///
/// `entry`, `0x` and eight hex digits, narrows the search to one object, which is what
/// an object tab draws. The project bar's `@` scope asks this of the active tab.
#[tauri::command]
#[specta::specta]
pub async fn bin_find(
    document: BinDocumentId,
    entry: Option<String>,
    query: String,
    app_handle: AppHandle,
) -> IpcResult<BinFindResult> {
    off_thread(move || {
        let entry = entry
            .map(|text| {
                parse_hash(&text).ok_or_else(|| {
                    AppError::ValidationFailed(format!("Not an object hash: {text}"))
                })
            })
            .transpose()?;
        let bin = app_handle.state::<BinHashTablesState>().get();
        let wad = app_handle.state::<Arc<WadPathResolverState>>().get();
        let cache = CacheNames::new(&bin, &wad);
        let chunks = app_handle.state::<BinDocuments>().chunks_of(document);
        let names = ProjectNames::new(&cache, &chunks);
        let (schema, build) = installed_schema(&app_handle);
        app_handle.state::<BinDocuments>().read(document, |open| {
            Ok(open.find(entry, &query, &names, Some(schema.at(build))))
        })
    })
    .await
}

/// The rows under each of several nodes of an open document, in the order asked.
///
/// The projected read of "The projected read" in docs/ux/BIN_EDITOR.md, which a class
/// layout and a value row use in place of one [`bin_children`] call per node. Each path
/// answers one page, a path reaching nothing answers an empty one, and a call past the
/// row cap is refused so the caller batches.
#[tauri::command]
#[specta::specta]
pub async fn bin_read(
    document: BinDocumentId,
    entry: String,
    paths: Vec<String>,
    app_handle: AppHandle,
) -> IpcResult<Vec<BinRows>> {
    off_thread(move || {
        let entry = parse_hash(&entry)
            .ok_or_else(|| AppError::ValidationFailed(format!("Not an object hash: {entry}")))?;
        let bin = app_handle.state::<BinHashTablesState>().get();
        let wad = app_handle.state::<Arc<WadPathResolverState>>().get();
        let cache = CacheNames::new(&bin, &wad);
        let chunks = app_handle.state::<BinDocuments>().chunks_of(document);
        let names = ProjectNames::new(&cache, &chunks);
        let (schema, build) = installed_schema(&app_handle);
        app_handle.state::<BinDocuments>().read(document, |open| {
            Ok(open.children_each(entry, &paths, &names, Some(schema.at(build)))?)
        })
    })
    .await
}

/// Set one leaf of an open document, answering the value it held.
///
/// `entry` is the object's hash as `0x` and eight hex digits, and `path` the wire form of
/// the leaf's property path. Every id over the asset reads the edit. Nothing reaches the
/// disk before [`bin_save`].
#[tauri::command]
#[specta::specta]
pub async fn bin_patch(
    document: BinDocumentId,
    entry: String,
    path: String,
    value: LeafValue,
    app_handle: AppHandle,
) -> IpcResult<LeafValue> {
    off_thread(move || {
        let entry = parse_hash(&entry)
            .ok_or_else(|| AppError::ValidationFailed(format!("Not an object hash: {entry}")))?;
        Ok(app_handle
            .state::<BinDocuments>()
            .patch(document, entry, &path, value)?)
    })
    .await
}

/// The fields the holder at `path` of an open document can take, out of the meta schema.
///
/// `path` is empty for the object itself. The fields are the ones the holder's class and
/// its bases declare at the install's build, less the ones the holder writes.
#[tauri::command]
#[specta::specta]
pub async fn bin_addable_fields(
    document: BinDocumentId,
    entry: String,
    path: String,
    app_handle: AppHandle,
) -> IpcResult<AddableFields> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        let (schema, build) = installed_schema(&app_handle);
        app_handle.state::<BinDocuments>().read(document, |open| {
            Ok(open.addable_fields(entry, &path, schema.at(build))?)
        })
    })
    .await
}

/// Add a property to the end of the holder at `path` of an open document.
///
/// A declared field starts at the schema's published default, and a custom one at its
/// kind's zero value. Nothing reaches the disk before [`bin_save`].
#[tauri::command]
#[specta::specta]
pub async fn bin_add_property(
    document: BinDocumentId,
    entry: String,
    path: String,
    property: NewProperty,
    app_handle: AppHandle,
) -> IpcResult<()> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        let (schema, build) = installed_schema(&app_handle);
        Ok(app_handle.state::<BinDocuments>().add_property(
            document,
            entry,
            &path,
            property,
            schema.at(build),
        )?)
    })
    .await
}

/// Take the property at `path` of an open document out of its holder.
///
/// The game reads the field's default in its place. Nothing reaches the disk before
/// [`bin_save`].
#[tauri::command]
#[specta::specta]
pub async fn bin_remove_property(
    document: BinDocumentId,
    entry: String,
    path: String,
    app_handle: AppHandle,
) -> IpcResult<()> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        Ok(app_handle
            .state::<BinDocuments>()
            .remove_property(document, entry, &path)?)
    })
    .await
}

/// The classes an item of the list, map or option at `path` can hold, or the pointer at it.
///
/// The classes its items hold come first, then the class the meta schema declares for the
/// field at the install's build, then the classes deriving from that one.
#[tauri::command]
#[specta::specta]
pub async fn bin_item_classes(
    document: BinDocumentId,
    entry: String,
    path: String,
    app_handle: AppHandle,
) -> IpcResult<Vec<ClassChoice>> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        let (schema, build) = installed_schema(&app_handle);
        app_handle.state::<BinDocuments>().read(document, |open| {
            Ok(open.item_classes(entry, &path, schema.at(build))?)
        })
    })
    .await
}

/// Put an item into the list, map or option at `path` of an open document, answering the
/// new item's path.
///
/// An embed naming no class takes the class the holder holds or the meta schema declares.
/// Nothing reaches the disk before [`bin_save`].
#[tauri::command]
#[specta::specta]
pub async fn bin_insert_item(
    document: BinDocumentId,
    entry: String,
    path: String,
    item: NewItem,
    app_handle: AppHandle,
) -> IpcResult<String> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        let (schema, build) = installed_schema(&app_handle);
        Ok(app_handle.state::<BinDocuments>().insert_item(
            document,
            entry,
            &path,
            item,
            schema.at(build),
        )?)
    })
    .await
}

/// Take the item at `path` of an open document out of its list, map or option.
#[tauri::command]
#[specta::specta]
pub async fn bin_remove_item(
    document: BinDocumentId,
    entry: String,
    path: String,
    app_handle: AppHandle,
) -> IpcResult<()> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        Ok(app_handle
            .state::<BinDocuments>()
            .remove_item(document, entry, &path)?)
    })
    .await
}

/// Move the item at `path` of an open document to `to` in its list, answering its new path.
#[tauri::command]
#[specta::specta]
pub async fn bin_move_item(
    document: BinDocumentId,
    entry: String,
    path: String,
    to: usize,
    app_handle: AppHandle,
) -> IpcResult<String> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        Ok(app_handle
            .state::<BinDocuments>()
            .move_item(document, entry, &path, to)?)
    })
    .await
}

/// Set the key of the map entry at `path` of an open document, answering its new path.
#[tauri::command]
#[specta::specta]
pub async fn bin_set_key(
    document: BinDocumentId,
    entry: String,
    path: String,
    key: String,
    app_handle: AppHandle,
) -> IpcResult<String> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        Ok(app_handle
            .state::<BinDocuments>()
            .set_key(document, entry, &path, &key)?)
    })
    .await
}

/// Give the null pointer at `path` of an open document a class, or set a pointer to null
/// where `class_name` is absent.
#[tauri::command]
#[specta::specta]
pub async fn bin_set_pointer(
    document: BinDocumentId,
    entry: String,
    path: String,
    class_name: Option<String>,
    app_handle: AppHandle,
) -> IpcResult<()> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        Ok(app_handle.state::<BinDocuments>().set_pointer(
            document,
            entry,
            &path,
            class_name.as_deref(),
        )?)
    })
    .await
}

/// The rows at depth zero of an open file, one per object, read again after an edit.
#[tauri::command]
#[specta::specta]
pub async fn bin_roots(document: BinDocumentId, app_handle: AppHandle) -> IpcResult<Vec<BinRow>> {
    off_thread(move || {
        let bin = app_handle.state::<BinHashTablesState>().get();
        let wad = app_handle.state::<Arc<WadPathResolverState>>().get();
        let cache = CacheNames::new(&bin, &wad);
        let chunks = app_handle.state::<BinDocuments>().chunks_of(document);
        let names = ProjectNames::new(&cache, &chunks);
        let (schema, build) = installed_schema(&app_handle);
        app_handle.state::<BinDocuments>().read(document, |open| {
            Ok(open.roots(&names, Some(schema.at(build))))
        })
    })
    .await
}

/// An object hash as `0x` and eight hex digits, or the validation failure naming the text.
fn parse_entry(text: &str) -> Result<ltk_hash::BinHash, AppError> {
    parse_hash(text)
        .ok_or_else(|| AppError::ValidationFailed(format!("Not an object hash: {text}")))
}

/// Write an open document's edits to its layer file, as a delta over the bytes it opened.
///
/// A document no patch touched writes nothing. ADR-0040.
#[tauri::command]
#[specta::specta]
pub async fn bin_save(document: BinDocumentId, app_handle: AppHandle) -> IpcResult<()> {
    off_thread(move || app_handle.state::<BinDocuments>().save(document)).await
}

/// Revert the latest edit of an open document's tree, answering whether one was held.
///
/// The file tab and the object tabs over one asset share the tree and its stack.
#[tauri::command]
#[specta::specta]
pub async fn bin_undo(document: BinDocumentId, app_handle: AppHandle) -> IpcResult<bool> {
    off_thread(move || Ok(app_handle.state::<BinDocuments>().undo(document)?)).await
}

/// Apply the latest undone edit of an open document's tree again, answering whether one
/// was held.
#[tauri::command]
#[specta::specta]
pub async fn bin_redo(document: BinDocumentId, app_handle: AppHandle) -> IpcResult<bool> {
    off_thread(move || Ok(app_handle.state::<BinDocuments>().redo(document)?)).await
}

/// Read an open document's file again, dropping the edits its tree held.
///
/// Every id over the asset reads the file as it is on disk.
#[tauri::command]
#[specta::specta]
pub async fn bin_reload(document: BinDocumentId, app_handle: AppHandle) -> IpcResult<()> {
    off_thread(move || {
        let config = app_handle.state::<SettingsState>().config();
        app_handle
            .state::<BinDocuments>()
            .reload(document, |asset| {
                asset.read(&config, &app_handle.state::<WadCache>())
            })
    })
    .await
}

/// One class's fields and their declared kinds at the install's build.
///
/// Read out of the meta schema. `None` for a class the schema does not describe.
/// `class_hash` is `0x` and eight hex digits.
#[tauri::command]
#[specta::specta]
pub async fn class_schema(
    class_hash: String,
    app_handle: AppHandle,
) -> IpcResult<Option<ClassSchema>> {
    off_thread(move || {
        let class = parse_hash(&class_hash)
            .ok_or_else(|| AppError::ValidationFailed(format!("Not a class hash: {class_hash}")))?;
        let (schema, build) = installed_schema(&app_handle);
        Ok(schema.class_schema(class, build))
    })
    .await
}

/// What the document says beside its rows: the layer it declares into, the project's
/// layers, and the rows a declaration of that layer touches. `None` for a document that
/// declares nothing. ADR-0042.
#[tauri::command]
#[specta::specta]
pub async fn bin_declared(
    document: BinDocumentId,
    app_handle: AppHandle,
) -> IpcResult<Option<DeclaredState>> {
    off_thread(move || {
        Ok(app_handle
            .state::<BinDocuments>()
            .declared_state(document)?)
    })
    .await
}

/// Write the edits that follow on a declared document to `layer`. ADR-0042.
#[tauri::command]
#[specta::specta]
pub async fn bin_declare_into(
    document: BinDocumentId,
    layer: String,
    app_handle: AppHandle,
) -> IpcResult<DeclaredState> {
    off_thread(move || {
        Ok(app_handle
            .state::<BinDocuments>()
            .declare_into(document, &layer)?)
    })
    .await
}

/// The row at `path` under `entry` as the declaration and the game-copy reference an author
/// would write for it, from any open bin. ADR-0042.
#[tauri::command]
#[specta::specta]
pub async fn bin_row_declaration(
    document: BinDocumentId,
    entry: String,
    path: String,
    app_handle: AppHandle,
) -> IpcResult<RowDeclaration> {
    off_thread(move || {
        let entry = parse_hash(&entry)
            .ok_or_else(|| AppError::ValidationFailed(format!("Not an object hash: {entry}")))?;
        let bin = app_handle.state::<BinHashTablesState>().get();
        let wad = app_handle.state::<Arc<WadPathResolverState>>().get();
        let names = CacheNames::new(&bin, &wad);
        app_handle.state::<BinDocuments>().read(document, |open| {
            Ok(open.row_declaration(entry, &path, &names)?)
        })
    })
    .await
}

/// Declare the row at `path` under `entry` of a declared document as `reference`, a game-copy
/// reference, or with `merge` add it to the row's list or map. ADR-0042.
#[tauri::command]
#[specta::specta]
pub async fn bin_declare_reference(
    document: BinDocumentId,
    entry: String,
    path: String,
    reference: String,
    merge: bool,
    app_handle: AppHandle,
) -> IpcResult<()> {
    off_thread(move || {
        let entry = parse_hash(&entry)
            .ok_or_else(|| AppError::ValidationFailed(format!("Not an object hash: {entry}")))?;
        Ok(app_handle
            .state::<BinDocuments>()
            .declare_reference(document, entry, &path, &reference, merge)?)
    })
    .await
}

/// The installed game as a declared document reads it: the shared tables for names, and
/// the object index for an entry a reference names.
struct InstalledGame(AppHandle);

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
pub(super) fn installed_schema(app_handle: &AppHandle) -> (Arc<MetaSchema>, Option<GameBuild>) {
    let config = app_handle.state::<SettingsState>().config();
    let build = GameBuild::installed(&config);
    (meta_schema::shared(build), build)
}

/// Drop one id. Its asset leaves the store with its last id.
#[tauri::command]
#[specta::specta]
pub fn bin_close(document: BinDocumentId, app_handle: AppHandle) -> IpcResult<()> {
    app_handle.state::<BinDocuments>().close(document);
    IpcResult::ok(())
}
