use ltk_meta::PropertyValueEnum;
use ltk_meta::property::values;

use super::*;
use crate::bin_document::hex;
use crate::map::fixtures::{container, document_of, embedded, h, placeable};
use crate::map::placeable::NAME;

fn turret(team: Option<u32>) -> PropertyValueEnum {
    let mut fields = vec![
        (NAME, values::Hash::new(h("Turret_T1_C_01")).into()),
        (
            CHARACTER,
            embedded(
                "CharacterComponent",
                vec![(
                    SKIN,
                    values::String::from("Characters/Turret/Skins/Skin0").into(),
                )],
            ),
        ),
    ];
    if let Some(team) = team {
        fields.push((
            TEAM,
            embedded("TeamComponent", vec![(TEAM, values::U32::new(team).into())]),
        ));
    }
    placeable("GameplayObject", fields)
}

fn gds_object(name: &str, kind: u8) -> PropertyValueEnum {
    placeable(
        "GdsMapObject",
        vec![
            (NAME, values::String::from(name).into()),
            (OBJECT_TYPE, values::U8::new(kind).into()),
        ],
    )
}

#[test]
fn a_gameplay_object_wears_the_skin_its_character_component_states() {
    let document = document_of(vec![container(
        "Chunks/Gameplay",
        vec![("a", turret(None)), ("b", turret(Some(200)))],
    )]);

    let characters = map_characters(&document);

    assert_eq!(characters.len(), 2);
    assert_eq!(characters[0].skin, "Characters/Turret/Skins/Skin0");
    assert_eq!(characters[0].name, hex(h("Turret_T1_C_01")));
    assert_eq!(characters[0].team, None);
    assert_eq!(characters[1].team, Some(200));
}

#[test]
fn a_level_prop_wears_the_character_its_name_spells() {
    let document = document_of(vec![container(
        "Chunks/Props",
        vec![
            ("a", gds_object("LevelProp_sru_snail9", LEVEL_PROP)),
            (
                "b",
                gds_object("LevelProp_Srx_Banner_VerticalThin12", LEVEL_PROP),
            ),
        ],
    )]);

    let skins: Vec<String> = map_characters(&document)
        .into_iter()
        .map(|character| character.skin)
        .collect();

    assert_eq!(
        skins,
        [
            "Characters/sru_snail/Skins/Skin0",
            "Characters/Srx_Banner_VerticalThin/Skins/Skin0"
        ]
    );
}

#[test]
fn a_map_object_of_another_type_and_a_placeable_naming_no_character_are_passed_over() {
    let document = document_of(vec![container(
        "Chunks/Info",
        vec![
            ("a", gds_object("Info_BrazierLocation4", 9)),
            ("b", gds_object("LevelProp_12", LEVEL_PROP)),
            ("c", placeable("MapLocator", vec![])),
        ],
    )]);

    assert!(map_characters(&document).is_empty());
}

#[test]
#[ignore = "reads a shipped materials bin, and needs LTK_LIVE_MATERIALS"]
fn a_shipped_map_stands_its_structures() {
    let path = std::env::var("LTK_LIVE_MATERIALS").unwrap();
    let document = BinDocument::parse(fs_err::read(path).unwrap()).unwrap();
    let characters = map_characters(&document);
    let turrets = characters
        .iter()
        .filter(|character| character.skin.starts_with("Characters/Turret/"))
        .count();
    println!("{} characters, {turrets} turrets", characters.len());
    assert!(turrets > 0);
}
