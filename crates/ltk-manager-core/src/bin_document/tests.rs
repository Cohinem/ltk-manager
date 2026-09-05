//! Unit tests for the bin document: the row projection over a bin built with the
//! toolkit's writer, the address in both forms, and the store the app keeps documents in.

use super::*;
use ltk_hash::Hash as _;
use ltk_meta::path::PropertyPath;
use ltk_meta::property::NoMeta;
use ltk_meta::{Bin, BinOverride, PropertyPatch};
use std::collections::HashMap;

fn h(text: &str) -> BinHash {
    BinHash::hash_str(text)
}

fn wire(field: &str) -> String {
    format!("{:08x}", h(field))
}

const UNNAMED_FIELD: u32 = 0x9c4e_1b02;
const UNNAMED_OBJECT: u32 = 0x1234_5678;
const UNNAMED_KEY: u32 = 0xdead_beef;

fn embedded(class: &str, properties: Vec<(BinHash, PropertyValueEnum)>) -> values::Embedded {
    values::Embedded(values::Struct {
        class_hash: h(class),
        properties: properties.into_iter().collect(),
        meta: NoMeta,
    })
}

/// The skin object of the design's own example, with one property of every shape.
fn skin() -> BinObject {
    let mesh = embedded(
        "SkinMeshDataProperties",
        vec![
            (h("material"), values::Hash::new(h("Aatrox_Mat")).into()),
            (
                h("texture"),
                values::WadChunkLink::new(WadHash::hash_str("assets/aatrox.tex")).into(),
            ),
        ],
    );
    let lookup = values::Map::new(
        Kind::Hash,
        Kind::String,
        vec![
            (
                values::Hash::new(h("weapon")).into(),
                values::String::from("sword").into(),
            ),
            (
                values::Hash::new(UNNAMED_KEY).into(),
                values::String::from("shield").into(),
            ),
        ],
    )
    .unwrap();
    let parts = values::Container::new(
        Kind::Embedded,
        vec![embedded("Part", vec![(h("name"), values::String::from("p0").into())]).into()],
    )
    .unwrap();

    BinObject::builder(
        h("Characters/Aatrox/Skins/Skin0/Resources"),
        h("SkinCharacterDataProperties"),
    )
    .property(h("skinClassification"), values::I32::new(1))
    .property(
        h("championSkinName"),
        values::String::from("Justicar Aatrox"),
    )
    .property(h("skinMeshProperties"), mesh)
    .property(
        h("armorMaterial"),
        values::Container::from(vec![
            values::I32::new(10),
            values::I32::new(20),
            values::I32::new(30),
        ]),
    )
    .property(h("lookup"), lookup)
    .property(
        h("maybe"),
        values::Optional::from(Some(values::F32::new(1.5))),
    )
    .property(
        h("never"),
        values::Optional::<NoMeta>::empty(Kind::I32).unwrap(),
    )
    .property(h("pointer"), values::Struct::default())
    .property(h("link"), values::ObjectLink::new(h("Characters/Aatrox")))
    .property(h("bits"), values::BitBool::new(true))
    .property(h("big"), values::U64::new(u64::MAX))
    .property(h("origin"), values::Vector3::default())
    .property(h("basis"), values::Matrix44::default())
    .property(h("tint"), values::Color::default())
    .property(h("parts"), parts)
    .property(
        h("unordered"),
        values::UnorderedContainer::from(values::Container::from(vec![values::U8::new(7)])),
    )
    .property(
        h("classed"),
        values::Struct {
            class_hash: h("Part"),
            properties: [(h("name"), values::String::from("s0").into())]
                .into_iter()
                .collect(),
            meta: NoMeta,
        },
    )
    .property(UNNAMED_FIELD, values::Bool::new(false))
    .build()
}

fn prop_bytes() -> Vec<u8> {
    let bin = Bin::<NoMeta>::builder()
        .dependency("common.bin")
        .object(skin())
        .object(BinObject::new(h("Characters/Aatrox"), h("CharacterRecord")))
        .object(BinObject::new(UNNAMED_OBJECT, 0xabcd_ef01u32))
        .build();
    let mut out = Cursor::new(Vec::new());
    bin.to_writer(&mut out).unwrap();
    out.into_inner()
}

fn document() -> BinDocument {
    BinDocument::parse(&prop_bytes()).unwrap()
}

/// Tables that name what the fixture writes with a name, and nothing else.
#[derive(Default)]
struct Tables {
    entries: HashMap<BinHash, &'static str>,
    classes: HashMap<BinHash, &'static str>,
    fields: HashMap<BinHash, &'static str>,
    values: HashMap<BinHash, &'static str>,
    chunks: HashMap<WadHash, &'static str>,
}

fn named() -> Tables {
    let bin = |names: &[&'static str]| -> HashMap<BinHash, &'static str> {
        names.iter().map(|name| (h(name), *name)).collect()
    };
    Tables {
        entries: bin(&[
            "Characters/Aatrox/Skins/Skin0/Resources",
            "Characters/Aatrox",
        ]),
        classes: bin(&[
            "SkinCharacterDataProperties",
            "SkinMeshDataProperties",
            "CharacterRecord",
            "Part",
        ]),
        fields: bin(&[
            "skinClassification",
            "championSkinName",
            "skinMeshProperties",
            "material",
            "texture",
            "armorMaterial",
            "lookup",
            "maybe",
            "never",
            "pointer",
            "link",
            "bits",
            "big",
            "origin",
            "basis",
            "tint",
            "parts",
            "unordered",
            "classed",
            "name",
        ]),
        values: bin(&["Aatrox_Mat", "weapon"]),
        chunks: [(WadHash::hash_str("assets/aatrox.tex"), "assets/aatrox.tex")]
            .into_iter()
            .collect(),
    }
}

fn visit_each<K: std::hash::Hash + Eq>(
    table: &HashMap<K, &'static str>,
    hashes: &[K],
    visit: &mut dyn FnMut(usize, &str),
) {
    for (at, hash) in hashes.iter().enumerate() {
        if let Some(name) = table.get(hash) {
            visit(at, name);
        }
    }
}

impl RowNames for Tables {
    fn for_each_entry(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        visit_each(&self.entries, hashes, visit);
    }

    fn for_each_class(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        visit_each(&self.classes, hashes, visit);
    }

    fn for_each_field(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        visit_each(&self.fields, hashes, visit);
    }

    fn for_each_value(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        visit_each(&self.values, hashes, visit);
    }

    fn for_each_chunk(&self, hashes: &[WadHash], visit: &mut dyn FnMut(usize, &str)) {
        visit_each(&self.chunks, hashes, visit);
    }
}

/// The rows under `path` of the skin object, all of them, named.
fn under(path: &str) -> Vec<BinRow> {
    document()
        .children(
            h("Characters/Aatrox/Skins/Skin0/Resources"),
            path,
            0,
            usize::MAX,
            &named(),
        )
        .unwrap()
        .rows
}

fn row<'a>(rows: &'a [BinRow], name: &str) -> &'a BinRow {
    rows.iter()
        .find(|row| row.name == name)
        .unwrap_or_else(|| panic!("no row named {name}"))
}

#[test]
fn roots_name_every_object_and_count_its_properties() {
    let rows = document().roots(&named());

    let names: Vec<_> = rows.iter().map(|row| row.name.as_str()).collect();
    assert_eq!(
        names,
        [
            "Characters/Aatrox/Skins/Skin0/Resources",
            "Characters/Aatrox",
            "0x12345678"
        ]
    );
    assert!(rows.iter().all(|row| row.node == RowNode::Object));
    assert!(rows.iter().all(|row| row.kind.is_none()));
    assert!(
        rows.iter()
            .all(|row| row.path.is_empty() && row.label.is_empty())
    );
    assert_eq!(
        rows[0].entry,
        hex(h("Characters/Aatrox/Skins/Skin0/Resources"))
    );
    assert_eq!(
        rows[0].value,
        BinValue::Struct {
            class_hash: hex(h("SkinCharacterDataProperties")),
            class: Some("SkinCharacterDataProperties".to_owned()),
            len: 18,
        }
    );
    assert!(!rows[0].unnamed);
    assert!(rows[2].unnamed);
    assert_eq!(
        rows[2].value,
        BinValue::Struct {
            class_hash: "0xabcdef01".to_owned(),
            class: None,
            len: 0,
        }
    );
}

#[test]
fn an_object_expands_to_its_properties_in_file_order() {
    let rows = under("");

    assert_eq!(rows.len(), 18);
    assert_eq!(rows[0].name, "skinClassification");
    assert_eq!(rows[0].node, RowNode::Property);
    assert_eq!(rows[0].kind, Some(PropertyKind::I32));
    assert_eq!(rows[0].path, wire("skinClassification"));
    assert_eq!(rows[0].label, "skinClassification");
    assert_eq!(
        rows[0].value,
        BinValue::Integer {
            text: "1".to_owned()
        }
    );
    assert_eq!(rows[1].name, "championSkinName");
    assert_eq!(
        rows[1].value,
        BinValue::String {
            value: "Justicar Aatrox".to_owned()
        }
    );
    assert_eq!(rows[17].name, "0x9c4e1b02");
}

#[test]
fn a_field_no_table_names_is_hex_in_the_name_and_the_label() {
    let rows = under("");
    let row = row(&rows, "0x9c4e1b02");

    assert!(row.unnamed);
    assert_eq!(row.path, format!("{UNNAMED_FIELD:08x}"));
    assert_eq!(row.label, "0x9c4e1b02");
    assert_eq!(row.value, BinValue::Bool { value: false });
}

#[test]
fn nothing_named_draws_every_hash_as_hex() {
    let rows = document()
        .children(
            h("Characters/Aatrox/Skins/Skin0/Resources"),
            &wire("skinMeshProperties"),
            0,
            usize::MAX,
            &(),
        )
        .unwrap()
        .rows;

    assert_eq!(rows[0].name, hex(h("material")));
    assert_eq!(
        rows[0].label,
        format!("0x{}.0x{}", wire("skinMeshProperties"), wire("material"))
    );
    assert_eq!(
        rows[0].value,
        BinValue::Hash {
            hash: hex(h("Aatrox_Mat")),
            name: None
        }
    );
}

#[test]
fn an_embedded_expands_through_its_class_and_names_what_its_leaves_point_at() {
    let rows = under("");
    let mesh = row(&rows, "skinMeshProperties");
    assert_eq!(mesh.kind, Some(PropertyKind::Embedded));
    assert_eq!(
        mesh.value,
        BinValue::Struct {
            class_hash: hex(h("SkinMeshDataProperties")),
            class: Some("SkinMeshDataProperties".to_owned()),
            len: 2,
        }
    );

    let inner = under(&mesh.path);
    assert_eq!(inner.len(), 2);
    assert_eq!(
        inner[0].path,
        format!("{}.{}", wire("skinMeshProperties"), wire("material"))
    );
    assert_eq!(inner[0].label, "skinMeshProperties.material");
    assert_eq!(
        inner[0].value,
        BinValue::Hash {
            hash: hex(h("Aatrox_Mat")),
            name: Some("Aatrox_Mat".to_owned()),
        }
    );
    assert_eq!(
        inner[1].value,
        BinValue::WadChunkLink {
            hash: format!("{:016x}", WadHash::hash_str("assets/aatrox.tex")),
            path: Some("assets/aatrox.tex".to_owned()),
        }
    );
}

#[test]
fn a_container_indexes_its_elements() {
    let rows = under("");
    let list = row(&rows, "armorMaterial");
    assert_eq!(list.value, BinValue::Container { len: 3 });

    let items = under(&list.path);
    let names: Vec<_> = items.iter().map(|row| row.name.as_str()).collect();
    assert_eq!(names, ["[0]", "[1]", "[2]"]);
    assert!(items.iter().all(|row| row.node == RowNode::Element));
    assert_eq!(items[1].path, format!("{}[1]", wire("armorMaterial")));
    assert_eq!(items[1].label, "armorMaterial[1]");
    assert_eq!(
        items[1].value,
        BinValue::Integer {
            text: "20".to_owned()
        }
    );
}

#[test]
fn an_unordered_container_indexes_its_elements_like_an_ordered_one() {
    let rows = under("");
    let list = row(&rows, "unordered");
    assert_eq!(list.kind, Some(PropertyKind::UnorderedContainer));
    assert_eq!(list.value, BinValue::Container { len: 1 });

    let items = under(&list.path);
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].name, "[0]");
    assert_eq!(items[0].label, "unordered[0]");
    assert_eq!(
        items[0].value,
        BinValue::Integer {
            text: "7".to_owned()
        }
    );
}

#[test]
fn a_struct_with_a_class_shows_it_and_expands_to_its_properties() {
    let rows = under("");
    let classed = row(&rows, "classed");
    assert_eq!(classed.kind, Some(PropertyKind::Struct));
    assert_eq!(
        classed.value,
        BinValue::Struct {
            class_hash: hex(h("Part")),
            class: Some("Part".to_owned()),
            len: 1,
        }
    );

    let inner = under(&classed.path);
    assert_eq!(inner.len(), 1);
    assert_eq!(inner[0].name, "name");
    assert_eq!(inner[0].label, "classed.name");
    assert_eq!(
        inner[0].value,
        BinValue::String {
            value: "s0".to_owned()
        }
    );
}

#[test]
fn a_range_answers_a_window_and_the_total() {
    let list = wire("armorMaterial");
    let page = document()
        .children(
            h("Characters/Aatrox/Skins/Skin0/Resources"),
            &list,
            1,
            1,
            &named(),
        )
        .unwrap();

    assert_eq!(page.total, 3);
    assert_eq!(page.rows.len(), 1);
    assert_eq!(page.rows[0].name, "[1]");

    let past_the_end = document()
        .children(
            h("Characters/Aatrox/Skins/Skin0/Resources"),
            &list,
            5,
            1,
            &named(),
        )
        .unwrap();
    assert_eq!(past_the_end.total, 3);
    assert!(past_the_end.rows.is_empty());
}

#[test]
fn a_map_keys_its_entries() {
    let rows = under("");
    let map = row(&rows, "lookup");
    assert_eq!(
        map.value,
        BinValue::Map {
            len: 2,
            key_kind: PropertyKind::Hash,
            value_kind: PropertyKind::String,
        }
    );

    let entries = under(&map.path);
    assert_eq!(entries.len(), 2);
    assert!(entries.iter().all(|row| row.node == RowNode::Entry));

    assert_eq!(entries[0].name, "\"weapon\"");
    assert!(!entries[0].unnamed);
    assert_eq!(
        entries[0].path,
        format!("{}{{{}}}", wire("lookup"), wire("weapon"))
    );
    assert_eq!(entries[0].label, "lookup{\"weapon\"}");
    assert_eq!(
        entries[0].value,
        BinValue::String {
            value: "sword".to_owned()
        }
    );

    assert_eq!(entries[1].name, "0xdeadbeef");
    assert!(entries[1].unnamed);
    assert_eq!(entries[1].path, format!("{}{{deadbeef}}", wire("lookup")));
    assert_eq!(entries[1].label, "lookup{0xdeadbeef}");
}

#[test]
fn a_present_optional_holds_index_zero_and_an_absent_one_nothing() {
    let rows = under("");

    let maybe = row(&rows, "maybe");
    assert_eq!(maybe.value, BinValue::Optional { present: true });
    let inside = under(&maybe.path);
    assert_eq!(inside.len(), 1);
    assert_eq!(inside[0].name, "[0]");
    assert_eq!(inside[0].label, "maybe[0]");
    assert_eq!(inside[0].value, BinValue::Float { value: 1.5 });

    let never = row(&rows, "never");
    assert_eq!(never.value, BinValue::Optional { present: false });
    assert!(under(&never.path).is_empty());
}

#[test]
fn a_null_struct_draws_null_and_has_no_children() {
    let rows = under("");
    let pointer = row(&rows, "pointer");

    assert_eq!(pointer.kind, Some(PropertyKind::Struct));
    assert_eq!(pointer.value, BinValue::Null);
    assert!(under(&pointer.path).is_empty());
}

#[test]
fn every_leaf_kind_projects_into_its_widget() {
    let rows = under("");

    assert_eq!(row(&rows, "bits").value, BinValue::Bool { value: true });
    assert_eq!(row(&rows, "bits").kind, Some(PropertyKind::BitBool));
    assert_eq!(
        row(&rows, "big").value,
        BinValue::Integer {
            text: u64::MAX.to_string()
        }
    );
    assert_eq!(
        row(&rows, "origin").value,
        BinValue::Vector {
            values: vec![0.0, 0.0, 0.0]
        }
    );
    let BinValue::Matrix { values } = &row(&rows, "basis").value else {
        panic!("a matrix");
    };
    assert_eq!(values.len(), 16);
    assert_eq!(
        row(&rows, "tint").value,
        BinValue::Color {
            r: 0,
            g: 0,
            b: 0,
            a: 0
        }
    );
    assert_eq!(
        row(&rows, "link").value,
        BinValue::ObjectLink {
            hash: hex(h("Characters/Aatrox")),
            name: Some("Characters/Aatrox".to_owned()),
        }
    );
}

#[test]
fn a_nested_address_reads_its_parent_label_back_from_the_tables() {
    let path = format!("{}[0]", wire("parts"));
    let inside = under(&path);

    assert_eq!(inside.len(), 1);
    assert_eq!(inside[0].name, "name");
    assert_eq!(
        inside[0].path,
        format!("{}[0].{}", wire("parts"), wire("name"))
    );
    assert_eq!(inside[0].label, "parts[0].name");
}

#[test]
fn an_address_the_document_does_not_hold_is_an_error() {
    let document = document();
    let entry = h("Characters/Aatrox/Skins/Skin0/Resources");
    let not_found = |entry: BinHash, path: &str| {
        let error = document
            .children(entry, path, 0, usize::MAX, &())
            .unwrap_err();
        assert!(
            matches!(error, BinDocumentError::NodeNotFound { .. }),
            "{path:?} should be no node: {error}"
        );
    };

    not_found(BinHash(0x0bad_0bad), "");
    not_found(entry, &wire("noSuchField"));
    not_found(entry, &format!("{}[3]", wire("armorMaterial")));
    not_found(entry, &format!("{}{{{}}}", wire("lookup"), wire("shield")));
    not_found(
        entry,
        &format!("{}.{}", wire("skinClassification"), wire("x")),
    );
    not_found(entry, &format!("{}[0]", wire("never")));
    not_found(entry, "garbage");
    not_found(entry, &format!(".{}", wire("skinClassification")));
}

#[test]
fn a_wire_path_parses_into_its_steps() {
    assert_eq!(parse_steps(""), Some(Vec::new()));
    assert_eq!(
        parse_steps("9c4e1b02[3].1a2b3c4d{\"we}ird\"}{7}"),
        Some(vec![
            Step::Field(BinHash(0x9c4e_1b02)),
            Step::Index(3),
            Step::Field(BinHash(0x1a2b_3c4d)),
            Step::Key("\"we}ird\"".to_owned()),
            Step::Key("7".to_owned()),
        ])
    );
    assert_eq!(parse_steps("9c4e1b0"), None);
    assert_eq!(parse_steps("9c4e1b02.zzzzzzzz"), None);
    assert_eq!(parse_steps("9c4e1b02[x]"), None);
    assert_eq!(parse_steps("9c4e1b02{\"open"), None);
}

#[test]
fn a_patch_bin_opens_to_its_added_objects_and_counts_what_it_does_not_draw() {
    let mut patch = BinOverride::<NoMeta>::new();
    patch.deleted.push(h("Characters/Gone"));
    let added = BinObject::new(h("Characters/Aatrox"), h("CharacterRecord"));
    patch.objects.insert(added.path_hash, added);
    for _ in 0..2 {
        patch.patches.push(PropertyPatch::new(
            h("Characters/Aatrox"),
            PropertyPath::new("mValue").unwrap(),
            values::U32::new(2),
        ));
    }
    let mut out = Cursor::new(Vec::new());
    patch.to_writer(&mut out).unwrap();

    let document = BinDocument::parse(&out.into_inner()).unwrap();
    assert_eq!(
        document.header(),
        BinHeader {
            kind: BinFileKind::Patch,
            version: None,
            objects: 1,
            dependencies: Vec::new(),
            patches: 2,
            deleted: 1,
        }
    );
    let rows = document.roots(&named());
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].name, "Characters/Aatrox");
}

#[test]
fn a_prop_header_carries_its_version_and_dependencies() {
    assert_eq!(
        document().header(),
        BinHeader {
            kind: BinFileKind::Prop,
            version: Some(3),
            objects: 3,
            dependencies: vec!["common.bin".to_owned()],
            patches: 0,
            deleted: 0,
        }
    );
}

#[test]
fn bytes_that_are_not_a_bin_do_not_open() {
    let error = BinDocument::parse(b"DDS \0\0\0\0").unwrap_err();
    assert!(matches!(error, BinDocumentError::Unreadable(_)));

    let error = BinDocuments::default().open(b"PROP").unwrap_err();
    assert!(error.to_string().contains("not a readable bin"), "{error}");
}

#[test]
fn the_store_evicts_the_least_recently_used_past_its_capacity() {
    let store = BinDocuments::new(NonZeroUsize::new(2).unwrap());
    let bytes = prop_bytes();

    let first = store.open(&bytes).unwrap();
    let second = store.open(&bytes).unwrap();
    store.read(first, |_| Ok(())).unwrap();
    let third = store.open(&bytes).unwrap();

    assert!(store.is_open(first).unwrap());
    assert!(!store.is_open(second).unwrap());
    assert!(store.is_open(third).unwrap());
    assert_ne!(first, second);
}

#[test]
fn a_closed_document_is_not_open_and_closing_it_again_is_nothing() {
    let store = BinDocuments::default();
    let id = store.open(&prop_bytes()).unwrap();

    store.close(id).unwrap();
    store.close(id).unwrap();

    assert!(!store.is_open(id).unwrap());
    let error = store.read(id, |_| Ok(())).unwrap_err();
    assert!(error.to_string().contains("is not open"), "{error}");
}
