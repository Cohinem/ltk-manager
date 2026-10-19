//! The visibility flags that a map's `Map` object names in `VisibilityFlagDefines`.

use ltk_hash::BinHash;
use ltk_manager_base::hashing::named;
use serde::Serialize;

use super::MapPath;
use ltk_manager_bin::bin_document::{BinDocument, fields_of, items, leaf, text, unsigned};
use ltk_meta::PropertyValueEnum;
use ltk_meta::walk::Leaf;

const MAP: BinHash = named("Map");
/// `Map.VisibilityFlagDefines`, an embedded `MapVisibilityFlagDefinitions`.
const FLAG_DEFINES: BinHash = named("VisibilityFlagDefines");
/// `MapVisibilityFlagDefinitions.FlagDefinitions`, a list of `MapVisibilityFlagDefinition`.
const FLAG_DEFINITIONS: BinHash = named("FlagDefinitions");
/// `MapVisibilityFlagDefinition.name`, the hash that `MapAlternateAsset.mVisibilityFlagName`
/// matches.
const FLAG_NAME: BinHash = named("name");
const PUBLIC_NAME: BinHash = named("PublicName");
const BIT_INDEX: BinHash = named("BitIndex");

/// One visibility flag of a map: the layer bit and the name the map gives it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct MapFlag {
    /// The layer bit, 0 to 7.
    pub bit: u8,
    /// `PublicName` of the flag definition.
    pub name: String,
}

/// Returns the file that holds the `Map` object of `map`, such as
/// `data/maps/shipping/map11/map11.bin` for `Maps/MapGeometry/Map11/Base_SRX`. Returns `None`
/// if `map` has no map id segment.
#[must_use]
pub fn map_bin_path(map: &MapPath) -> Option<String> {
    let id = map.as_str().split('/').nth(2)?.to_lowercase();
    if id.is_empty() {
        return None;
    }

    Some(format!("data/maps/shipping/{id}/{id}.bin"))
}

/// Reads the named flags of the first `Map` object of `bin`, in definition order. Skips a
/// definition that has no `PublicName` or a `BitIndex` above 7.
#[must_use]
pub fn map_flags(bin: &BinDocument) -> Vec<MapFlag> {
    flag_definitions(bin)
        .iter()
        .filter_map(|definition| {
            let fields = fields_of(Some(definition))?;
            let bit = u8::try_from(unsigned(fields.get(&BIT_INDEX)).unwrap_or(0)).ok()?;
            let name = text(fields.get(&PUBLIC_NAME))?;

            (bit < 8 && !name.is_empty()).then(|| MapFlag {
                bit,
                name: name.to_owned(),
            })
        })
        .collect()
}

/// Returns the layer bit of each flag definition of the first `Map` object of `bin`, by the
/// definition's `name` hash. Skips a definition that has no `name` or a `BitIndex` above 7.
pub(super) fn flag_bits(bin: &BinDocument) -> Vec<(BinHash, u8)> {
    flag_definitions(bin)
        .iter()
        .filter_map(|definition| {
            let fields = fields_of(Some(definition))?;
            let Leaf::Hash(name) = leaf(fields.get(&FLAG_NAME))? else {
                return None;
            };
            let name = name.try_as_bin_hash()?;
            let bit = u8::try_from(unsigned(fields.get(&BIT_INDEX)).unwrap_or(0)).ok()?;

            (bit < 8).then_some((name, bit))
        })
        .collect()
}

/// Returns the flag definitions of the first `Map` object of `bin`, and none if it has none.
fn flag_definitions(bin: &BinDocument) -> &[PropertyValueEnum] {
    bin.entries()
        .filter_map(|entry| bin.object_at(entry))
        .find(|object| object.class_hash == MAP)
        .and_then(|map| fields_of(map.properties.get(&FLAG_DEFINES)))
        .map(|defines| items(defines.get(&FLAG_DEFINITIONS)))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests;
