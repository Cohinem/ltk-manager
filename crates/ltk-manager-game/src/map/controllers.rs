//! The visibility controllers that a map's `.materials.bin` declares.
//!
//! If a mesh or a placeable references a controller, the game draws it while that
//! controller is visible and ignores its layer mask. Each rule in this module is the
//! visibility predicate of one controller class in the 16.16 client (ADR-0064).

use ltk_hash::BinHash;
use ltk_manager_base::hashing::named;
use ltk_meta::walk::Leaf;
use serde::Serialize;

use ltk_manager_bin::bin_document::{
    BinDocument, Fields, RowNames, boolean, hex, items, leaf, link, text, unsigned,
};

/// The unnamed controller class whose state the server sets by name.
const NAMED_CONTROLLER: BinHash = BinHash(0xe07e_dfa4);
/// The unnamed subclass of [`NAMED_CONTROLLER`] that the elemental terrains use.
const TERRAIN_CONTROLLER: BinHash = BinHash(0xc406_a533);
/// The unnamed subclass of [`NAMED_CONTROLLER`] that the Baron pit stages use.
const BARON_CONTROLLER: BinHash = BinHash(0xec73_3fe2);
/// The unnamed controller class that has a `Provider` link.
const PROVIDER_CONTROLLER: BinHash = BinHash(0xf9cf_efd4);
const CHILD_CONTROLLER: BinHash = named("ChildMapVisibilityController");
const MUTATOR_CONTROLLER: BinHash = named("MutatorMapVisibilityController");
const LAYER_CONTROLLER: BinHash = named("LegacyVisFlagVisController");
const LOGIC_DRIVER_CONTROLLER: BinHash = named("LogicDriverVisibilityController");

/// `name` of [`NAMED_CONTROLLER`], a hash of the name that the server sets the state by.
const NAME: BinHash = named("name");
/// `DefaultVisible` of [`NAMED_CONTROLLER`]. The class default is true.
const DEFAULT_VISIBLE: BinHash = named("DefaultVisible");
/// The unnamed field of [`TERRAIN_CONTROLLER`] that holds the layer bits of the terrain.
const TERRAIN_LAYERS: BinHash = BinHash(0x2763_9032);
/// The unnamed field of [`BARON_CONTROLLER`] that holds the stage bits.
const STAGE_BITS: BinHash = BinHash(0x8bff_8cdf);
/// `ChildMapVisibilityController.Parents`, a list of links to other controllers.
const PARENTS: BinHash = named("Parents");
/// `ChildMapVisibilityController.ParentMode`. The class default is zero.
const PARENT_MODE: BinHash = named("ParentMode");
/// `MutatorMapVisibilityController.MutatorName`.
const MUTATOR_NAME: BinHash = named("MutatorName");
/// `LegacyVisFlagVisController.VisFlags`.
const VIS_FLAGS: BinHash = named("VisFlags");

/// One visibility controller of a map.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub struct MapController {
    /// The path hash of the controller object, as `0x` and eight hex digits. A mesh and a
    /// placeable reference the controller by this hash.
    pub hash: String,
    /// The name of the controller: the string of its `name` hash, or else the path of its
    /// object. `None` if no hash table has either.
    pub name: Option<String>,
    pub rule: MapControllerRule,
}

/// The visibility rule of a controller.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum MapControllerRule {
    /// A controller whose state the server sets by name. The initial state is
    /// `default_visible`.
    Named {
        default_visible: bool,
        /// The layer bits of the elemental terrain that uses the controller. Zero if the
        /// controller is not a terrain controller.
        terrain: u8,
        /// The stage bits of the Baron pit stage that uses the controller. Zero if the
        /// controller is not a stage controller.
        stage: u8,
    },
    /// A controller whose state is computed from the states of `parents` according to
    /// `mode`.
    Child {
        /// The path hash of each parent, as `0x` and eight hex digits.
        parents: Vec<String>,
        mode: MapParentMode,
    },
    /// A controller that is visible while a layer in `mask` is active.
    Layer { mask: u8 },
    /// A controller that is visible in a game that applies the mutator `name`.
    Mutator { name: String },
    /// A controller whose state cannot be read from a file: a logic driver, a provider, or
    /// a child with a `ParentMode` value that the game never shows.
    Driven,
}

/// The number of visible parents that makes a child controller visible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(feature = "ts", derive(specta::Type))]
pub enum MapParentMode {
    /// All parents. A child with no parents is visible.
    All,
    /// At least one parent.
    Any,
    /// Exactly one parent.
    One,
    /// No parent. A child with no parents is visible.
    None,
}

impl MapParentMode {
    /// The mode for a `ParentMode` value. `None` if the game never shows a child with that
    /// value.
    fn of(value: u64) -> Option<Self> {
        match value {
            0 => Some(Self::All),
            1 => Some(Self::Any),
            2 => Some(Self::One),
            3 => Some(Self::None),
            _ => None,
        }
    }
}

/// Every visibility controller that `materials` declares, in file order, named out of
/// `names`.
#[must_use]
pub fn map_controllers(materials: &BinDocument, names: &dyn RowNames) -> Vec<MapController> {
    materials
        .entries()
        .filter_map(|entry| {
            let object = materials.object_at(entry)?;
            let rule = rule(object.class_hash, &object.properties)?;

            Some(MapController {
                hash: hex(entry),
                name: name(entry, &object.properties, names),
                rule,
            })
        })
        .collect()
}

/// The name of the controller at `entry`: the string of its `name` hash, or else the path
/// of its object. `None` if `names` has neither.
fn name(entry: BinHash, fields: &Fields, names: &dyn RowNames) -> Option<String> {
    let stated = match leaf(fields.get(&NAME)) {
        Some(Leaf::Hash(hash)) => hash
            .try_as_bin_hash()
            .and_then(|hash| names.value_name(hash)),
        _ => None,
    };

    stated.or_else(|| names.entry_name(entry))
}

/// The rule of an object of `class` with `fields`. `None` if `class` is not a controller
/// class.
fn rule(class: BinHash, fields: &Fields) -> Option<MapControllerRule> {
    match class {
        NAMED_CONTROLLER | TERRAIN_CONTROLLER | BARON_CONTROLLER => {
            Some(MapControllerRule::Named {
                default_visible: boolean(fields.get(&DEFAULT_VISIBLE)).unwrap_or(true),
                terrain: byte(fields, TERRAIN_LAYERS),
                stage: byte(fields, STAGE_BITS),
            })
        }
        CHILD_CONTROLLER => Some(child(fields)),
        LAYER_CONTROLLER => Some(MapControllerRule::Layer {
            mask: byte(fields, VIS_FLAGS),
        }),
        MUTATOR_CONTROLLER => Some(MapControllerRule::Mutator {
            name: text(fields.get(&MUTATOR_NAME))
                .unwrap_or_default()
                .to_owned(),
        }),
        LOGIC_DRIVER_CONTROLLER | PROVIDER_CONTROLLER => Some(MapControllerRule::Driven),
        _ => None,
    }
}

fn child(fields: &Fields) -> MapControllerRule {
    let Some(mode) = MapParentMode::of(unsigned(fields.get(&PARENT_MODE)).unwrap_or(0)) else {
        return MapControllerRule::Driven;
    };

    MapControllerRule::Child {
        parents: items(fields.get(&PARENTS))
            .iter()
            .filter_map(|parent| link(Some(parent)))
            .map(hex)
            .collect(),
        mode,
    }
}

/// The value of the `u8` property `field`. Zero if the object does not write the property,
/// which is the class default.
fn byte(fields: &Fields, field: BinHash) -> u8 {
    unsigned(fields.get(&field))
        .and_then(|value| u8::try_from(value).ok())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests;
