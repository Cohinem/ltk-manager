use ltk_meta::property::{Kind, values};

use super::*;
use crate::map::fixtures::{container, document_of, embedded, h, placeable};

#[test]
fn map_name_references_finds_action_fields_naming_the_placeable() {
    let action = |name: &str| {
        embedded(
            "MapActionPlayAnimation",
            vec![(h("PropName"), values::String::from(name).into())],
        )
    };
    let actions = values::Container::new(
        Kind::Embedded,
        vec![action("Dragon"), action("Baron"), action("dragon")],
    )
    .unwrap();
    let document = document_of(vec![container(
        "Maps/MapGeometry/Map11/Chunks/Behaviors",
        vec![(
            "Behavior",
            placeable("MapBehavior", vec![(h("Actions"), actions.into())]),
        )],
    )]);

    let found = map_name_references(&document, "Dragon");

    assert_eq!(
        found,
        [MapNameReference {
            entry: hex(h("Maps/MapGeometry/Map11/Chunks/Behaviors")),
            holder: format!(
                "{:08x}{{{:08x}}}.{:08x}[0]",
                h("items").0,
                h("Behavior").0,
                h("Actions").0
            ),
            field: hex(h("PropName")),
        }]
    );
}
