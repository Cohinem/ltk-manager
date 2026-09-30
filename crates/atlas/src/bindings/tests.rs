use ltk_hash::{BinHash, Hash as _};
use ltk_meta::PropertyValueEnum;
use ltk_meta::property::{Kind, values};

use super::*;

fn h(text: &str) -> BinHash {
    BinHash::hash_str(text)
}

fn element(path: &str) -> PropertyValueEnum {
    values::ObjectLink::new(h(path)).into()
}

/// A field's hash: an unnamed field's as `0x` and eight digits, else its name's.
fn field(name: &str) -> BinHash {
    name.strip_prefix("0x")
        .and_then(|digits| u32::from_str_radix(digits, 16).ok())
        .map_or_else(|| h(name), BinHash)
}

fn fields(properties: Vec<(&str, PropertyValueEnum)>) -> Fields {
    properties
        .into_iter()
        .map(|(name, value)| (field(name), value))
        .collect()
}

fn embed(class: &str, properties: Vec<(&str, PropertyValueEnum)>) -> PropertyValueEnum {
    values::Embedded(values::Struct {
        class_hash: h(class),
        properties: fields(properties),
    })
    .into()
}

fn list(items: Vec<PropertyValueEnum>) -> PropertyValueEnum {
    values::Container::new(Kind::Embedded, items)
        .unwrap()
        .into()
}

fn map(value: PropertyValueEnum) -> PropertyValueEnum {
    values::Map::new(
        Kind::String,
        Kind::Embedded,
        vec![(values::String::from("0").into(), value)],
    )
    .unwrap()
    .into()
}

fn spell_slot(name: &str) -> PropertyValueEnum {
    embed(
        "SpellSlotDetailedUiDefinition",
        vec![
            ("ContentElement", element(&format!("{name}_"))),
            ("Hotkey", element(&format!("{name}_HotKey"))),
            ("OverlayOom", element(&format!("{name}_IconOom"))),
            ("0xa5a9a542", element(&format!("{name}_AcquireFX"))),
            (
                "CooldownUiData",
                embed(
                    "CooldownEffectUiData",
                    vec![("CooldownText", element(&format!("{name}_Cooldown")))],
                ),
            ),
        ],
    )
}

fn role(found: &[UiBinding], path: &str) -> Option<UiRole> {
    let key = hex(h(path));
    found
        .iter()
        .find(|binding| binding.element == key)
        .map(|binding| binding.role.clone())
}

fn key(key: &str) -> Option<UiRole> {
    Some(UiRole::Hotkey {
        key: key.to_owned(),
    })
}

#[test]
fn a_spell_slot_is_the_ability_summoner_or_passive_the_field_holding_it_names() {
    let controller = fields(vec![(
        "AbilitiesUiData",
        embed(
            "AbilitiesUiData",
            vec![
                (
                    "ChampionSpells",
                    list(vec![spell_slot("Ability0"), spell_slot("Ability1")]),
                ),
                ("SummonerSpells", list(vec![spell_slot("Summoner0")])),
                ("Passive", spell_slot("Passive")),
            ],
        ),
    )]);

    let found = bindings(&controller, h("PlayerFrameViewController"));

    assert_eq!(role(&found, "Ability1_"), Some(UiRole::Ability { slot: 1 }));
    assert_eq!(role(&found, "Ability1_HotKey"), key("W"));
    assert_eq!(role(&found, "Ability0_Cooldown"), Some(UiRole::Idle));
    assert_eq!(role(&found, "Ability0_IconOom"), Some(UiRole::Hidden));
    assert_eq!(role(&found, "Ability0_AcquireFX"), Some(UiRole::Hidden));
    assert_eq!(
        role(&found, "Summoner0_"),
        Some(UiRole::Summoner { slot: 0 })
    );
    assert_eq!(role(&found, "Summoner0_HotKey"), key("D"));
    assert_eq!(role(&found, "Passive_"), Some(UiRole::Passive));
    assert_eq!(role(&found, "Passive_HotKey"), None);
}

#[test]
fn an_item_slot_is_its_list_index_or_its_item_field() {
    let slot = |name: &str| {
        embed(
            "ItemSlotDetailedUiData",
            vec![
                ("Icon", element(&format!("{name}_"))),
                ("HotkeyText", element(&format!("{name}_HotKey"))),
                ("StackText", element(&format!("{name}_Count"))),
            ],
        )
    };
    let controller = fields(vec![
        (
            "ItemSlotUiData",
            list(vec![
                slot("Item0"),
                slot("Item1"),
                slot("Item2"),
                slot("Item3"),
            ]),
        ),
        (
            "ItemSlots",
            embed(
                "SimpleItemSlots",
                vec![(
                    "Item5",
                    embed("ItemSlotSimpleUiData", vec![("Icon", element("SB_Item5_"))]),
                )],
            ),
        ),
    ]);

    let found = bindings(&controller, h("PlayerInventoryViewController"));

    assert_eq!(role(&found, "Item3_"), Some(UiRole::Item { slot: 3 }));
    assert_eq!(role(&found, "Item3_HotKey"), key("5"));
    assert_eq!(role(&found, "Item0_Count"), Some(UiRole::Idle));
    assert_eq!(role(&found, "SB_Item5_"), Some(UiRole::Item { slot: 5 }));
}

#[test]
fn a_score_line_binds_its_portrait_metrics_keystone_and_name() {
    let controller = fields(vec![(
        "OrderScoreLineUiData",
        embed(
            "ScoreLineSrUiData",
            vec![
                (
                    "Portrait",
                    embed(
                        "UiPlayerPortraitData",
                        vec![
                            ("PortraitIcon", element("SB_T1P0_Icon_Data")),
                            ("RespawnTimerText", element("SB_T1P0_Timer")),
                        ],
                    ),
                ),
                (
                    "Metrics",
                    map(embed(
                        "UiMetricUnitKda",
                        vec![("Text", element("SB_T1P0_KDA"))],
                    )),
                ),
                (
                    "Keystone",
                    embed(
                        "ChampionPerkKeystoneUiData",
                        vec![
                            ("KeystoneIcon", element("SB_T1P0_PerkKeystone")),
                            ("KeystoneSubstyleIcon", element("SB_T1P0_PerkSubStyle")),
                        ],
                    ),
                ),
                (
                    "SummonerName",
                    embed(
                        "SummonerNameUiData",
                        vec![("SummonerNameText", element("SB_T1P0_SummonerName"))],
                    ),
                ),
            ],
        ),
    )]);

    let found = bindings(&controller, h("ScoreboardViewController"));

    assert_eq!(role(&found, "SB_T1P0_Icon_Data"), Some(UiRole::Portrait));
    assert_eq!(role(&found, "SB_T1P0_Timer"), Some(UiRole::Idle));
    assert_eq!(role(&found, "SB_T1P0_KDA"), Some(UiRole::Kda));
    assert_eq!(role(&found, "SB_T1P0_PerkKeystone"), Some(UiRole::Keystone));
    assert_eq!(role(&found, "SB_T1P0_PerkSubStyle"), Some(UiRole::Substyle));
    assert_eq!(
        role(&found, "SB_T1P0_SummonerName"),
        Some(UiRole::PlayerName)
    );
}

#[test]
fn a_loading_card_binds_its_splash_spells_and_runes_and_a_bare_portrait_binds_too() {
    let entry = |path: &str| {
        embed(
            "LoadingScreenPlayerCardClassicSpellData",
            vec![("Icon", element(path))],
        )
    };
    let controller = fields(vec![
        (
            "CardTemplate",
            embed(
                "LoadingScreenPlayerCardClassicData",
                vec![
                    ("CharacterSplash", element("LSPC_CharacterSplash")),
                    (
                        "SummonerSpells",
                        list(vec![entry("Spell0"), entry("Spell1")]),
                    ),
                    ("Perks", list(vec![entry("Rune0"), entry("Rune1")])),
                ],
            ),
        ),
        ("Portrait", element("TargetPortrait")),
        ("RootScene", element("Root")),
    ]);

    let found = bindings(&controller, h("LoadingScreenPlayerCardsViewController"));

    assert_eq!(role(&found, "LSPC_CharacterSplash"), Some(UiRole::Splash));
    assert_eq!(role(&found, "Spell1"), Some(UiRole::Summoner { slot: 1 }));
    assert_eq!(role(&found, "Rune0"), Some(UiRole::Keystone));
    assert_eq!(role(&found, "Rune1"), Some(UiRole::Substyle));
    assert_eq!(role(&found, "TargetPortrait"), Some(UiRole::Portrait));
    assert_eq!(role(&found, "Root"), None);
}

#[test]
fn an_element_two_structures_name_binds_once_to_the_first() {
    let controller = fields(vec![
        (
            "PortraitUiData",
            embed("PlayerPortraitUiData", vec![("Icon", element("Shared"))]),
        ),
        ("Portrait", element("Shared")),
    ]);

    let found = bindings(&controller, h("PlayerFrameViewController"));

    assert_eq!(found.len(), 1);
    assert_eq!(found[0].role, UiRole::Portrait);
}
