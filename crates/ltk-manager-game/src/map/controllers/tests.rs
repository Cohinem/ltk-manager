use ltk_meta::property::{Kind, values};
use ltk_meta::{BinObject, PropertyValueEnum};

use super::*;
use crate::map::fixtures::{document_of, h};

/// The path hashes of the fixture controllers.
const BASE_PIT: BinHash = BinHash(0x5e65_2742);
const OCEAN: BinHash = BinHash(0x3c5b_24f7);
const BARON_STAGE: BinHash = BinHash(0xf496_8631);
const NAMED: BinHash = BinHash(0xca63_c5fe);

fn controller(
    entry: BinHash,
    class: BinHash,
    properties: Vec<(BinHash, PropertyValueEnum)>,
) -> BinObject {
    properties
        .into_iter()
        .fold(
            BinObject::builder(entry, class),
            |object, (field, value)| object.property(field, value),
        )
        .build()
}

fn links(parents: &[BinHash]) -> PropertyValueEnum {
    values::UnorderedContainer(
        values::Container::new(
            Kind::ObjectLink,
            parents
                .iter()
                .map(|parent| values::ObjectLink::new(*parent).into())
                .collect(),
        )
        .unwrap(),
    )
    .into()
}

fn rule_of(controllers: &[MapController], entry: BinHash) -> &MapControllerRule {
    &controllers
        .iter()
        .find(|controller| controller.hash == hex(entry))
        .unwrap()
        .rule
}

#[test]
fn map_controllers_reads_default_visible_and_terrain_layers() {
    let document = document_of(vec![controller(
        OCEAN,
        TERRAIN_CONTROLLER,
        vec![
            (DEFAULT_VISIBLE, values::Bool::new(false).into()),
            (TERRAIN_LAYERS, values::U8::new(8).into()),
        ],
    )]);

    assert_eq!(
        map_controllers(&document, &()),
        vec![MapController {
            hash: "0x3c5b24f7".to_owned(),
            name: None,
            rule: MapControllerRule::Named {
                default_visible: false,
                terrain: 8,
                stage: 0,
            },
        }]
    );
}

#[test]
fn map_controllers_defaults_default_visible_to_true() {
    let document = document_of(vec![controller(NAMED, NAMED_CONTROLLER, vec![])]);

    assert_eq!(
        rule_of(&map_controllers(&document, &()), NAMED),
        &MapControllerRule::Named {
            default_visible: true,
            terrain: 0,
            stage: 0,
        }
    );
}

/// Tables that name one `Hash` value and one object path, and nothing else.
struct Tables;

impl RowNames for Tables {
    fn for_each_entry(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        for (at, hash) in hashes.iter().enumerate() {
            if *hash == h(BASE_PIT_PATH) {
                visit(at, BASE_PIT_PATH);
            }
        }
    }

    fn for_each_class(&self, _hashes: &[BinHash], _visit: &mut dyn FnMut(usize, &str)) {}

    fn for_each_field(&self, _hashes: &[BinHash], _visit: &mut dyn FnMut(usize, &str)) {}

    fn for_each_value(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        for (at, hash) in hashes.iter().enumerate() {
            if *hash == h("BaronPit_Tunnel") {
                visit(at, "BaronPit_Tunnel");
            }
        }
    }

    fn for_each_chunk(&self, _hashes: &[ltk_hash::WadHash], _visit: &mut dyn FnMut(usize, &str)) {}
}

const BASE_PIT_PATH: &str = "Maps/MapGeometry/Map11/Base_SRX/Controllers/BasePit";

#[test]
fn map_controllers_names_a_controller_by_its_name_hash_then_by_its_object_path() {
    let document = document_of(vec![
        controller(
            BARON_STAGE,
            BARON_CONTROLLER,
            vec![(NAME, values::Hash::new(h("BaronPit_Tunnel")).into())],
        ),
        controller(h(BASE_PIT_PATH), CHILD_CONTROLLER, vec![]),
        controller(
            OCEAN,
            TERRAIN_CONTROLLER,
            vec![(NAME, values::Hash::new(h("Unlisted")).into())],
        ),
    ]);
    let controllers = map_controllers(&document, &Tables);
    let name_of = |entry: BinHash| {
        controllers
            .iter()
            .find(|controller| controller.hash == hex(entry))
            .unwrap()
            .name
            .as_deref()
    };

    assert_eq!(name_of(BARON_STAGE), Some("BaronPit_Tunnel"));
    assert_eq!(name_of(h(BASE_PIT_PATH)), Some(BASE_PIT_PATH));
    assert_eq!(name_of(OCEAN), None);
}

#[test]
fn map_controllers_reads_stage_bits() {
    let document = document_of(vec![controller(
        BARON_STAGE,
        BARON_CONTROLLER,
        vec![(STAGE_BITS, values::U8::new(4).into())],
    )]);

    assert_eq!(
        rule_of(&map_controllers(&document, &()), BARON_STAGE),
        &MapControllerRule::Named {
            default_visible: true,
            terrain: 0,
            stage: 4,
        }
    );
}

#[test]
fn map_controllers_reads_parents_and_parent_mode() {
    let document = document_of(vec![
        controller(
            BASE_PIT,
            CHILD_CONTROLLER,
            vec![
                (PARENTS, links(&[OCEAN, BARON_STAGE])),
                (PARENT_MODE, values::U32::new(3).into()),
            ],
        ),
        controller(
            h("Unstated"),
            CHILD_CONTROLLER,
            vec![(PARENTS, links(&[OCEAN]))],
        ),
    ]);
    let controllers = map_controllers(&document, &());

    assert_eq!(
        rule_of(&controllers, BASE_PIT),
        &MapControllerRule::Child {
            parents: vec!["0x3c5b24f7".to_owned(), "0xf4968631".to_owned()],
            mode: MapParentMode::None,
        }
    );
    assert_eq!(
        rule_of(&controllers, h("Unstated")),
        &MapControllerRule::Child {
            parents: vec!["0x3c5b24f7".to_owned()],
            mode: MapParentMode::All,
        },
        "ParentMode defaults to zero when the object does not write it"
    );
}

#[test]
fn map_controllers_returns_driven_for_unknown_parent_mode() {
    let document = document_of(vec![controller(
        BASE_PIT,
        CHILD_CONTROLLER,
        vec![(PARENT_MODE, values::U32::new(4).into())],
    )]);

    assert_eq!(
        rule_of(&map_controllers(&document, &()), BASE_PIT),
        &MapControllerRule::Driven
    );
}

#[test]
fn map_controllers_reads_mutator_layer_and_logic_driver_rules() {
    let document = document_of(vec![
        controller(
            h("Mutator"),
            MUTATOR_CONTROLLER,
            vec![(
                MUTATOR_NAME,
                values::String::from("SR_Hall_Of_Legends").into(),
            )],
        ),
        controller(
            h("Layer"),
            LAYER_CONTROLLER,
            vec![(VIS_FLAGS, values::U8::new(0b0100_0100).into())],
        ),
        controller(h("Driver"), LOGIC_DRIVER_CONTROLLER, vec![]),
    ]);
    let controllers = map_controllers(&document, &());

    assert_eq!(
        rule_of(&controllers, h("Mutator")),
        &MapControllerRule::Mutator {
            name: "SR_Hall_Of_Legends".to_owned(),
        }
    );
    assert_eq!(
        rule_of(&controllers, h("Layer")),
        &MapControllerRule::Layer { mask: 0b0100_0100 }
    );
    assert_eq!(
        rule_of(&controllers, h("Driver")),
        &MapControllerRule::Driven
    );
}

#[test]
fn map_controllers_skips_objects_of_other_classes() {
    let document = document_of(vec![controller(
        h("Maps/KitPieces/SRX/Materials/Ground"),
        h("StaticMaterialDef"),
        vec![],
    )]);

    assert!(map_controllers(&document, &()).is_empty());
}

#[test]
fn map_controller_rule_serializes_tagged_by_kind_in_camel_case() {
    let child = MapControllerRule::Child {
        parents: vec!["0x3c5b24f7".to_owned()],
        mode: MapParentMode::None,
    };
    let named = MapControllerRule::Named {
        default_visible: false,
        terrain: 8,
        stage: 0,
    };

    assert_eq!(
        serde_json::to_value(&child).unwrap(),
        serde_json::json!({ "kind": "child", "parents": ["0x3c5b24f7"], "mode": "none" })
    );
    assert_eq!(
        serde_json::to_value(&named).unwrap(),
        serde_json::json!({ "kind": "named", "defaultVisible": false, "terrain": 8, "stage": 0 })
    );
}
