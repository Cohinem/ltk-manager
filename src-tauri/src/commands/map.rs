//! The map backdrop's reads: one map's materials, placed against a project first, and
//! the particles its open `.materials.bin` stands.

use super::document_assets::{parse_entry, with_resolution};
use super::off_thread;
use crate::error::IpcResult;
use crate::state::SettingsState;
use ltk_manager_core::bin_document::{BinDocument, BinDocumentId, BinDocuments};
use ltk_manager_core::game_wads::WadCache;
use ltk_manager_core::map::{
    map_characters, map_particles, map_variants, resolve_map, unresolved_map, MapCharacter,
    MapModel, MapParticle, MapPath, MapVariant,
};
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

/// Every particle the open `.materials.bin` under `document` stands in its map.
///
/// The systems they link are objects of the same document, so `read_vfx_system` answers
/// each against the handle this was asked with.
#[tauri::command]
#[specta::specta]
pub async fn read_map_particles(
    document: BinDocumentId,
    app_handle: AppHandle,
) -> IpcResult<Vec<MapParticle>> {
    off_thread(move || {
        let open = app_handle.state::<BinDocuments>().document(document)?;
        Ok(map_particles(&open))
    })
    .await
}

/// Every character the open `.materials.bin` under `document` stands in its map.
///
/// Each names its skin by entry path, which lives in the character's own skin bin rather
/// than in this document.
#[tauri::command]
#[specta::specta]
pub async fn read_map_characters(
    document: BinDocumentId,
    app_handle: AppHandle,
) -> IpcResult<Vec<MapCharacter>> {
    off_thread(move || {
        let open = app_handle.state::<BinDocuments>().document(document)?;
        Ok(map_characters(&open))
    })
    .await
}

/// The maps the `Map`, `MapSkin` or `MapContainer` at `entry` draws.
///
/// Empty for a skin that links no container and for an object of any other class.
#[tauri::command]
#[specta::specta]
pub async fn read_map_variants(
    document: BinDocumentId,
    entry: String,
    app_handle: AppHandle,
) -> IpcResult<Vec<MapVariant>> {
    off_thread(move || {
        let entry = parse_entry(&entry)?;
        let open = app_handle.state::<BinDocuments>().document(document)?;
        Ok(map_variants(&open, entry))
    })
    .await
}
