use ltk_meta::BinObject;
use ltk_meta::property::{Kind, values};

use super::*;
use crate::map::fixtures::{document_of, h};

const MAP_ENTRY: &str = "Maps/Shipping/Map11";
const DEFAULT_SKIN: &str = "Maps/Shipping/Map11/MapSkins/Default";
const ODYSSEY_SKIN: &str = "Maps/Shipping/Map11/MapSkins/Odyssey";
const BASE_SRX: &str = "Maps/MapGeometry/Map11/Base_SRX";

fn skin(entry: &str, name: &str, container: Option<&str>) -> BinObject {
    let mut object =
        BinObject::builder(h(entry), MAP_SKIN).property(SKIN_NAME, values::String::from(name));
    if let Some(container) = container {
        object = object.property(CONTAINER_LINK, values::String::from(container));
    }
    object.build()
}

fn map_listing(skins: &[&str]) -> BinObject {
    let links = skins
        .iter()
        .map(|skin| values::ObjectLink::new(h(skin)).into())
        .collect();
    BinObject::builder(h(MAP_ENTRY), MAP)
        .property(
            MAP_SKINS,
            values::UnorderedContainer(values::Container::new(Kind::ObjectLink, links).unwrap()),
        )
        .build()
}

#[test]
fn a_container_answers_the_map_it_states() {
    let document = document_of(vec![
        BinObject::builder(h(BASE_SRX), MAP_CONTAINER)
            .property(MAP_PATH, values::String::from(BASE_SRX))
            .build(),
    ]);

    assert_eq!(
        map_variants(&document, h(BASE_SRX)),
        vec![MapVariant {
            skin: None,
            map: MapPath::from(BASE_SRX),
            materials: "data/maps/mapgeometry/map11/base_srx.materials.bin".to_owned(),
        }]
    );
}

#[test]
fn a_skin_answers_the_container_it_links_under_its_own_name() {
    let document = document_of(vec![skin(DEFAULT_SKIN, "Default", Some(BASE_SRX))]);

    assert_eq!(
        map_variants(&document, h(DEFAULT_SKIN)),
        vec![MapVariant {
            skin: Some("Default".to_owned()),
            map: MapPath::from(BASE_SRX),
            materials: "data/maps/mapgeometry/map11/base_srx.materials.bin".to_owned(),
        }]
    );
}

#[test]
fn a_skin_linking_no_container_draws_nothing() {
    let document = document_of(vec![
        skin(ODYSSEY_SKIN, "Odyssey", None),
        skin(DEFAULT_SKIN, "Default", Some("")),
    ]);

    assert_eq!(map_variants(&document, h(ODYSSEY_SKIN)), vec![]);
    assert_eq!(map_variants(&document, h(DEFAULT_SKIN)), vec![]);
}

#[test]
fn a_map_answers_each_drawable_skin_it_lists_in_its_order() {
    let document = document_of(vec![
        map_listing(&[
            ODYSSEY_SKIN,
            DEFAULT_SKIN,
            "Maps/Shipping/Map11/MapSkins/Elsewhere",
        ]),
        skin(DEFAULT_SKIN, "Default", Some(BASE_SRX)),
        skin(ODYSSEY_SKIN, "Odyssey", None),
    ]);

    let variants = map_variants(&document, h(MAP_ENTRY));

    assert_eq!(variants.len(), 1);
    assert_eq!(variants[0].skin.as_deref(), Some("Default"));
}

#[test]
fn an_object_of_another_class_draws_nothing() {
    let document = document_of(vec![
        BinObject::builder(h("Some/Material"), h("StaticMaterialDef")).build(),
    ]);

    assert_eq!(map_variants(&document, h("Some/Material")), vec![]);
    assert_eq!(map_variants(&document, h("Not/Declared")), vec![]);
}
