//! A map's `.materials.bin` built in memory, for the reads over its placeables.

use std::io::Cursor;

use ltk_hash::{BinHash, Hash as _};
use ltk_meta::property::{Kind, NoMeta, values};
use ltk_meta::{Bin, BinObject, PropertyValueEnum};

use super::placeable::{ITEMS, PLACEABLE_CONTAINER};
use ltk_manager_core::bin_document::BinDocument;

pub(super) fn h(text: &str) -> BinHash {
    BinHash::hash_str(text)
}

pub(super) fn placeable(
    class: &str,
    properties: Vec<(BinHash, PropertyValueEnum)>,
) -> PropertyValueEnum {
    values::Struct {
        class_hash: h(class),
        properties: properties.into_iter().collect(),
        meta: NoMeta,
    }
    .into()
}

pub(super) fn embedded(
    class: &str,
    properties: Vec<(BinHash, PropertyValueEnum)>,
) -> PropertyValueEnum {
    values::Embedded(values::Struct {
        class_hash: h(class),
        properties: properties.into_iter().collect(),
        meta: NoMeta,
    })
    .into()
}

pub(super) fn container(path: &str, items: Vec<(&str, PropertyValueEnum)>) -> BinObject {
    let items = values::Map::new(
        Kind::Hash,
        Kind::Struct,
        items
            .into_iter()
            .map(|(key, value)| (values::Hash::new(h(key)).into(), value))
            .collect(),
    )
    .unwrap();
    BinObject::builder(h(path), PLACEABLE_CONTAINER)
        .property(ITEMS, items)
        .build()
}

pub(super) fn document_of(objects: Vec<BinObject>) -> BinDocument {
    let mut bin = Bin::<NoMeta>::builder();
    for object in objects {
        bin = bin.object(object);
    }
    let mut out = Cursor::new(Vec::new());
    bin.build().to_writer(&mut out).unwrap();
    BinDocument::parse(out.into_inner()).unwrap()
}
