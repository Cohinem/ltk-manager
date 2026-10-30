//! The sites, holders, bank lists and contextual rules that a bin read records.

use ltk_hash::{BinHash, HashValue};
use ltk_manager_audio::{
    Audience, AudienceName, BankList, BankSite, BinAudio, ContextualRule, HolderAudio, SiteStep,
};
use ltk_manager_base::hashing::named;
use ltk_meta::property::{Kind, values};
use ltk_meta::{Bin, BinObject, PropertyValueEnum};

/* The names are spelled here rather than read from the crate, so a wrong constant there fails
rather than agrees. */
const SKIN: BinHash = named("SkinCharacterDataProperties");
const SKIN_AUDIO: BinHash = named("SkinAudioProperties");
const SKIN_AUDIO_FIELD: BinHash = named("skinAudioProperties");
const BANK_UNITS: BinHash = named("bankUnits");
const TAGS: BinHash = named("tagEventList");
const CONTEXTUAL_LINK: BinHash = named("mContextualActionData");
const UNIT: BinHash = named("BankUnit");

const SKIN_OBJECT: u32 = 0x1111_0000;
const CAC_OBJECT: u32 = 0x2222_0000;

fn string(text: &str) -> PropertyValueEnum {
    values::String::new(text.to_owned()).into()
}

fn strings(items: &[&str]) -> PropertyValueEnum {
    PropertyValueEnum::Container(
        items
            .iter()
            .map(|item| values::String::new((*item).to_owned()))
            .collect(),
    )
}

fn embed(class: BinHash, properties: Vec<(BinHash, PropertyValueEnum)>) -> values::Embedded {
    values::Embedded(pointer(class, properties))
}

fn pointer(class: BinHash, properties: Vec<(BinHash, PropertyValueEnum)>) -> values::Struct {
    values::Struct {
        class_hash: class,
        properties: properties.into_iter().collect(),
    }
}

fn unit(name: &str, paths: &[&str]) -> values::Embedded {
    embed(
        UNIT,
        vec![
            (named("name"), string(name)),
            (named("bankPath"), strings(paths)),
        ],
    )
}

fn bytes_of(objects: Vec<BinObject>) -> Vec<u8> {
    let mut out = std::io::Cursor::new(Vec::new());
    Bin::new(objects, std::iter::empty::<&str>())
        .to_writer(&mut out)
        .expect("write bin");
    out.into_inner()
}

/// A skin with two bank units, two tags and a contextual action link.
fn skin() -> BinObject {
    BinObject::builder(SKIN_OBJECT, SKIN)
        .property(
            SKIN_AUDIO_FIELD,
            embed(
                SKIN_AUDIO,
                vec![
                    (TAGS, strings(&["Ahri", "AhriSkin04"])),
                    (
                        BANK_UNITS,
                        PropertyValueEnum::Container(
                            vec![
                                unit("Ahri_Skin04_SFX", &["sfx_events.bnk"]),
                                unit("Ahri_Skin04_VO", &["vo_events.bnk"]),
                            ]
                            .into(),
                        ),
                    ),
                ],
            ),
        )
        .property(
            CONTEXTUAL_LINK,
            values::ObjectLink::new(BinHash(CAC_OBJECT)),
        )
        .build()
}

#[test]
fn bin_audio_records_unit_site_in_skin() {
    let audio = BinAudio::read(&bytes_of(vec![skin()])).unwrap();

    let sites: Vec<&BankSite> = audio.units.iter().map(|sited| &sited.site).collect();
    assert_eq!(
        sites,
        [
            &BankSite {
                object: SKIN_OBJECT,
                class: SKIN.0,
                steps: vec![
                    SiteStep::Field(SKIN_AUDIO_FIELD.0),
                    SiteStep::Field(BANK_UNITS.0),
                    SiteStep::Index(0),
                ],
            },
            &BankSite {
                object: SKIN_OBJECT,
                class: SKIN.0,
                steps: vec![
                    SiteStep::Field(SKIN_AUDIO_FIELD.0),
                    SiteStep::Field(BANK_UNITS.0),
                    SiteStep::Index(1),
                ],
            },
        ]
    );
    assert_eq!(audio.units[1].unit.name, "Ahri_Skin04_VO");
}

#[test]
fn bin_audio_records_holder_contextual_link_and_tags() {
    let audio = BinAudio::read(&bytes_of(vec![skin()])).unwrap();

    for sited in &audio.units {
        assert_eq!(
            sited.holder,
            HolderAudio {
                contextual: Some(CAC_OBJECT),
                tags: vec!["Ahri".to_owned(), "AhriSkin04".to_owned()],
            }
        );
    }
}

#[test]
fn bin_audio_reads_audio_bank_paths_list() {
    let spell = BinObject::builder(0x3333_0000u32, named("SpellObject"))
        .property(
            named("mSpell"),
            pointer(
                named("SpellDataResource"),
                vec![(named("AudioBankPaths"), strings(&["spell_events.bnk"]))],
            ),
        )
        .build();

    let audio = BinAudio::read(&bytes_of(vec![spell])).unwrap();

    assert_eq!(
        audio.lists,
        [BankList {
            paths: vec!["spell_events.bnk".to_owned()],
            site: BankSite {
                object: 0x3333_0000,
                class: named("SpellObject").0,
                steps: vec![
                    SiteStep::Field(named("mSpell").0),
                    SiteStep::Field(named("AudioBankPaths").0),
                ],
            },
        }]
    );
}

fn hash(value: u32) -> PropertyValueEnum {
    values::Hash::new(HashValue::narrow(value)).into()
}

/// A rule with a spell condition, a chance condition and a VO action with all four names.
fn spell_rule() -> values::Embedded {
    embed(
        named("ContextualRule"),
        vec![
            (named("mRuleName"), string("Basic 1")),
            (
                named("mConditions"),
                PropertyValueEnum::Container(
                    vec![
                        pointer(
                            named("ContextualConditionSpellName"),
                            vec![(named("mSpell"), hash(0x5be1_1000))],
                        ),
                        pointer(named("ContextualConditionChanceToPlay"), vec![]),
                    ]
                    .into(),
                ),
            ),
            (
                named("mAudioAction"),
                pointer(
                    named("ContextualActionPlayVO"),
                    vec![
                        (named("mSelfEventName"), string("cast3D")),
                        (named("mAllyEventName"), string("cast3DAlly")),
                        (named("mEnemyEventName"), string("cast3DEnemy")),
                        (named("mSpectatorEventName"), string("cast3DSpectator")),
                    ],
                )
                .into(),
            ),
        ],
    )
}

/// A rule without a name or a condition, whose action names the owner's event only.
fn plain_rule() -> values::Embedded {
    embed(
        named("ContextualRule"),
        vec![(
            named("mAudioAction"),
            pointer(
                named("ContextualActionPlayVO"),
                vec![(named("mSelfEventName"), string("Taunt2D"))],
            )
            .into(),
        )],
    )
}

fn situation(rules: Vec<values::Embedded>) -> PropertyValueEnum {
    embed(
        named("ContextualSituation"),
        vec![(named("mRules"), PropertyValueEnum::Container(rules.into()))],
    )
    .into()
}

#[test]
fn bin_audio_reads_contextual_rules() {
    const SPELL_CAST: u32 = 0x5ca5_7000;
    const TAUNT: u32 = 0x7a07_7000;
    let cac = BinObject::builder(CAC_OBJECT, named("ContextualActionData"))
        .property(
            named("mSituations"),
            values::Map::new(
                Kind::Hash,
                Kind::Embedded,
                vec![
                    (hash(SPELL_CAST), situation(vec![spell_rule()])),
                    (hash(TAUNT), situation(vec![plain_rule()])),
                ],
            )
            .unwrap(),
        )
        .build();

    let audio = BinAudio::read(&bytes_of(vec![cac])).unwrap();

    assert_eq!(audio.contextual.len(), 1);
    assert_eq!(audio.contextual[0].object, CAC_OBJECT);
    assert_eq!(
        audio.contextual[0].rules,
        [
            ContextualRule {
                situation: SPELL_CAST,
                name: Some("Basic 1".to_owned()),
                steps: vec![
                    SiteStep::Field(named("mSituations").0),
                    SiteStep::Key("5ca57000".to_owned()),
                    SiteStep::Field(named("mRules").0),
                    SiteStep::Index(0),
                ],
                spells: vec![0x5be1_1000],
                chance: Some(0),
                names: vec![
                    AudienceName::new(Audience::Owner, "cast3D"),
                    AudienceName::new(Audience::Ally, "cast3DAlly"),
                    AudienceName::new(Audience::Enemy, "cast3DEnemy"),
                    AudienceName::new(Audience::Spectator, "cast3DSpectator"),
                ],
            },
            ContextualRule {
                situation: TAUNT,
                name: None,
                steps: vec![
                    SiteStep::Field(named("mSituations").0),
                    SiteStep::Key("7a077000".to_owned()),
                    SiteStep::Field(named("mRules").0),
                    SiteStep::Index(0),
                ],
                spells: Vec::new(),
                chance: None,
                names: vec![AudienceName::new(Audience::Owner, "Taunt2D")],
            },
        ]
    );
}

#[test]
fn bin_audio_records_sound_fields_of_system_and_emitter_audio() {
    const SYSTEM: BinHash = named("VfxSystemDefinitionData");
    const AUDIO: BinHash = named("VfxEmitterAudio");
    const ON_CREATE: BinHash = named("soundOnCreateDefault");
    const PERSISTENT: BinHash = named("soundPersistentDefault");
    const EMITTER_ON_CREATE: BinHash = named("SoundOnCreate");
    const EMITTER_PERSISTENT: BinHash = named("SoundPersistent");
    let system = BinObject::builder(0x3333_0000, SYSTEM)
        .property(ON_CREATE, values::String::new("Play_sfx_Cast".to_owned()))
        .property(
            named("Audio"),
            embed(AUDIO, vec![(EMITTER_PERSISTENT, string("Play_sfx_Loop"))]),
        )
        .build();

    let audio = BinAudio::read(&bytes_of(vec![system])).unwrap();

    let fields: Vec<(u32, u32, Vec<SiteStep>, &str)> = audio
        .sound_fields
        .iter()
        .map(|field| {
            (
                field.class,
                field.field,
                field.site.steps.clone(),
                field.value.as_str(),
            )
        })
        .collect();
    assert_eq!(
        fields,
        [
            (SYSTEM.0, ON_CREATE.0, vec![], "Play_sfx_Cast"),
            (SYSTEM.0, PERSISTENT.0, vec![], ""),
            (
                AUDIO.0,
                EMITTER_ON_CREATE.0,
                vec![SiteStep::Field(named("Audio").0)],
                ""
            ),
            (
                AUDIO.0,
                EMITTER_PERSISTENT.0,
                vec![SiteStep::Field(named("Audio").0)],
                "Play_sfx_Loop"
            ),
        ]
    );
}
