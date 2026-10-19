//! The maps an object of a map's own classes draws: a `Map`, a `MapSkin` or a `MapContainer`.
//!
//! A container states its map outright, a skin names its container, and a map lists its
//! skins. Each chain ends at a [`MapPath`], which is all a preview draws a map from.

use ltk_hash::BinHash;
use ltk_manager_base::hashing::{HexBinHash, named};
use serde::Serialize;

use super::MapPath;
use super::component::MAP_CONTAINER;
use ltk_manager_bin::bin_document::{BinDocument, Fields, items, link, text};

const MAP: BinHash = named("Map");
/// `Map.mapSkins`, a list of links to the `MapSkin` objects of the same file.
const MAP_SKINS: BinHash = named("mapSkins");
pub(super) const MAP_SKIN: BinHash = named("MapSkin");
/// `MapSkin.name`.
pub(super) const SKIN_NAME: BinHash = named("name");
/// `MapSkin.mMapContainerLink`, the entry path of a `MapContainer` in another file.
pub(super) const CONTAINER_LINK: BinHash = named("mMapContainerLink");
/// `MapContainer.mapPath`.
pub(super) const MAP_PATH: BinHash = named("mapPath");

/// One map an object draws, and the skin that names it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct MapVariant {
    /// The `MapSkin`'s own name, and none for a map a container states itself.
    pub skin: Option<String>,
    /// The map that skin draws.
    pub map: MapPath,
    /// The `MapSkin` object, and none for a map a container states itself.
    pub skin_entry: Option<HexBinHash>,
    /// The `Map` object of the same file that lists the skin, and none where no `Map` lists it.
    pub map_entry: Option<HexBinHash>,
}

/// The maps the object at `entry` draws, in the order it names them.
///
/// A `MapContainer` answers its own map and a `MapSkin` the one its container link names.
/// A `Map` answers one per skin it lists that this document declares. A skin that names
/// no container draws no geometry of its own and answers nothing, as does an object of
/// any other class.
#[must_use]
pub fn map_variants(document: &BinDocument, entry: BinHash) -> Vec<MapVariant> {
    let Some(object) = document.object_at(entry) else {
        return Vec::new();
    };
    match object.class_hash {
        MAP_CONTAINER => stated(&object.properties, MAP_PATH)
            .map(|map| MapVariant {
                skin: None,
                map,
                skin_entry: None,
                map_entry: None,
            })
            .into_iter()
            .collect(),
        MAP_SKIN => skin_variant(entry, &object.properties, listing_map(document, entry))
            .into_iter()
            .collect(),
        MAP => items(object.properties.get(&MAP_SKINS))
            .iter()
            .filter_map(|skin| {
                let skin_entry = link(Some(skin))?;
                Some((skin_entry, document.object_at(skin_entry)?))
            })
            .filter(|(_, skin)| skin.class_hash == MAP_SKIN)
            .filter_map(|(skin_entry, skin)| {
                skin_variant(skin_entry, &skin.properties, Some(entry))
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn skin_variant(entry: BinHash, skin: &Fields, map_entry: Option<BinHash>) -> Option<MapVariant> {
    Some(MapVariant {
        skin: text(skin.get(&SKIN_NAME)).map(str::to_owned),
        map: stated(skin, CONTAINER_LINK)?,
        skin_entry: Some(entry.into()),
        map_entry: map_entry.map(HexBinHash::from),
    })
}

/// Returns the first `Map` of `document` that lists the skin `skin`, and none if no `Map` lists it.
fn listing_map(document: &BinDocument, skin: BinHash) -> Option<BinHash> {
    document.entries().find(|&entry| {
        document.object_at(entry).is_some_and(|object| {
            object.class_hash == MAP
                && items(object.properties.get(&MAP_SKINS))
                    .iter()
                    .any(|listed| link(Some(listed)) == Some(skin))
        })
    })
}

/// The entry path `field` states, and none for the empty string a class defaults it to.
fn stated(fields: &Fields, field: BinHash) -> Option<MapPath> {
    text(fields.get(&field))
        .filter(|path| !path.is_empty())
        .map(MapPath::from)
}

#[cfg(test)]
mod tests;
