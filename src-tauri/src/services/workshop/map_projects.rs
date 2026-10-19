//! Creates map projects. Per "Starting a map" in docs/ux/MAP_EDITOR.md.

use crate::error::{AppError, AppResult, IpcResult};
use crate::services::shared::document_assets::with_resolution;
use crate::services::shared::{archive_of, off_thread, read_asset, read_bin};
use crate::state::SettingsState;
use crate::workshop::{CreateProjectArgs, ProjectSource, WorkshopProject, WorkshopState};
use fs_err as fs;
use ltk_hash::{BinHash, Hash as _};
use ltk_manager_assets::hashtables::WadPathResolverState;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_base::hashing::HexBinHash;
use ltk_manager_base::utils::fs::atomic_write;
use ltk_manager_bin::bin_document::{AssetLookup, BinDocument};
use ltk_manager_game::map::{
    custom_skin_path, map_skin_containers, moved_container, shipping_bin_path,
    skin_link_declarations, state_meshes, MapPath, MapSkinContainer,
};
use ltk_manager_workshop::ProjectDir;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// The map ids that map projects support: Summoner's Rift, Howling Abyss and Arena.
const MAPS: [&str; 3] = ["Map11", "Map12", "Map30"];

/// The layer that receives the map files and declarations of a new project.
const BASE_LAYER: &str = "base";

/// A supported map and its skins that link a shipped container.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct MapStart {
    /// The map id, such as `Map11`.
    pub map: String,
    pub skins: Vec<MapSkinContainer>,
}

/// The initial content of a map project.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum MapStartingPoint {
    /// Nothing until the first edit.
    Shipped,
    /// A copy of the skin's container, and declarations that link every skin to it.
    Skin,
    /// A copy of the skin's container with only the meshes that have a controller or a region,
    /// and the same declarations.
    Geometry,
}

/// A created map project and the container that its map shell opens.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct MapProject {
    pub project: WorkshopProject,
    pub container: MapProjectContainer,
}

/// The `MapContainer` object that a new map project opens.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct MapProjectContainer {
    /// The `.materials.bin` that declares the container.
    pub asset: AssetRef,
    /// The container's path hash, `0x` and eight hex digits.
    pub entry: String,
    pub path: MapPath,
    /// The path of the `.materials.bin`.
    pub file: String,
}

/// Lists the supported maps with each skin whose `.materials.bin` and `.mapgeo` are installed.
/// Skips a map whose bin is missing or fails to read.
#[tauri::command]
#[specta::specta]
pub async fn list_map_starts(app_handle: AppHandle) -> IpcResult<Vec<MapStart>> {
    off_thread(move || {
        with_resolution(&app_handle, None, |_, assets| {
            Ok(MAPS
                .iter()
                .filter_map(|&map| {
                    let bin = match map_bin(&app_handle, assets, map) {
                        Ok(bin) => bin,
                        Err(e) => {
                            tracing::warn!("Skipped {map} in the map project list: {e}");
                            return None;
                        }
                    };
                    let skins = map_skin_containers(&bin)
                        .into_iter()
                        .filter(|skin| {
                            assets.locate(&skin.container.materials()).is_some()
                                && assets.locate(&skin.container.geometry()).is_some()
                        })
                        .collect();

                    Some(MapStart {
                        map: map.to_owned(),
                        skins,
                    })
                })
                .collect())
        })
    })
    .await
}

/// Creates the project `args` on `map` from the container of `skin`, with the starting point
/// `start`.
///
/// A custom map skin writes its container to `Maps/MapGeometry/<map>/<project name>` in the base layer,
/// with declarations that link every skin of the map to it. Deletes the project if a file fails
/// to write.
#[tauri::command]
#[specta::specta]
pub async fn create_map_project(
    args: CreateProjectArgs,
    map: String,
    skin: String,
    start: MapStartingPoint,
    app_handle: AppHandle,
) -> IpcResult<MapProject> {
    off_thread(move || {
        if !MAPS.contains(&map.as_str()) {
            return Err(AppError::ValidationFailed(format!(
                "Map projects do not support {map}"
            )));
        }

        let config = app_handle.state::<SettingsState>().config();
        let resolver = app_handle.state::<Arc<WadPathResolverState>>().get();
        let slug = args.name.clone();
        let project = app_handle.state::<WorkshopState>().0.create_from(
            &config,
            ProjectSource::New { args },
            &resolver,
        )?;

        match fill(&app_handle, &project, &map, &skin, &slug, start) {
            Ok(container) => Ok(MapProject { project, container }),
            Err(e) => {
                if let Err(removal) = fs::remove_dir_all(&project.path) {
                    tracing::warn!(
                        "Could not delete the map project {}: {removal}",
                        project.path
                    );
                }
                Err(e)
            }
        }
    })
    .await
}

/// Writes the files of the starting point `start` into `project`, and returns its container.
fn fill(
    app: &AppHandle,
    project: &WorkshopProject,
    map: &str,
    skin: &str,
    slug: &str,
    start: MapStartingPoint,
) -> AppResult<MapProjectContainer> {
    with_resolution(app, None, |names, assets| {
        let bin = map_bin(app, assets, map)?;
        let from = map_skin_containers(&bin)
            .into_iter()
            .find(|each| each.skin == skin)
            .map(|each| each.container)
            .ok_or_else(|| AppError::Other(format!("{map} has no skin named {skin}")))?;
        let materials = locate(assets, &from.materials())?;
        if start == MapStartingPoint::Shipped {
            return Ok(container_of(materials, from));
        }

        let geometry = locate(assets, &from.geometry())?;
        let archive = archive_of(&materials)
            .ok_or_else(|| AppError::Other(format!("{} is not in an archive", from.materials())))?;
        let to = custom_skin_path(map, slug);
        let layer = Path::new(&project.path).join("content").join(BASE_LAYER);

        let mut geometry_bytes = read_asset(app, &geometry)?;
        if start == MapStartingPoint::Geometry {
            geometry_bytes =
                state_meshes(&geometry_bytes).map_err(|e| AppError::Other(e.to_string()))?;
        }
        write(&layer.join(&archive).join(to.geometry()), &geometry_bytes)?;
        write(
            &layer.join(&archive).join(to.materials()),
            &moved_container(&read_asset(app, &materials)?, &from, &to)?,
        )?;
        write(
            &layer.join("game_data.yaml"),
            skin_link_declarations(&bin, &shipping_bin_path(map), &to, names).as_bytes(),
        )?;
        ProjectDir::open(&project.path)?.declare_entry_names(&[to.as_str()])?;

        let asset = AssetRef::Layer {
            project: project.path.clone(),
            layer: BASE_LAYER.to_owned(),
            path: format!("{archive}/{}", to.materials()),
        };
        Ok(container_of(asset, to))
    })
}

fn map_bin(app: &AppHandle, assets: &dyn AssetLookup, map: &str) -> AppResult<BinDocument> {
    read_bin(app, &locate(assets, &shipping_bin_path(map))?)
}

fn locate(assets: &dyn AssetLookup, path: &str) -> AppResult<AssetRef> {
    assets
        .locate(path)
        .ok_or_else(|| AppError::Other(format!("The game install does not contain {path}")))
}

fn container_of(asset: AssetRef, path: MapPath) -> MapProjectContainer {
    MapProjectContainer {
        asset,
        entry: HexBinHash::from(BinHash::hash_str(path.as_str())).to_string(),
        file: path.materials(),
        path,
    }
}

fn write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    atomic_write(path, bytes)?;
    Ok(())
}
