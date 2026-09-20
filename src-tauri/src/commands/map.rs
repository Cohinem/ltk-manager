//! The map backdrop's read: one map's materials, placed against a project first.

use super::document_assets::with_resolution;
use super::off_thread;
use crate::error::IpcResult;
use crate::state::SettingsState;
use ltk_manager_core::bin_document::{BinDocument, BinDocumentId};
use ltk_manager_core::game_wads::WadCache;
use ltk_manager_core::map::{resolve_map, unresolved_map, MapModel, MapPath};
use ltk_manager_core::material::SHADER_DEFS_PATH;
use ltk_manager_core::preview::AssetRef;
use tauri::{AppHandle, Manager};

/// The materials a map's submeshes name, as a backdrop draws them.
///
/// `map` is `MapContainer.mapPath`, an entry path such as
/// `Maps/MapGeometry/Map11/Base_SRX`, and `materials` are the entry paths the map's own
/// `LTKM` buffer carries, answered one for one and in that order. `document` names any
/// open document of the project whose layer answers first, and none resolves against the
/// install alone.
///
/// A map whose `.materials.bin` cannot be read leaves every material unresolved rather
/// than failing the read, which draws the map flat.
#[tauri::command]
#[specta::specta]
pub async fn read_map(
    document: Option<BinDocumentId>,
    map: MapPath,
    materials: Vec<String>,
    app_handle: AppHandle,
) -> IpcResult<MapModel> {
    off_thread(move || {
        let config = app_handle.state::<SettingsState>().config();
        with_resolution(&app_handle, document, |names, assets| {
            let wads = app_handle.state::<WadCache>();
            let read = |asset: &AssetRef| match asset
                .read(&config, &wads)
                .and_then(|bytes| Ok(BinDocument::parse(bytes)?))
            {
                Ok(bin) => Some(bin),
                Err(e) => {
                    tracing::debug!(?asset, "Passed over a map bin: {e}");
                    None
                }
            };
            let Some(bin) = assets.locate(&map.materials()).and_then(|a| read(&a)) else {
                return Ok(unresolved_map(&materials));
            };
            let shaders = assets.locate(SHADER_DEFS_PATH).and_then(|a| read(&a));
            Ok(resolve_map(
                &bin,
                &materials,
                names,
                assets,
                shaders.as_ref(),
            ))
        })
    })
    .await
}
