//! Builds the container, the skin link declarations and the geometry of a custom map skin.

use std::io::Cursor;

use ltk_hash::{BinHash, Hash as _};
use ltk_manager_assets::map_geometry::{MapGeometryDocument, MapGeometryEdit, MapGeometryError};
use ltk_manager_base::error::{AppError, AppResult};
use ltk_manager_base::hashing::HexBinHash;
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject};
use serde::Serialize;

use super::MapPath;
use super::component::MAP_CONTAINER;
use super::variants::{CONTAINER_LINK, MAP_PATH, MAP_SKIN, SKIN_NAME};
use ltk_manager_bin::bin_document::{BinDocument, RowNames, text};

/// One `MapSkin` of a game map and the container that it links.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct MapSkinContainer {
    /// The `MapSkin`'s `name`.
    pub skin: String,
    /// `MapSkin.mMapContainerLink`.
    pub container: MapPath,
}

/// Returns the bin that holds the `Map` object of the game map `map`, such as
/// `data/maps/shipping/map11/map11.bin` for `Map11`.
#[must_use]
pub fn shipping_bin_path(map: &str) -> String {
    let id = map.to_lowercase();
    format!("data/maps/shipping/{id}/{id}.bin")
}

/// Returns the container path of the custom map skin `slug` on the game map `map`, such as
/// `Maps/MapGeometry/Map11/classic` for `Map11` and `classic`.
#[must_use]
pub fn custom_skin_path(map: &str, slug: &str) -> MapPath {
    MapPath::from(format!("Maps/MapGeometry/{map}/{slug}"))
}

/// Returns each `MapSkin` of `map_bin` that links a container, in file order.
#[must_use]
pub fn map_skin_containers(map_bin: &BinDocument) -> Vec<MapSkinContainer> {
    skins(map_bin)
        .filter_map(|(_, skin)| {
            let container =
                text(skin.properties.get(&CONTAINER_LINK)).filter(|link| !link.is_empty())?;
            Some(MapSkinContainer {
                skin: text(skin.properties.get(&SKIN_NAME))
                    .unwrap_or_default()
                    .to_owned(),
                container: MapPath::from(container),
            })
        })
        .collect()
}

/// Returns `materials` with its `MapContainer` re-keyed from `from` to `to` and `mapPath` set to
/// `to`. Falls back to the first `MapContainer` if no container is at `from`.
///
/// # Errors
///
/// Fails if `materials` is not a valid bin or contains no `MapContainer`.
pub fn moved_container(materials: &[u8], from: &MapPath, to: &MapPath) -> AppResult<Vec<u8>> {
    let mut bin = Bin::from_reader(&mut Cursor::new(materials))
        .map_err(|e| AppError::Other(format!("{from} is not a valid bin: {e}")))?;

    let old = BinHash::hash_str(from.as_str());
    let key = Some(old)
        .filter(|key| bin.objects.get(key).is_some_and(is_container))
        .or_else(|| {
            bin.objects
                .values()
                .find(|object| is_container(object))
                .map(|object| object.path_hash)
        })
        .ok_or_else(|| AppError::Other(format!("{from} contains no MapContainer")))?;

    let new = BinHash::hash_str(to.as_str());
    bin.objects = std::mem::take(&mut bin.objects)
        .into_iter()
        .map(|(hash, mut object)| {
            if hash != key {
                return (hash, object);
            }

            object.path_hash = new;
            object
                .properties
                .insert(MAP_PATH, values::String::from(to.as_str()).into());
            (new, object)
        })
        .collect();

    let mut out = Cursor::new(Vec::new());
    bin.to_writer(&mut out)?;
    Ok(out.into_inner())
}

/// Returns a `game_data.yaml` with one `target` module on `chunk`, the bin `map_bin`, that sets
/// `mMapContainerLink` of every `MapSkin` to `to`.
///
/// Writes each entry as its path if `names` resolves it, else as its hash.
#[must_use]
pub fn skin_link_declarations(
    map_bin: &BinDocument,
    chunk: &str,
    to: &MapPath,
    names: &dyn RowNames,
) -> String {
    let hashes: Vec<BinHash> = skins(map_bin).map(|(entry, _)| entry).collect();
    let mut entries: Vec<String> = hashes
        .iter()
        .map(|&hash| HexBinHash::from(hash).to_string())
        .collect();
    names.for_each_entry(&hashes, &mut |at, name| entries[at] = name.to_owned());

    let mut text = format!(
        "version: 1\nmodules:\n  - name: Link map skins to {to}\n    target: {}\n",
        quoted(chunk)
    );
    for entry in entries {
        text.push_str(&format!(
            "    {}:\n      mMapContainerLink: {}\n",
            quoted(&entry),
            quoted(to.as_str())
        ));
    }
    text
}

/// Returns `mapgeo` with every mesh removed that has neither a visibility controller nor a
/// region.
///
/// # Errors
///
/// Fails if `mapgeo` is not a map that `ltk_mapgeo` reads, or the edit or the write fails.
pub fn state_meshes(mapgeo: &[u8]) -> Result<Vec<u8>, MapGeometryError> {
    let mut document = MapGeometryDocument::parse(mapgeo)?;
    let removed: Vec<u32> = document
        .meshes()
        .into_iter()
        .filter(|mesh| mesh.controller.is_none() && mesh.region.is_none())
        .map(|mesh| mesh.index)
        .collect();

    if !removed.is_empty() {
        document.edit(MapGeometryEdit::Remove { meshes: removed })?;
    }
    document.to_bytes()
}

/// Returns every `MapSkin` object of `map_bin` with its entry, in file order.
fn skins(map_bin: &BinDocument) -> impl Iterator<Item = (BinHash, &BinObject)> {
    map_bin
        .entries()
        .filter_map(|entry| Some((entry, map_bin.object_at(entry)?)))
        .filter(|(_, object)| object.class_hash == MAP_SKIN)
}

fn is_container(object: &BinObject) -> bool {
    object.class_hash == MAP_CONTAINER
}

/// Returns `text` as a double-quoted YAML scalar.
fn quoted(text: &str) -> String {
    format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
}

#[cfg(test)]
mod tests;
