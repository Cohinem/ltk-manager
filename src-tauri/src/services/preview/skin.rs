//! The skin preview's reads: one skin with its files and effects placed, one animation
//! graph with its maps, and one clip's header.

use std::path::Path;

use super::material::shader_defs;
use crate::error::IpcResult;
use crate::services::shared::document_assets::{parse_entry, read_resolved, with_resolution};
use crate::services::shared::{linked_assets, linked_reader, read_asset};
use crate::services::shared::{off_thread, WriteTarget};
use ltk_manager_assets::preview::{clip_header, AssetRef, ClipHeader};
use ltk_manager_base::error::AppError;
use ltk_manager_bin::bin_document::{BinDocumentError, BinDocumentId, BinDocuments};
use ltk_manager_bin::sandbox::SandboxState;
use ltk_manager_game::skin::{
    bake_mesh_tangents, graph_at, resolve_skin, save_colliders, search_linked,
    search_linked_materials, search_linked_systems, AnimationGraph, ColliderShapes, GraphRead,
    SkinModel,
};
use tauri::{AppHandle, Manager};

/// Tangents saved into the viewed skin's project-layer mesh.
///
/// # Errors
/// Fails when the skin or layer mesh is unavailable, baking fails, or the write fails.
#[tauri::command]
#[specta::specta]
pub async fn bake_skin_tangents(
    document: BinDocumentId,
    entry: String,
    app_handle: AppHandle,
) -> IpcResult<AssetRef> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        let skin = app_handle
            .state::<BinDocuments>()
            .asset_of(document)
            .ok_or(BinDocumentError::NotOpen(document))?;
        let mesh = read_resolved(&app_handle, document, |open, names, assets| {
            let model = resolve_skin(open, entry, names, assets, None)?;
            model.mesh.and_then(|mesh| mesh.asset).ok_or_else(|| {
                AppError::ValidationFailed("The skin has no resolved mesh".to_owned())
            })
        })?;

        bake_mesh_tangents(&skin, &mesh)?;

        Ok(mesh)
    })
    .await
}

/// The collision shapes of a dynamics chain saved as the file at the game path `path`, in
/// the layer the document `document` writes to and the archive folder of its skin.
///
/// Answers the saved file, which the project resolves `path` to from then on.
///
/// # Errors
/// Fails when the document is closed, opens in no project or writes to no layer, for a skin
/// in no archive, for a path that leaves its archive, and for a failed write.
#[tauri::command]
#[specta::specta]
pub async fn save_skin_colliders(
    document: BinDocumentId,
    path: String,
    shapes: ColliderShapes,
    app_handle: AppHandle,
) -> IpcResult<AssetRef> {
    off_thread(move || {
        let target = WriteTarget::of(&app_handle.state::<BinDocuments>(), document)?;
        let archive = target.archive()?;
        let WriteTarget { project, layer, .. } = target;

        let saved = save_colliders(Path::new(&project), &layer, &archive, &path, &shapes)?;
        app_handle.state::<SandboxState>().invalidate(&project);

        Ok(AssetRef::Layer {
            project,
            layer,
            path: saved,
        })
    })
    .await
}

/// One skin of an open document, as a viewport draws it.
///
/// `entry` is the `SkinCharacterDataProperties` object's hash as `0x` and eight hex
/// digits. The shader defs are read beside the skin, the project's copy first, and a
/// read they refuse leaves every material on its own fields. A material or an effect
/// system the document does not declare is looked for through the files it links, as a
/// graph is.
#[tauri::command]
#[specta::specta]
pub async fn read_skin(
    document: BinDocumentId,
    entry: String,
    app_handle: AppHandle,
) -> IpcResult<SkinModel> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        read_resolved(&app_handle, document, |open, names, assets| {
            let mut read = linked_reader(&app_handle);
            let shaders = shader_defs(&app_handle, assets);
            let mut model = resolve_skin(open, entry, names, assets, shaders.as_deref())?;
            let linked: Vec<AssetRef> = linked_assets(open, assets);
            search_linked_materials(
                &mut model,
                linked.clone(),
                names,
                assets,
                shaders.as_deref(),
                &mut read,
            );
            search_linked_systems(&mut model, open, entry, linked, assets, &mut read);
            Ok(model)
        })
    })
    .await
}

/// One animation graph: its clips with their files placed, and the maps they key into.
///
/// `entry` is the `AnimationGraphData` object's hash as `0x` and eight hex digits. A
/// graph the open document does not declare is looked for through the files it links,
/// and a linked file that cannot be read is passed over.
#[tauri::command]
#[specta::specta]
pub async fn read_animation_graph(
    document: BinDocumentId,
    entry: String,
    app_handle: AppHandle,
) -> IpcResult<AnimationGraph> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        with_resolution(&app_handle, Some(document), |names, assets| {
            let open = app_handle.state::<BinDocuments>().document(document)?;
            let linked = match graph_at(&open, entry, names, assets)? {
                GraphRead::Found(graph) => return Ok(graph),
                GraphRead::Linked(linked) => linked,
            };

            let mut read = linked_reader(&app_handle);
            Ok(search_linked(linked, entry, names, assets, &mut read)?)
        })
    })
    .await
}

/// The rate and the length of one `.anm`, which the clip table's rate column reads.
#[tauri::command]
#[specta::specta]
pub async fn read_clip_header(asset: AssetRef, app_handle: AppHandle) -> IpcResult<ClipHeader> {
    off_thread(move || {
        let bytes = read_asset(&app_handle, &asset)?;
        Ok(clip_header(&bytes)?)
    })
    .await
}
