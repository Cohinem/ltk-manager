use ltk_meta::BinObject;
use ltk_meta::property::{Kind, values};

use super::*;
use crate::map::fixtures::{document_of, embedded, h};

fn definition(name: &str, bit: u8) -> ltk_meta::PropertyValueEnum {
    embedded(
        "MapVisibilityFlagDefinition",
        vec![
            (PUBLIC_NAME, values::String::from(name).into()),
            (BIT_INDEX, values::U8::new(bit).into()),
        ],
    )
}

fn map_object(definitions: Vec<ltk_meta::PropertyValueEnum>) -> BinObject {
    let list = values::Container::new(Kind::Embedded, definitions).unwrap();
    let defines = embedded(
        "MapVisibilityFlagDefinitions",
        vec![(FLAG_DEFINITIONS, list.into())],
    );
    BinObject::builder(h("Maps/Shipping/Map11"), MAP)
        .property(FLAG_DEFINES, defines)
        .build()
}

#[test]
fn map_bin_path_lowers_map_id_segment() {
    let map = MapPath::from("Maps/MapGeometry/Map11/Base_SRX");

    assert_eq!(
        map_bin_path(&map).as_deref(),
        Some("data/maps/shipping/map11/map11.bin")
    );
    assert_eq!(map_bin_path(&MapPath::from("Maps/MapGeometry")), None);
}

#[test]
fn map_flags_reads_public_name_and_bit_index() {
    let document = document_of(vec![map_object(vec![
        definition("Infernal", 1),
        definition("Ocean", 3),
    ])]);

    assert_eq!(
        map_flags(&document),
        [
            MapFlag {
                bit: 1,
                name: "Infernal".to_owned()
            },
            MapFlag {
                bit: 3,
                name: "Ocean".to_owned()
            },
        ]
    );
}

#[test]
fn map_flags_skips_definition_without_name_or_with_bit_out_of_range() {
    let document = document_of(vec![map_object(vec![
        definition("", 0),
        definition("Void", 9),
        definition("Cloud", 4),
    ])]);

    assert_eq!(
        map_flags(&document),
        [MapFlag {
            bit: 4,
            name: "Cloud".to_owned()
        }]
    );
}

#[test]
fn map_flags_is_empty_without_map_object() {
    assert!(map_flags(&document_of(Vec::new())).is_empty());
}
