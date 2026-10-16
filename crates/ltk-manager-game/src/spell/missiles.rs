//! The spells that fire a particle system as their missile, found through a skin's resolver.

use std::collections::HashSet;

use ltk_hash::BinHash;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_base::hashing::named;
use ltk_manager_bin::bin_document::{AssetLookup, BinDocument, RowNames, hex, leaf};
use ltk_meta::walk::Leaf;
use serde::Serialize;

use super::{MissileSpec, read_spell, spell_data};
use crate::resolver::{resolver_entries, skin_bin};

/// `ResourceResolver`, the class whose `resourceMap` maps an effect key to a system.
const RESOURCE_RESOLVER: BinHash = named("ResourceResolver");

/// `SpellObject`, the class that holds a spell's data.
const SPELL_OBJECT: BinHash = named("SpellObject");

/// The `SpellDataResource` fields that name a missile's system by its resolver key.
const MISSILE_KEYS: [BinHash; 3] = [
    named("mMissileEffectKey"),
    named("mMissileEffectPlayerKey"),
    named("mMissileEffectEnemyKey"),
];

/// One spell that fires a system as its missile.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct MissileSpell {
    /// The spell object's hash, as `0x` and eight hex digits.
    pub object_hash: String,
    /// The spell object's path, or its hash where no table names it.
    pub path: String,
    /// The path below `Characters/{character}/Spells`, or the whole path outside it.
    pub name: String,
    /// The spell's missile specification.
    pub missile: MissileSpec,
    /// The spell's rank-one cast range, in engine units.
    pub range: Option<f32>,
    /// The spell's `missileSpeed`, in engine units per second.
    pub missile_speed: Option<f32>,
}

/// Returns the spells that fire `system` as their missile.
///
/// `path` is the system's object path. The resolver keys that map to `system` are read from
/// `open` and from `data/characters/<name>/skins/<skin>.bin` for a path under
/// `Characters/<name>/Skins/<skin>/`. The spells are read from `data/characters/<name>/<name>.bin`,
/// and a spell matches if its missile effect key, or its player or enemy variant, is one of those
/// keys. Returns none for a path under no character, or if a bin cannot be read.
pub fn missile_spells(
    open: &BinDocument,
    system: BinHash,
    path: &str,
    names: &dyn RowNames,
    assets: &dyn AssetLookup,
    read: &mut dyn FnMut(&AssetRef) -> Option<BinDocument>,
) -> Vec<MissileSpell> {
    let Some(character) = character_of(path) else {
        return Vec::new();
    };

    let mut keys = keys_to(open, system);
    if let Some(skin) = skin_bin(path).and_then(|path| assets.locate(&path))
        && let Some(document) = read(&skin)
    {
        keys.extend(keys_to(&document, system));
    }
    if keys.is_empty() {
        return Vec::new();
    }

    let bin = format!("data/characters/{character}/{character}.bin");
    let Some(spells) = assets.locate(&bin).and_then(|asset| read(&asset)) else {
        return Vec::new();
    };

    let mut found = Vec::new();
    for entry in spells.entries() {
        let Some(object) = spells
            .object_at(entry)
            .filter(|object| object.class_hash == SPELL_OBJECT)
        else {
            continue;
        };
        let fires = spell_data(&object.properties).is_some_and(|spell| {
            MISSILE_KEYS
                .iter()
                .any(|field| match leaf(spell.get(field)) {
                    Some(Leaf::Hash(key)) => {
                        key.try_as_bin_hash().is_some_and(|key| keys.contains(&key))
                    }
                    _ => false,
                })
        });
        if !fires {
            continue;
        }

        let Ok(read) = read_spell(&spells, entry) else {
            continue;
        };
        let range = read.range();
        let Some(missile) = read.missile else {
            continue;
        };

        let path = names.entry_name(entry).unwrap_or_else(|| hex(entry));
        found.push(MissileSpell {
            object_hash: hex(entry),
            name: spell_name(&path).to_owned(),
            path,
            missile,
            range,
            missile_speed: read.missile_speed,
        });
    }
    found
}

/// Returns the keys of every resolver in `document` that maps to `system`.
fn keys_to(document: &BinDocument, system: BinHash) -> HashSet<BinHash> {
    document
        .entries()
        .filter_map(|entry| document.object_at(entry))
        .filter(|object| object.class_hash == RESOURCE_RESOLVER)
        .flat_map(resolver_entries)
        .filter(|(_, target)| *target == system)
        .map(|(key, _)| key)
        .collect()
}

/// Returns the lowercase character name of a path under `Characters/<name>/`.
fn character_of(path: &str) -> Option<String> {
    let mut parts = path.split('/');
    let (root, character) = (parts.next()?, parts.next()?);
    (root.eq_ignore_ascii_case("characters") && !character.is_empty())
        .then(|| character.to_lowercase())
}

/// Returns the part of `path` below `Characters/{character}/Spells/`, or `path` outside it.
fn spell_name(path: &str) -> &str {
    let mut parts = path.splitn(4, '/');
    match (parts.next(), parts.next(), parts.next(), parts.next()) {
        (Some(root), Some(_), Some(folder), Some(name))
            if root.eq_ignore_ascii_case("characters") && folder.eq_ignore_ascii_case("spells") =>
        {
            name
        }
        _ => path,
    }
}

#[cfg(test)]
mod tests;
