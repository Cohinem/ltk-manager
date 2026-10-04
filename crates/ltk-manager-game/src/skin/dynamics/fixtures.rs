//! A skin's mesh properties built in memory, for the reads over its pose modifiers and sockets.

use std::io::Cursor;

use glam::vec3;
use ltk_hash::{BinHash, Hash as _, WadHash};
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_bin::bin_document::{AssetLookup, BinDocument, RowNames, hex};
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject, PropertyValueEnum};

use super::POSE_MODIFIERS;
use crate::skin::{HashRef, MESH_PROPERTIES, SkinModel, resolve_skin};

pub(super) const SKIN: &str = "Characters/Ahri/Skins/Skin3";

pub(super) fn h(text: &str) -> BinHash {
    BinHash::hash_str(text)
}

pub(super) fn class(name: &str, properties: Vec<(BinHash, PropertyValueEnum)>) -> values::Struct {
    values::Struct {
        class_hash: h(name),
        properties: properties.into_iter().collect(),
    }
}

pub(super) fn embedded(
    name: &str,
    properties: Vec<(BinHash, PropertyValueEnum)>,
) -> values::Embedded {
    values::Embedded(class(name, properties))
}

pub(super) fn hash(name: &str) -> PropertyValueEnum {
    values::Hash::new(h(name)).into()
}

pub(super) fn number(value: f32) -> PropertyValueEnum {
    values::F32::new(value).into()
}

pub(super) fn byte(value: u8) -> PropertyValueEnum {
    values::U8::new(value).into()
}

pub(super) fn on() -> PropertyValueEnum {
    values::Bool::new(true).into()
}

pub(super) fn off() -> PropertyValueEnum {
    values::Bool::new(false).into()
}

pub(super) fn vector(x: f32, y: f32, z: f32) -> PropertyValueEnum {
    values::Vector3::new(vec3(x, y, z)).into()
}

pub(super) fn numbers(list: &[f32]) -> PropertyValueEnum {
    values::Container::from(
        list.iter()
            .map(|value| values::F32::new(*value))
            .collect::<Vec<_>>(),
    )
    .into()
}

/// A document holding one skin, with `mesh` as its mesh properties and none for a skin
/// that sets none.
pub(super) fn document(mesh: Option<Vec<(BinHash, PropertyValueEnum)>>) -> BinDocument {
    let mut object = BinObject::builder(h(SKIN), h("SkinCharacterDataProperties"));
    if let Some(mesh) = mesh {
        object = object.property(MESH_PROPERTIES, embedded("SkinMeshDataProperties", mesh));
    }

    let mut out = Cursor::new(Vec::new());
    Bin::builder()
        .object(object.build())
        .build()
        .to_writer(&mut out)
        .unwrap();

    BinDocument::parse(out.into_inner()).unwrap()
}

pub(super) fn read(document: &BinDocument) -> SkinModel {
    resolve_skin(document, h(SKIN), &Tables, &Placed, None).unwrap()
}

pub(super) fn skin_with(mesh: Vec<(BinHash, PropertyValueEnum)>) -> SkinModel {
    read(&document(Some(mesh)))
}

pub(super) fn modifiers(list: Vec<values::Struct>) -> SkinModel {
    skin_with(vec![(POSE_MODIFIERS, values::Container::from(list).into())])
}

/// Tables that name the joints and one class, and nothing else.
pub(super) struct Tables;

impl RowNames for Tables {
    fn for_each_entry(&self, _hashes: &[BinHash], _visit: &mut dyn FnMut(usize, &str)) {}

    fn for_each_class(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        for (at, hash) in hashes.iter().enumerate() {
            if *hash == h("LaterRigPoseModifierData") {
                visit(at, "LaterRigPoseModifierData");
            }
        }
    }

    fn for_each_field(&self, _hashes: &[BinHash], _visit: &mut dyn FnMut(usize, &str)) {}

    fn for_each_value(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        for (at, hash) in hashes.iter().enumerate() {
            for name in ["Hair_Root", "L_Pauldron", "Head"] {
                if *hash == h(name) {
                    visit(at, name);
                }
            }
        }
    }

    fn for_each_chunk(&self, _hashes: &[WadHash], _visit: &mut dyn FnMut(usize, &str)) {}
}

/// A lookup that places every path.
pub(super) struct Placed;

impl AssetLookup for Placed {
    fn locate(&self, path: &str) -> Option<AssetRef> {
        Some(AssetRef::File {
            path: path.to_lowercase(),
        })
    }
}

pub(super) fn named_ref(name: &str) -> Option<HashRef> {
    Some(HashRef {
        name: name.to_owned(),
        hash: hex(h(name)),
    })
}

pub(super) fn unnamed_ref(name: &str) -> Option<HashRef> {
    Some(HashRef {
        name: hex(h(name)),
        hash: hex(h(name)),
    })
}

/// The hash path of `rest` under the skin's mesh properties.
pub(super) fn mesh_path(rest: &str) -> String {
    format!("{:08x}.{rest}", MESH_PROPERTIES.0)
}

/// The hash path of the pose modifier at `index` of the list.
pub(super) fn modifier_path(index: usize) -> String {
    mesh_path(&format!("{:08x}[{index}]", POSE_MODIFIERS.0))
}
