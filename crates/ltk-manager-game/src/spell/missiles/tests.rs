//! Unit tests for the missile lookup: which keys reach a system and which spells fire it.

use std::collections::HashMap;
use std::io::Cursor;

use ltk_hash::{Hash as _, WadHash};
use ltk_meta::property::{Kind, PropertyValueEnum, values};
use ltk_meta::{Bin, BinObject};

use super::*;
use crate::spell::MissileMovement;

fn h(text: &str) -> BinHash {
    BinHash::hash_str(text)
}

const SYSTEM: &str = "Characters/Ahri/Skins/Skin1/Particles/Ahri_Skin01_Q_Mis";
const SPELL: &str = "Characters/Ahri/Spells/AhriOrbMissile";
const OTHER_SPELL: &str = "Characters/Ahri/Spells/AhriSeduceMissile";
const SKIN_BIN: &str = "data/characters/ahri/skins/skin1.bin";
const CHARACTER_BIN: &str = "data/characters/ahri/ahri.bin";

/// Tables that name the system and the two spells.
struct Tables;

impl RowNames for Tables {
    fn for_each_entry(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        for (at, hash) in hashes.iter().enumerate() {
            for name in [SYSTEM, SPELL, OTHER_SPELL] {
                if *hash == h(name) {
                    visit(at, name);
                }
            }
        }
    }

    fn for_each_class(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}

    fn for_each_field(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}

    fn for_each_value(&self, _: &[BinHash], _: &mut dyn FnMut(usize, &str)) {}

    fn for_each_chunk(&self, _: &[WadHash], _: &mut dyn FnMut(usize, &str)) {}
}

/// A lookup that places every bin path at a layer path of the same spelling.
struct Bins;

impl AssetLookup for Bins {
    fn locate(&self, path: &str) -> Option<AssetRef> {
        path.ends_with(".bin").then(|| asset(path))
    }
}

fn asset(path: &str) -> AssetRef {
    AssetRef::Layer {
        project: "C:/projects/ahri".to_owned(),
        layer: "base".to_owned(),
        path: path.to_lowercase(),
    }
}

fn document_of(objects: Vec<BinObject>) -> BinDocument {
    let mut bin = Bin::builder();
    for object in objects {
        bin = bin.object(object);
    }
    let mut out = Cursor::new(Vec::new());
    bin.build().to_writer(&mut out).unwrap();
    BinDocument::parse(out.into_inner()).unwrap()
}

fn embedded(class: &str, fields: Vec<(&str, PropertyValueEnum)>) -> PropertyValueEnum {
    values::Struct {
        class_hash: h(class),
        properties: fields
            .into_iter()
            .map(|(name, value)| (h(name), value))
            .collect(),
    }
    .into()
}

fn resolver(key: &str, target: &str) -> BinObject {
    let map = values::Map::new(
        Kind::Hash,
        Kind::ObjectLink,
        vec![(
            values::Hash::new(h(key)).into(),
            values::ObjectLink::new(h(target)).into(),
        )],
    )
    .unwrap();
    BinObject::builder(
        h("Characters/Ahri/Skins/Skin1/Resources"),
        h("ResourceResolver"),
    )
    .property(h("resourceMap"), map)
    .build()
}

/// A spell at `path` whose missile `field` names `key` and flies at `speed`.
fn spell(path: &str, field: &str, key: &str, speed: f32) -> BinObject {
    let movement = embedded(
        "FixedSpeedMovement",
        vec![("mSpeed", values::F32::new(speed).into())],
    );
    let data = embedded(
        "SpellDataResource",
        vec![
            (field, values::Hash::new(h(key)).into()),
            (
                "mMissileSpec",
                embedded(
                    "MissileSpecification",
                    vec![("movementComponent", movement)],
                ),
            ),
        ],
    );
    BinObject::builder(h(path), h("SpellObject"))
        .property(h("mSpell"), data)
        .build()
}

/// The spells that fire `SYSTEM` with `bins` readable by path.
fn found(open: Vec<BinObject>, bins: HashMap<&str, Vec<BinObject>>) -> Vec<MissileSpell> {
    let open = document_of(open);
    let mut documents: HashMap<AssetRef, Vec<BinObject>> = bins
        .into_iter()
        .map(|(path, objects)| (asset(path), objects))
        .collect();
    let mut read = |asset: &AssetRef| documents.remove(asset).map(document_of);

    missile_spells(&open, h(SYSTEM), SYSTEM, &Tables, &Bins, &mut read)
}

#[test]
fn missile_spells_finds_spell_through_skin_bin_resolver() {
    let spells = found(
        vec![],
        HashMap::from([
            (SKIN_BIN, vec![resolver("Ahri_Q_Mis", SYSTEM)]),
            (
                CHARACTER_BIN,
                vec![
                    spell(SPELL, "mMissileEffectKey", "Ahri_Q_Mis", 1750.0),
                    spell(OTHER_SPELL, "mMissileEffectKey", "Ahri_E_Mis", 1550.0),
                ],
            ),
        ]),
    );

    assert_eq!(spells.len(), 1);
    assert_eq!(spells[0].name, "AhriOrbMissile");
    assert_eq!(spells[0].path, SPELL);
    assert_eq!(
        spells[0].missile.movement,
        MissileMovement::FixedSpeed {
            speed: Some(1750.0)
        }
    );
}

#[test]
fn missile_spells_matches_team_variant_key_from_open_resolver() {
    let spells = found(
        vec![resolver("Ahri_Q_Mis_Enemy", SYSTEM)],
        HashMap::from([(
            CHARACTER_BIN,
            vec![spell(
                SPELL,
                "mMissileEffectEnemyKey",
                "Ahri_Q_Mis_Enemy",
                1750.0,
            )],
        )]),
    );

    assert_eq!(spells.len(), 1);
}

#[test]
fn missile_spells_returns_none_if_no_resolver_maps_to_system() {
    let spells = found(
        vec![],
        HashMap::from([(
            CHARACTER_BIN,
            vec![spell(SPELL, "mMissileEffectKey", "Ahri_Q_Mis", 1750.0)],
        )]),
    );

    assert!(spells.is_empty());
}

#[test]
fn character_of_reads_lowercase_name_under_characters() {
    assert_eq!(character_of(SYSTEM).as_deref(), Some("ahri"));
    assert_eq!(character_of("Maps/Shipping/Map11/Particles/Foo"), None);
}

#[test]
fn spell_name_strips_character_spell_folder() {
    assert_eq!(spell_name(SPELL), "AhriOrbMissile");
    assert_eq!(spell_name("Shared/Spells/Foo"), "Shared/Spells/Foo");
}
