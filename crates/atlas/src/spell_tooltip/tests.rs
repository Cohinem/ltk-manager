use ltk_meta::property::{Kind, values};

use super::*;

fn fields(properties: Vec<(&str, PropertyValueEnum)>) -> Fields {
    properties
        .into_iter()
        .map(|(name, value)| (named(name), value))
        .collect()
}

fn embed(class: &str, properties: Vec<(&str, PropertyValueEnum)>) -> PropertyValueEnum {
    values::Embedded(values::Struct {
        class_hash: named(class),
        properties: fields(properties),
    })
    .into()
}

/// A struct of a class or with fields the tables do not name.
fn embed_raw(class: BinHash, properties: Vec<(BinHash, PropertyValueEnum)>) -> PropertyValueEnum {
    values::Embedded(values::Struct {
        class_hash: class,
        properties: properties.into_iter().collect(),
    })
    .into()
}

fn number(value: f32) -> PropertyValueEnum {
    values::F32::new(value).into()
}

fn string(text: &str) -> PropertyValueEnum {
    values::String::from(text).into()
}

fn hash(name: &str) -> PropertyValueEnum {
    values::Hash::new(named(name)).into()
}

fn floats(numbers: &[f32]) -> PropertyValueEnum {
    let items = numbers
        .iter()
        .map(|&number| values::F32::new(number).into())
        .collect();
    values::Container::new(Kind::F32, items).unwrap().into()
}

fn list(items: Vec<PropertyValueEnum>) -> PropertyValueEnum {
    values::Container::new(Kind::Embedded, items)
        .unwrap()
        .into()
}

fn strings_map(entries: &[(&str, &str)]) -> PropertyValueEnum {
    let entries = entries
        .iter()
        .map(|(key, value)| (string(key), string(value)))
        .collect();
    values::Map::new(Kind::String, Kind::String, entries)
        .unwrap()
        .into()
}

fn calculations(entries: Vec<(&str, PropertyValueEnum)>) -> PropertyValueEnum {
    let entries = entries
        .into_iter()
        .map(|(name, calculation)| (hash(name), calculation))
        .collect();
    values::Map::new(Kind::Hash, Kind::Embedded, entries)
        .unwrap()
        .into()
}

fn data_value(name: &str, numbers: &[f32]) -> PropertyValueEnum {
    embed(
        "SpellDataValue",
        vec![("name", string(name)), ("values", floats(numbers))],
    )
}

const FORMAT_PATH: &str = "Format";

/// Ability power and attack damage, written in the bonus style by default.
fn stats_ui() -> Fields {
    let stat = |icon: &str, tag: &str| {
        embed(
            "StatUIData",
            vec![("mIconKey", string(icon)), ("mScalingTagKey", string(tag))],
        )
    };
    let entries = vec![
        (values::U8::new(0).into(), stat("%i:scaleAP%", "scaleAP")),
        (values::U8::new(2).into(), stat("%i:scaleAD%", "scaleAD")),
    ];
    fields(vec![
        (
            "mStatUIData",
            values::Map::new(Kind::U8, Kind::Embedded, entries)
                .unwrap()
                .into(),
        ),
        ("mNumberStyleBonus", string("Style_Bonus")),
        ("mNumberStyleBonusPercent", string("Style_BonusPercent")),
        ("mTooltipCalculationExpansion", values::U8::new(6).into()),
    ])
}

/// A `Spell`-like format: a title, a cooldown and a cost by default, and the main text.
fn format() -> Fields {
    fields(vec![
        (
            "mInputLocKeysWithDefaults",
            strings_map(&[
                ("keyName", ""),
                ("keyTooltip", ""),
                ("keyCost", "Spell_Default_Cost"),
                ("keyCooldown", "Spell_Default_Cooldown"),
            ]),
        ),
        (
            "mOutputStrings",
            strings_map(&[("Tooltip", "Template_Spell_Tooltip")]),
        ),
    ])
}

fn spell(tooltip_key: &str, spell_data: Vec<(&str, PropertyValueEnum)>) -> Fields {
    let tooltip = embed(
        "TooltipInstanceSpell",
        vec![
            (
                "mFormat",
                values::ObjectLink::new(named(FORMAT_PATH)).into(),
            ),
            (
                "mLocKeys",
                strings_map(&[("keyName", "Spell_Name"), ("keyTooltip", tooltip_key)]),
            ),
        ],
    );
    let mut data = spell_data;
    data.push((
        "mClientData",
        embed("SpellDataResourceClient", vec![("mTooltipData", tooltip)]),
    ));
    fields(vec![("mSpell", embed("SpellDataResource", data))])
}

fn strings(key: &str) -> Option<String> {
    let text = match key {
        "Template_Spell_Tooltip" => {
            "<titleLeft>@keyHotkey@&nbsp;@keyName@</titleLeft><titleRight>@keyCooldown@</titleRight>\
             <subtitleRight>@keyCost@</subtitleRight><mainText>@keyTooltip@</mainText>"
        }
        "Spell_Default_Cost" => "@Cost@ @AbilityResourceName@",
        "Spell_Default_Cooldown" => "@Cooldown@s",
        "Spell_Name" => "Orb",
        "Plain" => "Deals @Damage@ damage for @Duration*100@% longer.",
        "Calculated" => "Deals @TotalDamage@, then @Reduced@, or @Plain@.",
        "Style_Bonus" => "@OpeningTag@(+@Value@@Icon@)@ClosingTag@",
        "Style_BonusPercent" => "@OpeningTag@(+@Value@%@Icon@)@ClosingTag@",
        "Unknown" => "Reads @Mystery@ and {{ Included }}.",
        "Included" => "an include",
        "Forms" => {
            "@Ratio.0*100@% @Ratio.2@ @spell.OtherW:Damage@ @spell.OtherW:Hotkey@ @f1@ \
             @AmmoRechargeTime@ @MaxAmmo@"
        }
        "Parts" => "@Conditional@ @Levelled@ @Clamped@ @Precise@ @Sourced@ @Formula@",
        _ => return None,
    };
    Some(text.to_owned())
}

/// The format, and the spells `spells` holds by script name.
struct Shelf {
    spells: Vec<(&'static str, Fields)>,
}

impl SpellObjects for Shelf {
    fn object(&mut self, entry: BinHash) -> Option<Fields> {
        if entry == named(FORMAT_PATH) {
            return Some(format());
        }
        self.spells
            .iter()
            .find(|(name, _)| named(name) == entry)
            .map(|(_, spell)| spell.clone())
    }

    fn spell(&mut self, script: &str) -> Option<Fields> {
        self.spells
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(script))
            .map(|(_, spell)| spell.clone())
    }
}

fn compose_with(spell: &Fields, spells: Vec<(&'static str, Fields)>) -> Option<SpellTooltip> {
    let hotkeys = [("OtherW".to_owned(), "W")];
    let stats = StatsUi::read(&stats_ui(), &strings);
    let context = SpellContext {
        hotkey: Some("Q"),
        hotkeys: &hotkeys,
        resource: Some("Mana"),
        strings: &strings,
        stats: &stats,
    };
    spell_tooltip(spell, &mut Shelf { spells }, &context)
}

fn compose(spell: &Fields) -> Option<SpellTooltip> {
    compose_with(spell, Vec::new())
}

#[test]
fn fills_the_template_with_the_keys_and_the_values_at_rank_1() {
    let spell = spell(
        "Plain",
        vec![
            (
                "DataValues",
                list(vec![
                    data_value("Damage", &[0.0, 35.0, 60.0]),
                    data_value("Duration", &[0.0, 0.25, 0.5]),
                ]),
            ),
            ("CooldownTime", floats(&[7.0, 7.0, 6.0])),
            ("Mana", floats(&[55.0, 65.0])),
        ],
    );

    let tooltip = compose(&spell).unwrap();

    assert_eq!(tooltip.name, "Orb");
    assert_eq!(
        tooltip.text,
        "<titleLeft>[Q]&nbsp;Orb</titleLeft><titleRight>7s</titleRight>\
         <subtitleRight>55 Mana</subtitleRight><mainText>Deals 35 damage for 25% longer.</mainText>"
    );
}

#[test]
fn evaluates_calculations_with_stats_at_zero_and_writes_their_scaling() {
    let spell = spell(
        "Calculated",
        vec![
            (
                "DataValues",
                list(vec![
                    data_value("BaseDamage", &[0.0, 40.0]),
                    data_value("RepeatMod", &[0.0, 0.3]),
                ]),
            ),
            (
                "mSpellCalculations",
                calculations(vec![
                    (
                        "TotalDamage",
                        embed(
                            "GameCalculation",
                            vec![(
                                "mFormulaParts",
                                list(vec![
                                    embed(
                                        "NamedDataValueCalculationPart",
                                        vec![("mDataValue", hash("BaseDamage"))],
                                    ),
                                    embed(
                                        "StatByCoefficientCalculationPart",
                                        vec![("mCoefficient", values::F32::new(0.5).into())],
                                    ),
                                    embed(
                                        "NumberCalculationPart",
                                        vec![("mNumber", values::F32::new(5.0).into())],
                                    ),
                                ]),
                            )],
                        ),
                    ),
                    (
                        "Plain",
                        embed(
                            "GameCalculation",
                            vec![
                                (
                                    "mFormulaParts",
                                    list(vec![embed(
                                        "StatByNamedDataValueCalculationPart",
                                        vec![
                                            ("mDataValue", hash("RepeatMod")),
                                            ("mStat", values::U8::new(2).into()),
                                        ],
                                    )]),
                                ),
                                (
                                    "mSimpleTooltipCalculationDisplay",
                                    values::U8::new(5).into(),
                                ),
                            ],
                        ),
                    ),
                    (
                        "Reduced",
                        embed(
                            "GameCalculationModified",
                            vec![
                                ("mModifiedGameCalculation", hash("TotalDamage")),
                                (
                                    "mMultiplier",
                                    embed(
                                        "NamedDataValueCalculationPart",
                                        vec![("mDataValue", hash("RepeatMod"))],
                                    ),
                                ),
                            ],
                        ),
                    ),
                ]),
            ),
        ],
    );

    let tooltip = compose(&spell).unwrap();

    assert!(
        tooltip.text.contains(
            "<mainText>Deals 45 <scaleAP>(+0.5&nbsp;%i:scaleAP%)</scaleAP>, \
                 then 13.5 <scaleAP>(+0.15&nbsp;%i:scaleAP%)</scaleAP>, or 0.</mainText>"
        ),
        "{}",
        tooltip.text
    );
}

#[test]
fn leaves_an_unknown_value_as_written_and_expands_includes() {
    let tooltip = compose(&spell("Unknown", Vec::new())).unwrap();

    assert!(
        tooltip
            .text
            .contains("<mainText>Reads @Mystery@ and an include.</mainText>"),
        "{}",
        tooltip.text
    );
}

#[test]
fn costs_nothing_without_a_mana_list() {
    let tooltip = compose(&spell("Plain", Vec::new())).unwrap();

    assert!(
        tooltip
            .text
            .contains("<subtitleRight>0 Mana</subtitleRight>"),
        "{}",
        tooltip.text
    );
}

#[test]
fn none_without_tooltip_data() {
    let spell = fields(vec![("mSpell", embed("SpellDataResource", Vec::new()))]);

    assert_eq!(compose(&spell), None);
}

#[test]
fn shows_at_most_the_decimals_asked_for() {
    assert_eq!(shown(1.05, 2), "1.05");
    assert_eq!(shown(35.0, 2), "35");
    assert_eq!(shown(1.0 / 3.0, 2), "0.33");
    assert_eq!(shown(25.6, 0), "26");
    assert_eq!(shown(-0.001, 2), "0");
}

#[test]
fn reads_precision_factor_other_spells_and_spell_stats() {
    let other = spell(
        "Plain",
        vec![("DataValues", list(vec![data_value("Damage", &[0.0, 70.0])]))],
    );
    let ammo = values::Container::new(
        Kind::I32,
        vec![values::I32::new(2).into(), values::I32::new(2).into()],
    )
    .unwrap();
    let spell = spell(
        "Forms",
        vec![
            ("DataValues", list(vec![data_value("Ratio", &[0.0, 0.256])])),
            ("mAmmoRechargeTime", floats(&[0.0, 16.0])),
            ("mMaxAmmo", ammo.into()),
        ],
    );

    let tooltip = compose_with(&spell, vec![("OtherW", other)]).unwrap();

    assert!(
        tooltip.text.contains("<titleRight>10s</titleRight>"),
        "{}",
        tooltip.text
    );
    assert!(
        tooltip
            .text
            .contains("<mainText>26% 0.26 70 W 0 16 2</mainText>"),
        "{}",
        tooltip.text
    );
}

#[test]
fn reads_each_kind_of_part_at_level_1() {
    let damage = || {
        embed(
            "NamedDataValueCalculationPart",
            vec![("mDataValue", hash("Damage"))],
        )
    };
    let calculation = |parts: Vec<PropertyValueEnum>| {
        embed("GameCalculation", vec![("mFormulaParts", list(parts))])
    };
    let constant = |value| embed("NumberCalculationPart", vec![("mNumber", number(value))]);
    let source = fields(vec![(
        "mSpell",
        embed(
            "SpellDataResource",
            vec![("DataValues", list(vec![data_value("Bonus", &[0.0, 3.0])]))],
        ),
    )]);
    let floor = values::Optional::new(Kind::F32, Some(number(8.0))).unwrap();
    let spell = spell(
        "Parts",
        vec![
            (
                "DataValues",
                list(vec![
                    data_value("Damage", &[0.0, 40.0]),
                    data_value("PerLevel", &[0.0, 5.0]),
                ]),
            ),
            (
                "mSpellCalculations",
                calculations(vec![
                    ("Base", calculation(vec![damage()])),
                    (
                        "Conditional",
                        embed(
                            "GameCalculationConditional",
                            vec![
                                ("mDefaultGameCalculation", hash("Base")),
                                ("mConditionalGameCalculation", hash("Missing")),
                            ],
                        ),
                    ),
                    (
                        "Levelled",
                        calculation(vec![embed_raw(
                            BinHash(0xb226_09db),
                            vec![
                                (BinHash(0x91d4_04a5), hash("Damage")),
                                (BinHash(0xb2cd_0eb0), hash("PerLevel")),
                            ],
                        )]),
                    ),
                    (
                        "Clamped",
                        calculation(vec![embed(
                            "ClampSubPartsCalculationPart",
                            vec![
                                ("mSubparts", list(vec![constant(5.0)])),
                                ("mFloor", floor.into()),
                            ],
                        )]),
                    ),
                    (
                        "Precise",
                        embed(
                            "GameCalculation",
                            vec![
                                (
                                    "mFormulaParts",
                                    list(vec![
                                        constant(1.26),
                                        embed("CooldownMultiplierCalculationPart", Vec::new()),
                                    ]),
                                ),
                                ("mPrecision", values::I32::new(1).into()),
                            ],
                        ),
                    ),
                    (
                        "Sourced",
                        calculation(vec![embed_raw(
                            BinHash(0x9e9e_2e5c),
                            vec![
                                (
                                    named("SourceObject"),
                                    values::ObjectLink::new(named("Source")).into(),
                                ),
                                (named("DataValue"), hash("Bonus")),
                            ],
                        )]),
                    ),
                    (
                        "Formula",
                        calculation(vec![embed(
                            "ByCharLevelFormulaCalculationPart",
                            vec![("values", floats(&[16.0, 26.0]))],
                        )]),
                    ),
                ]),
            ),
        ],
    );

    let tooltip = compose_with(&spell, vec![("Source", source)]).unwrap();

    assert!(
        tooltip
            .text
            .contains("<mainText>40 40 8 2.3 3 16</mainText>"),
        "{}",
        tooltip.text
    );
}
