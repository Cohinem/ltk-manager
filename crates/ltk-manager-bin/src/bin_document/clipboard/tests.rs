//! Unit tests for copied values: a duplicate and a paste of an emitter through one property
//! edit, the unique name, undo, the save, and the refusals.

use std::io::Cursor;

use assert_matches::assert_matches;
use indexmap::IndexMap;
use ltk_hash::Hash as _;
use ltk_meta::property::Kind;
use ltk_meta::{Bin, BinObject};

use super::*;
use crate::bin_document::{NewObject, ObjectCreation, PropertyEdit, ValueEdit};
use crate::meta_schema::{self, MetaSchema};
use ltk_manager_base::game_build::GameBuild;

const BUILD: GameBuild = GameBuild::new(16, 17, 8_104_348);
const SYSTEM: &str = "Characters/Teemo/Skins/Skin0/Particles/Teemo_Q";
const OTHER: &str = "Characters/Teemo/Skins/Skin0/Particles/Teemo_R";

fn h(text: &str) -> BinHash {
    BinHash::hash_str(text)
}

fn hashed(name: &str) -> String {
    format!("{:08x}", h(name).0)
}

fn schema() -> std::sync::Arc<MetaSchema> {
    meta_schema::shared(Some(BUILD))
}

fn class(name: &str, properties: Vec<(&str, PropertyValueEnum)>) -> values::Struct {
    values::Struct {
        class_hash: h(name),
        properties: properties
            .into_iter()
            .map(|(field, value)| (h(field), value))
            .collect(),
    }
}

/// An emitter holding a hash, a link, a classed pointer, a nested embed, an option and a map.
fn emitter(name: &str) -> PropertyValueEnum {
    let drivers = values::Map::new(
        Kind::String,
        Kind::Struct,
        vec![(
            values::String::from("Alpha").into(),
            class(
                "FloatLiteralMaterialDriver",
                vec![("mValue", values::F32::new(0.25).into())],
            )
            .into(),
        )],
    )
    .unwrap();
    let color = class(
        "ValueColor",
        vec![("constantValue", values::Vector4::default().into())],
    );

    class(
        "VfxEmitterDefinitionData",
        vec![
            ("emitterName", values::String::from(name).into()),
            ("StencilReferenceId", values::Hash::new(h("Stencil")).into()),
            (
                "Material",
                values::ObjectLink::new(h("Maps/Materials/Glow")).into(),
            ),
            (
                "SpawnShape",
                class(
                    "VfxShapeBox",
                    vec![("size", values::Vector3::default().into())],
                )
                .into(),
            ),
            ("birthColor", values::Embedded(color).into()),
            (
                "lifetime",
                values::Optional::new(Kind::F32, Some(values::F32::new(1.5).into()))
                    .unwrap()
                    .into(),
            ),
            ("materialDrivers", drivers.into()),
        ],
    )
    .into()
}

fn emitters(names: &[&str]) -> values::Container {
    values::Container::new(
        Kind::Struct,
        names.iter().map(|name| emitter(name)).collect(),
    )
    .unwrap()
}

/// A bin with one system of `complex` and `simple` emitters, and one object beside it.
fn bin_bytes(system: &str, complex: &[&str], simple: &[&str]) -> Vec<u8> {
    let object = BinObject::builder(h(system), h("VfxSystemDefinitionData"))
        .property(h("complexEmitterDefinitionData"), emitters(complex))
        .property(h("simpleEmitterDefinitionData"), emitters(simple))
        .property(h("particleName"), values::String::from("Teemo_Q"))
        .build();
    let untouched = BinObject::new(h("Characters/Teemo"), h("CharacterRecord"));
    let mut out = Cursor::new(Vec::new());
    Bin::new([object, untouched], std::iter::empty::<&str>())
        .to_writer(&mut out)
        .unwrap();
    out.into_inner()
}

fn document(complex: &[&str], simple: &[&str]) -> BinDocument {
    BinDocument::parse(bin_bytes(SYSTEM, complex, simple)).unwrap()
}

fn list<'a>(document: &'a BinDocument, system: &str, field: &str) -> &'a [PropertyValueEnum] {
    match &document.object_at(h(system)).unwrap().properties[&h(field)] {
        PropertyValueEnum::Container(items) => items.items(),
        other => panic!("{field} is no list: {other:?}"),
    }
}

fn names(document: &BinDocument, system: &str) -> Vec<String> {
    list(document, system, "complexEmitterDefinitionData")
        .iter()
        .map(|item| {
            let PropertyValueEnum::Struct(inner) = item else {
                panic!("an emitter is a pointer");
            };
            match &inner.properties[&h("emitterName")] {
                PropertyValueEnum::String(text) => text.value.clone(),
                other => panic!("emitterName is no string: {other:?}"),
            }
        })
        .collect()
}

fn unique() -> Option<String> {
    Some(format!("0x{}", hashed("emitterName")))
}

fn duplicate(document: &mut BinDocument, index: usize) -> Result<(), BinDocumentError> {
    document.edit_property(
        h(SYSTEM),
        "",
        &format!("0x{}", hashed("complexEmitterDefinitionData")),
        vec![ValueEdit::CopyItem {
            from: format!("[{index}]"),
            path: String::new(),
            index: Some(index + 1),
            unique: unique(),
            key: None,
        }],
        schema().at(Some(BUILD)),
    )
}

fn paste(
    document: &mut BinDocument,
    system: &str,
    index: Option<usize>,
    text: &str,
) -> Result<(), BinDocumentError> {
    document.edit_property(
        h(system),
        "",
        &format!("0x{}", hashed("complexEmitterDefinitionData")),
        vec![ValueEdit::PasteItem {
            path: String::new(),
            index,
            text: text.to_owned(),
            unique: unique(),
            key: None,
        }],
        schema().at(Some(BUILD)),
    )
}

fn copy(document: &BinDocument, path: &str) -> String {
    document
        .copy_value(h(SYSTEM), path, schema().at(Some(BUILD)))
        .unwrap()
}

fn rejection(result: Result<(), BinDocumentError>) -> EditRejection {
    match result {
        Err(BinDocumentError::EditRejected { rejection, .. }) => rejection,
        other => panic!("expected a rejection, got {other:?}"),
    }
}

/// `value` with its `emitterName` set to `name`, to compare a copy with its source.
fn renamed(value: &PropertyValueEnum, name: &str) -> PropertyValueEnum {
    let PropertyValueEnum::Struct(inner) = value else {
        panic!("an emitter is a pointer");
    };
    let mut properties: IndexMap<_, _> = inner.properties.clone();
    properties.insert(h("emitterName"), values::String::from(name).into());
    values::Struct {
        class_hash: inner.class_hash,
        properties,
    }
    .into()
}

#[test]
fn a_duplicate_lands_after_its_source_under_a_unique_name() {
    let mut document = document(&["Spark", "Smoke"], &[]);
    let source = list(&document, SYSTEM, "complexEmitterDefinitionData")[0].clone();

    duplicate(&mut document, 0).unwrap();

    assert_eq!(names(&document, SYSTEM), ["Spark", "Spark_copy", "Smoke"]);
    let copied = &list(&document, SYSTEM, "complexEmitterDefinitionData")[1];
    assert_eq!(*copied, renamed(&source, "Spark_copy"));
    assert!(document.is_dirty());
}

#[test]
fn a_duplicate_is_one_undo_step() {
    let mut document = document(&["Spark", "Smoke"], &[]);

    duplicate(&mut document, 1).unwrap();
    assert!(document.undo().unwrap());
    assert_eq!(names(&document, SYSTEM), ["Spark", "Smoke"]);
    assert!(!document.undo().unwrap());

    assert!(document.redo().unwrap());
    assert_eq!(names(&document, SYSTEM), ["Spark", "Smoke", "Smoke_copy"]);
}

#[test]
fn a_duplicate_of_a_copy_counts_past_every_name_the_system_holds() {
    let mut document = document(&["Spark", "Spark_copy"], &["Spark_copy2"]);

    duplicate(&mut document, 1).unwrap();

    assert_eq!(
        names(&document, SYSTEM),
        ["Spark", "Spark_copy", "Spark_copy3"]
    );
}

#[test]
fn a_name_is_unique_against_the_taken_texts() {
    let taken = HashSet::from(["Glow", "Glow_copy", "Glow_copy2", "Rim_copyA"]);

    assert_eq!(unique_text("Fresh", &taken), "Fresh");
    assert_eq!(unique_text("Glow", &taken), "Glow_copy3");
    assert_eq!(unique_text("Glow_copy2", &taken), "Glow_copy3");
    assert_eq!(unique_text("Rim_copyA", &taken), "Rim_copyA_copy");
}

#[test]
fn a_duplicate_saves_through_the_delta_and_reads_back_whole() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("teemo.bin");
    let mut document = document(&["Spark"], &["Glow"]);
    fs_err::write(&path, document.base()).unwrap();

    duplicate(&mut document, 0).unwrap();
    document.save_to(&path).unwrap();
    assert!(!document.is_dirty());

    let reread = BinDocument::parse(fs_err::read(&path).unwrap()).unwrap();
    assert_eq!(
        reread.object_at(h(SYSTEM)),
        document.object_at(h(SYSTEM)),
        "the saved system reads back as the tree held it"
    );
    assert_eq!(names(&reread, SYSTEM), ["Spark", "Spark_copy"]);
    assert!(reread.object_at(h("Characters/Teemo")).is_some());
}

#[test]
fn a_copy_pastes_into_another_document_exactly() {
    let source = document(&["Spark", "Smoke"], &[]);
    let text = copy(
        &source,
        &format!("{}[1]", hashed("complexEmitterDefinitionData")),
    );
    assert!(text.contains(CLIPBOARD_FORMAT));
    assert!(
        text.contains("\"class\": \"VfxEmitterDefinitionData\""),
        "{text}"
    );

    let mut target = BinDocument::parse(bin_bytes(OTHER, &["Spark"], &[])).unwrap();
    paste(&mut target, OTHER, None, &text).unwrap();

    let pasted = &list(&target, OTHER, "complexEmitterDefinitionData")[1];
    assert_eq!(
        *pasted,
        list(&source, SYSTEM, "complexEmitterDefinitionData")[1],
        "a name the target does not hold stays"
    );
    assert!(target.undo().unwrap());
    assert_eq!(names(&target, OTHER), ["Spark"]);
}

#[test]
fn a_paste_of_a_taken_name_lands_where_asked_under_a_unique_name() {
    let mut document = document(&["Spark", "Smoke"], &[]);
    let text = copy(
        &document,
        &format!("{}[0]", hashed("complexEmitterDefinitionData")),
    );

    paste(&mut document, SYSTEM, Some(1), &text).unwrap();

    assert_eq!(names(&document, SYSTEM), ["Spark", "Spark_copy", "Smoke"]);
}

#[test]
fn a_paste_refuses_text_that_is_no_copy() {
    let mut document = document(&["Spark"], &[]);

    for text in ["", "Spark", "{\"format\":\"other\"}", "{\"value\":1}"] {
        assert_eq!(
            rejection(paste(&mut document, SYSTEM, None, text)),
            EditRejection::NotACopy,
            "{text:?}"
        );
    }
    assert_eq!(names(&document, SYSTEM), ["Spark"]);
    assert!(!document.is_dirty());
    assert!(!document.undo().unwrap());
}

#[test]
fn a_paste_refuses_a_copy_of_another_class() {
    let mut document = document(&["Spark"], &[]);
    let emitter = format!("{}[0]", hashed("complexEmitterDefinitionData"));

    let shape = copy(&document, &format!("{emitter}.{}", hashed("SpawnShape")));
    assert_eq!(
        rejection(paste(&mut document, SYSTEM, None, &shape)),
        EditRejection::ForeignClass
    );
    let color = copy(&document, &format!("{emitter}.{}", hashed("birthColor")));
    assert_eq!(
        rejection(paste(&mut document, SYSTEM, None, &color)),
        EditRejection::ForeignClass
    );
    let name = copy(&document, &format!("{emitter}.{}", hashed("emitterName")));
    assert_matches!(
        rejection(paste(&mut document, SYSTEM, None, &name)),
        EditRejection::InvalidShape
    );
    assert!(!document.is_dirty());
}

#[test]
fn a_paste_refuses_a_list_whose_items_are_not_its_kind() {
    let mut document = document(&["Spark"], &[]);
    let text = copy(
        &document,
        &format!("{}[0]", hashed("complexEmitterDefinitionData")),
    );
    let mut json: serde_json::Value = serde_json::from_str(&text).unwrap();
    let driver = json["value"]["value"]["properties"][h("materialDrivers").0.to_string()]["value"]
        ["value_kind"]
        .as_str()
        .map(str::to_owned);
    assert!(driver.is_some(), "the map writes its value kind: {json}");
    json["value"]["value"]["properties"][h("materialDrivers").0.to_string()]["value"]["value_kind"] =
        serde_json::Value::String("F32".to_owned());

    assert_eq!(
        rejection(paste(&mut document, SYSTEM, None, &json.to_string())),
        EditRejection::InvalidShape
    );
}

#[test]
fn a_system_template_lands_its_emitters_named_apart_in_one_undo_step() {
    let mut document = document(&["Sparks"], &[]);
    let explosion = crate::vfx::vfx_templates()
        .into_iter()
        .find(|template| template.id == "explosion")
        .unwrap();
    let mut taken = vec!["Sparks".to_owned()];
    let mut edits = Vec::new();
    for (offset, emitter) in explosion.emitters.iter().enumerate() {
        let name = if taken.contains(&emitter.name) {
            format!("{}2", emitter.name)
        } else {
            emitter.name.clone()
        };
        taken.push(name.clone());

        let index = 1 + offset;
        edits.push(ValueEdit::PasteItem {
            path: String::new(),
            index: Some(index),
            text: emitter.text.clone(),
            unique: None,
            key: None,
        });
        edits.push(ValueEdit::SetLeaf {
            path: format!("[{index}].{}", hashed("emitterName")),
            value: LeafValue::String { value: name },
        });
    }

    document
        .edit_property(
            h(SYSTEM),
            "",
            &format!("0x{}", hashed("complexEmitterDefinitionData")),
            edits,
            schema().at(Some(BUILD)),
        )
        .unwrap();

    assert_eq!(names(&document, SYSTEM), taken);
    assert!(document.undo().unwrap());
    assert_eq!(names(&document, SYSTEM), ["Sparks"]);
}

/// Applies `edits` under `childParticleSetDefinition` of the system's first complex emitter.
fn edit_children(
    document: &mut BinDocument,
    edits: Vec<ValueEdit>,
) -> Result<(), BinDocumentError> {
    document.edit_property(
        h(SYSTEM),
        &format!("{}[0]", hashed("complexEmitterDefinitionData")),
        &format!("0x{}", hashed("childParticleSetDefinition")),
        edits,
        schema().at(Some(BUILD)),
    )
}

/// Returns the edits that append the child at `index`, which names its system through `field`.
fn add_child(index: usize, field: &str, value: LeafValue) -> Vec<ValueEdit> {
    let children = hashed("childrenIdentifiers");
    vec![
        ValueEdit::EnsurePointer {
            path: String::new(),
            class: "VfxChildParticleSetDefinitionData".to_owned(),
        },
        ValueEdit::EnsureProperty {
            path: String::new(),
            field: format!("0x{children}"),
        },
        ValueEdit::InsertItem {
            path: children.clone(),
            item: crate::bin_document::NewItem {
                index: None,
                key: None,
                class: Some("VfxChildIdentifier".to_owned()),
            },
        },
        ValueEdit::EnsureProperty {
            path: format!("{children}[{index}]"),
            field: format!("0x{}", hashed(field)),
        },
        ValueEdit::SetLeaf {
            path: format!("{children}[{index}].{}", hashed(field)),
            value,
        },
    ]
}

/// Returns the edits that move item 1 of the list `list` to its front.
fn move_to_front(list: &str) -> [ValueEdit; 2] {
    [
        ValueEdit::CopyItem {
            from: format!("{list}[1]"),
            path: list.to_owned(),
            index: Some(0),
            unique: None,
            key: None,
        },
        ValueEdit::RemoveItem {
            path: format!("{list}[2]"),
        },
    ]
}

/// Returns the fields of each child identifier of the first complex emitter, and its bones.
fn child_set(document: &BinDocument) -> (Vec<Vec<BinHash>>, Vec<String>) {
    let PropertyValueEnum::Struct(emitter) =
        &list(document, SYSTEM, "complexEmitterDefinitionData")[0]
    else {
        panic!("an emitter is a pointer");
    };
    let PropertyValueEnum::Struct(set) = &emitter.properties[&h("childParticleSetDefinition")]
    else {
        panic!("the child set is a pointer");
    };
    let items = |field: &str| match set.properties.get(&h(field)) {
        Some(PropertyValueEnum::Container(items)) => items.items().to_vec(),
        Some(other) => panic!("{field} is no list: {other:?}"),
        None => Vec::new(),
    };

    let children = items("childrenIdentifiers")
        .iter()
        .map(|item| match item {
            PropertyValueEnum::Embedded(values::Embedded(inner)) => {
                inner.properties.keys().copied().collect()
            }
            other => panic!("a child identifier is an embed: {other:?}"),
        })
        .collect();
    let bones = items("boneToSpawnAt")
        .iter()
        .map(|item| match item {
            PropertyValueEnum::String(text) => text.value.clone(),
            other => panic!("a bone is a string: {other:?}"),
        })
        .collect();
    (children, bones)
}

#[test]
fn a_child_set_takes_a_link_a_key_bones_a_move_and_a_removal() {
    let mut document = document(&["Flash"], &[]);
    let children = hashed("childrenIdentifiers");
    let bones = hashed("boneToSpawnAt");
    let link = LeafValue::ObjectLink {
        text: format!("0x{}", hashed(OTHER)),
    };
    let key = LeafValue::Hash {
        text: "Teemo_R_Key".to_owned(),
    };
    let bone = crate::bin_document::NewItem {
        index: None,
        key: None,
        class: None,
    };

    edit_children(&mut document, add_child(0, "effect", link)).unwrap();
    edit_children(&mut document, add_child(1, "effectKey", key)).unwrap();
    edit_children(
        &mut document,
        vec![
            ValueEdit::EnsureProperty {
                path: String::new(),
                field: format!("0x{bones}"),
            },
            ValueEdit::InsertItem {
                path: bones.clone(),
                item: bone.clone(),
            },
            ValueEdit::InsertItem {
                path: bones.clone(),
                item: bone,
            },
            ValueEdit::SetLeaf {
                path: format!("{bones}[1]"),
                value: LeafValue::String {
                    value: "Head".to_owned(),
                },
            },
        ],
    )
    .unwrap();
    assert_eq!(
        child_set(&document),
        (
            vec![vec![h("effect")], vec![h("effectKey")]],
            vec![String::new(), "Head".to_owned()]
        )
    );

    let moved = [move_to_front(&children), move_to_front(&bones)].concat();
    edit_children(&mut document, moved).unwrap();
    assert_eq!(
        child_set(&document),
        (
            vec![vec![h("effectKey")], vec![h("effect")]],
            vec!["Head".to_owned(), String::new()]
        )
    );

    edit_children(
        &mut document,
        vec![
            ValueEdit::RemoveItem {
                path: format!("{children}[0]"),
            },
            ValueEdit::RemoveItem {
                path: format!("{bones}[0]"),
            },
        ],
    )
    .unwrap();
    assert_eq!(
        child_set(&document),
        (vec![vec![h("effect")]], vec![String::new()])
    );

    assert!(document.undo().unwrap());
    assert_eq!(child_set(&document).0.len(), 2);
}

fn paste_into(
    target: &mut BinDocument,
    system: &str,
    objects: &[ObjectCreation],
    text: &str,
) -> Result<(), BinDocumentError> {
    target.create_and_edit(
        objects,
        vec![PropertyEdit {
            entry: hex(h(system)),
            holder: String::new(),
            field: format!("0x{}", hashed("complexEmitterDefinitionData")),
            edits: vec![ValueEdit::PasteItem {
                path: String::new(),
                index: None,
                text: text.to_owned(),
                unique: unique(),
                key: None,
            }],
        }],
        schema().at(Some(BUILD)),
    )
}

fn pasted_system(text: String) -> ObjectCreation {
    ObjectCreation {
        name: SYSTEM.to_owned(),
        origin: NewObject::Paste { text },
    }
}

#[test]
fn create_and_edit_pastes_object_and_emitter_as_one_step() {
    let source = document(&["Spark"], &[]);
    let object = copy(&source, "");
    let spark = copy(
        &source,
        &format!("{}[0]", hashed("complexEmitterDefinitionData")),
    );
    let mut target = BinDocument::parse(bin_bytes(OTHER, &["Ember"], &[])).unwrap();

    paste_into(&mut target, OTHER, &[pasted_system(object)], &spark).unwrap();

    assert_eq!(target.object_at(h(SYSTEM)), source.object_at(h(SYSTEM)));
    assert_eq!(names(&target, OTHER), ["Ember", "Spark"]);
    assert!(target.undo().unwrap());
    assert!(target.object_at(h(SYSTEM)).is_none());
    assert_eq!(names(&target, OTHER), ["Ember"]);
}

#[test]
fn create_and_edit_takes_back_created_objects_on_refusal() {
    let source = document(&["Spark"], &[]);
    let object = copy(&source, "");
    let mut target = BinDocument::parse(bin_bytes(OTHER, &["Ember"], &[])).unwrap();

    let refused = paste_into(&mut target, OTHER, &[pasted_system(object)], "Spark");

    assert_eq!(rejection(refused), EditRejection::NotACopy);
    assert!(target.object_at(h(SYSTEM)).is_none());
    assert!(!target.undo().unwrap());
}

const CHUNK: &str = "Maps/MapGeometry/Map11/Base/Chunk";

/// A chunk holding one `MapLocator` under the key of `Locator1`.
fn chunk() -> BinDocument {
    let locator = class(
        "MapLocator",
        vec![("name", values::String::from("Locator1").into())],
    );
    let items = values::Map::new(
        Kind::Hash,
        Kind::Struct,
        vec![(values::Hash::new(h("Locator1")).into(), locator.into())],
    )
    .unwrap();
    let object = BinObject::builder(h(CHUNK), h("MapPlaceableContainer"))
        .property(h("items"), items)
        .build();
    let mut out = Cursor::new(Vec::new());
    Bin::new([object], std::iter::empty::<&str>())
        .to_writer(&mut out)
        .unwrap();
    BinDocument::parse(out.into_inner()).unwrap()
}

fn edit_items(document: &mut BinDocument, edit: ValueEdit) -> Result<(), BinDocumentError> {
    document.edit_property(
        h(CHUNK),
        "",
        &format!("0x{}", hashed("items")),
        vec![edit],
        schema().at(Some(BUILD)),
    )
}

fn item_keys(document: &BinDocument) -> Vec<BinHash> {
    match &document.object_at(h(CHUNK)).unwrap().properties[&h("items")] {
        PropertyValueEnum::Map(map) => map
            .entries()
            .iter()
            .map(|(key, _)| match key {
                PropertyValueEnum::Hash(hash) => hash.value.try_as_bin_hash().unwrap(),
                other => panic!("an item key is a hash: {other:?}"),
            })
            .collect(),
        other => panic!("items is no map: {other:?}"),
    }
}

#[test]
fn copy_item_lands_map_entry_under_key() {
    let mut document = chunk();

    edit_items(
        &mut document,
        ValueEdit::CopyItem {
            from: format!("{{{}}}", hashed("Locator1")),
            path: String::new(),
            index: None,
            unique: None,
            key: Some("Locator2".to_owned()),
        },
    )
    .unwrap();

    assert_eq!(item_keys(&document), [h("Locator1"), h("Locator2")]);
    assert!(document.undo().unwrap());
    assert_eq!(item_keys(&document), [h("Locator1")]);
}

#[test]
fn paste_item_lands_map_entry_under_key() {
    let mut document = chunk();
    let text = document
        .copy_value(
            h(CHUNK),
            &format!("{}{{{}}}", hashed("items"), hashed("Locator1")),
            schema().at(Some(BUILD)),
        )
        .unwrap();

    edit_items(
        &mut document,
        ValueEdit::PasteItem {
            path: String::new(),
            index: Some(0),
            text,
            unique: None,
            key: Some(format!("0x{}", hashed("Locator0"))),
        },
    )
    .unwrap();

    assert_eq!(item_keys(&document), [h("Locator0"), h("Locator1")]);
}

#[test]
fn copy_item_refuses_key_the_map_holds() {
    let mut document = chunk();

    let refused = edit_items(
        &mut document,
        ValueEdit::CopyItem {
            from: format!("{{{}}}", hashed("Locator1")),
            path: String::new(),
            index: None,
            unique: None,
            key: Some("Locator1".to_owned()),
        },
    );

    assert_eq!(rejection(refused), EditRejection::KeyExists);
}

#[test]
fn create_object_refuses_paste_of_value_that_is_no_struct() {
    let source = document(&["Spark"], &[]);
    let text = copy(&source, &hashed("particleName"));
    let mut target = BinDocument::parse(bin_bytes(OTHER, &[], &[])).unwrap();

    let refused = target
        .create_object(SYSTEM, &NewObject::Paste { text })
        .map(|_| ());

    assert_eq!(rejection(refused), EditRejection::InvalidShape);
}
