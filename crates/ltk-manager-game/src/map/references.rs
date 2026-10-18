//! The map action fields that name a placeable, which a rename of the placeable rewrites.

use ltk_hash::BinHash;
use ltk_manager_base::hashing::named;
use ltk_manager_bin::bin_document::{BinDocument, hex};
use ltk_manager_bin::bin_walk::Address;
use ltk_meta::walk::{Leaf, Node, TreeValue, Visit, Visitor};
use serde::Serialize;

/// The string fields of the map actions that name a prop, a particle, a locator or a path.
const NAME_FIELDS: [BinHash; 4] = [
    named("PropName"),
    named("MapParticleName"),
    named("LocationName"),
    named("pathname"),
];

/// One string field that names a placeable, addressed as a property edit addresses it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct MapNameReference {
    /// The object that holds the field, as `0x` and eight hex digits.
    pub entry: String,
    /// The hash path of the struct that holds the field. Empty for a field of the object.
    pub holder: String,
    /// The field, as `0x` and eight hex digits.
    pub field: String,
}

/// Every map action field in `materials` whose text is `name`, in file order.
///
/// The client matches the name exactly, so the comparison is case-sensitive.
#[must_use]
pub fn map_name_references(materials: &BinDocument, name: &str) -> Vec<MapNameReference> {
    let mut found = Found {
        name,
        out: Vec::new(),
    };
    for entry in materials.entries() {
        if let Some(object) = materials.object_at(entry) {
            let _ = object.walk(&mut found);
        }
    }
    found.out
}

struct Found<'n> {
    name: &'n str,
    out: Vec<MapNameReference>,
}

impl<'a, V: TreeValue<'a>> Visitor<'a, V> for Found<'_> {
    type Error = ltk_meta::Error;

    fn enter_property(
        &mut self,
        field: BinHash,
        value: V,
        node: &Node<'_, 'a, V>,
    ) -> Result<Visit, Self::Error> {
        if !NAME_FIELDS.contains(&field) {
            return Ok(Visit::Continue);
        }
        if !matches!(value.as_leaf()?, Some(Leaf::String(text)) if text == self.name) {
            return Ok(Visit::Continue);
        }

        let address = Address::of(node.trail(), field, node.class_hash(), &());
        let path = address.into_hashes();
        let holder = path
            .strip_suffix(&format!("{field:08x}"))
            .map(|holder| holder.trim_end_matches('.'))
            .unwrap_or_default()
            .to_owned();
        self.out.push(MapNameReference {
            entry: hex(node.object_hash()),
            holder,
            field: hex(field),
        });
        Ok(Visit::Continue)
    }
}

#[cfg(test)]
mod tests;
