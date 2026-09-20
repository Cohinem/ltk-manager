//! The skin preview's reads: one skin with its files and effects placed, one animation
//! graph with its maps, and one clip's header.

use super::document_assets::{parse_entry, read_resolved, with_resolution};
use super::off_thread;
use crate::error::IpcResult;
use crate::state::SettingsState;
use ltk_manager_core::bin_document::{BinDocument, BinDocumentId, BinDocuments};
use ltk_manager_core::game_wads::WadCache;
use ltk_manager_core::material::SHADER_DEFS_PATH;
use ltk_manager_core::preview::{clip_header, AssetRef, ClipHeader};
use ltk_manager_core::skin::{
    graph_at, resolve_skin, search_linked, search_linked_materials, search_linked_systems,
    AnimationGraph, GraphRead, SkinModel,
};
use tauri::{AppHandle, Manager};

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
        let config = app_handle.state::<SettingsState>().config();
        read_resolved(&app_handle, document, |open, names, assets| {
            let wads = app_handle.state::<WadCache>();
            let mut read = |asset: &AssetRef| match asset
                .read(&config, &wads)
                .and_then(|bytes| Ok(BinDocument::parse(bytes)?))
            {
                Ok(bin) => Some(bin),
                Err(e) => {
                    tracing::debug!(?asset, "Passed over a linked bin: {e}");
                    None
                }
            };
            let shaders = assets
                .locate(SHADER_DEFS_PATH)
                .and_then(|asset| read(&asset));
            let mut model = resolve_skin(open, entry, names, assets, shaders.as_ref())?;
            let linked: Vec<AssetRef> = open
                .dependencies()
                .iter()
                .filter_map(|path| assets.locate(path))
                .collect();
            search_linked_materials(
                &mut model,
                linked.clone(),
                names,
                assets,
                shaders.as_ref(),
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
        let config = app_handle.state::<SettingsState>().config();
        with_resolution(&app_handle, Some(document), |names, assets| {
            let open = app_handle.state::<BinDocuments>().document(document)?;
            let linked = match graph_at(&open, entry, names, assets)? {
                GraphRead::Found(graph) => return Ok(graph),
                GraphRead::Linked(linked) => linked,
            };

            let wads = app_handle.state::<WadCache>();
            let mut read = |asset: &AssetRef| match asset
                .read(&config, &wads)
                .and_then(|bytes| Ok(BinDocument::parse(bytes)?))
            {
                Ok(bin) => Some(bin),
                Err(e) => {
                    tracing::debug!(?asset, "Passed over a linked bin: {e}");
                    None
                }
            };
            Ok(search_linked(linked, entry, names, assets, &mut read)?)
        })
    })
    .await
}

/// The rate and the length of one `.anm`, which the clip table's rate column reads.
#[tauri::command]
#[specta::specta]
pub async fn read_clip_header(asset: AssetRef, app_handle: AppHandle) -> IpcResult<ClipHeader> {
    let config = app_handle.state::<SettingsState>().config();

    off_thread(move || {
        let bytes = asset.read(&config, &app_handle.state::<WadCache>())?;
        Ok(clip_header(&bytes)?)
    })
    .await
}
