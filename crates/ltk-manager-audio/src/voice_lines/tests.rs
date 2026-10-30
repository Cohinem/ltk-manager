use std::collections::HashMap;
use std::io::{self, Cursor};

use ltk_hash::HashValue;
use ltk_meta::property::Kind;
use ltk_wwise::bank::{BankHeader, BankVersion, Section};
use ltk_wwise::hierarchy::{Event, Hierarchy, Typed};
use ltk_wwise::{Bank, BankId};

use super::*;
use crate::bin_audio::{BankSite, HolderAudio};
use crate::files::{AudioFile, AudioFiles, ReadSeek};
use crate::{AudioIndexBuilder, BinAudio, SitedUnit};

/* The names are spelled here rather than read from the module, so a wrong constant there fails
rather than agrees. */
const SPELL_CAST: u32 = 0x5ca5_7000;
const SPELL: u32 = 0x5be1_1000;
const VO_BANK: &str =
    "assets/sounds/wwise2016/vo/en_us/characters/lux/skins/base/lux_base_vo_events.bnk";

fn string(text: &str) -> PropertyValueEnum {
    values::String::new(text.to_owned()).into()
}

fn object(class: &str, properties: Vec<(&str, PropertyValueEnum)>) -> values::Struct {
    values::Struct {
        class_hash: named(class),
        properties: properties
            .into_iter()
            .map(|(name, value)| (named(name), value))
            .collect(),
    }
}

fn list(items: Vec<PropertyValueEnum>) -> PropertyValueEnum {
    PropertyValueEnum::Container(values::Container::new(Kind::Struct, items).expect("list"))
}

/// A rule with a spell condition, a 50% chance and a self name of `cast3D`.
fn spell_rule() -> PropertyValueEnum {
    values::Embedded(object(
        "ContextualRule",
        vec![
            ("mRuleName", string("Q")),
            (
                "mConditions",
                list(vec![
                    object(
                        "ContextualConditionSpellName",
                        vec![("mSpell", values::Hash::new(HashValue::narrow(SPELL)).into())],
                    )
                    .into(),
                    object(
                        "ContextualConditionChanceToPlay",
                        vec![("mPercentChanceToPlay", values::U8::new(50).into())],
                    )
                    .into(),
                ]),
            ),
            (
                "mAudioAction",
                object(
                    "ContextualActionPlayVO",
                    vec![
                        ("mSelfEventName", string("cast3D")),
                        ("mEnemyEventName", string("Quinn3D")),
                    ],
                )
                .into(),
            ),
        ],
    ))
    .into()
}

fn cac() -> BinObject {
    let situation = values::Embedded(object(
        "ContextualSituation",
        vec![
            ("mChooseRandomValidRule", values::Bool::new(true).into()),
            (
                "mRules",
                PropertyValueEnum::Container(
                    values::Container::new(Kind::Embedded, vec![spell_rule()]).expect("rules"),
                ),
            ),
        ],
    ));
    BinObject::builder(0x2222_0000u32, named("ContextualActionData"))
        .property(named("mCooldown"), values::F32::new(15.0))
        .property(
            named("mSituations"),
            values::Map::new(
                Kind::Hash,
                Kind::Embedded,
                vec![(
                    values::Hash::new(HashValue::narrow(SPELL_CAST)).into(),
                    situation.into(),
                )],
            )
            .expect("map"),
        )
        .build()
}

#[derive(Default)]
struct Names(HashMap<u32, String>);

impl SiteNames for Names {
    fn locate(&self, _path: &str) -> Option<AssetRef> {
        None
    }

    fn object_name(&self, _hash: u32) -> Option<String> {
        None
    }

    fn class_name(&self, _hash: u32) -> Option<String> {
        None
    }

    fn field_name(&self, _hash: u32) -> Option<String> {
        None
    }

    fn hash_name(&self, hash: u32) -> Option<String> {
        self.0.get(&hash).cloned()
    }
}

fn names() -> Names {
    Names(HashMap::from([
        (SPELL_CAST, "SpellCast".to_owned()),
        (SPELL, "Characters/Lux/Spells/LuxLightBinding".to_owned()),
    ]))
}

/// One bank in memory, at [`VO_BANK`].
struct OneBank(Vec<u8>);

impl AudioFiles for OneBank {
    fn read(&self, path: &str) -> io::Result<Option<AudioFile<Vec<u8>>>> {
        Ok(path.eq_ignore_ascii_case(VO_BANK).then(|| AudioFile {
            asset: AssetRef::File {
                path: VO_BANK.to_owned(),
            },
            contents: self.0.clone(),
        }))
    }

    fn open(&self, path: &str) -> io::Result<Option<AudioFile<Box<dyn ReadSeek>>>> {
        Ok(self.read(path)?.map(|file| AudioFile {
            asset: file.asset,
            contents: Box::new(Cursor::new(file.contents)) as Box<dyn ReadSeek>,
        }))
    }
}

fn bank_with_event(name: &str) -> Vec<u8> {
    let mut hierarchy = Hierarchy::new();
    hierarchy.push(
        Typed::Event(Event {
            id: ObjectId::from_name(name),
            actions: Vec::new(),
        })
        .encode(BankVersion::V145)
        .expect("encode"),
    );
    let mut bank = Bank::new(BankHeader::new(BankVersion::V145, BankId(1)));
    bank.sections_mut().push(Section::Hierarchy(hierarchy));
    let mut bytes = Vec::new();
    bank.to_writer(&mut bytes).expect("write bank");
    bytes
}

fn vo_unit() -> BankUnit {
    BankUnit {
        name: "Lux_Base_VO".to_owned(),
        bank_path: vec![VO_BANK.to_owned()],
        events: Vec::new(),
        voice_over: true,
    }
}

#[test]
fn voice_lines_read_reads_situation_rule_and_condition_paths() {
    let lines = VoiceLines::read(&cac(), None, &names());

    assert_eq!(lines.cooldown, 15.0);
    assert_eq!(lines.health_threshold, None);
    let [situation] = lines.situations.as_slice() else {
        panic!("one situation: {lines:?}");
    };
    assert_eq!(situation.name.as_deref(), Some("SpellCast"));
    assert_eq!(situation.path, "{5ca57000}");
    assert!(situation.choose_random);

    let [rule] = situation.rules.as_slice() else {
        panic!("one rule");
    };
    assert_eq!(rule.path, "{5ca57000}.1a116faf[0]");
    assert_eq!(rule.name.as_deref(), Some("Q"));
    assert_eq!(rule.priority, None);
    assert!(rule.stomp_lower);
    assert!(rule.active_voice_over);
    assert_eq!(rule.chance_weight, 1.0);
    assert_eq!(rule.cooldown_modifications, None);
    assert_eq!(
        rule.conditions[1].path,
        "{5ca57000}.1a116faf[0].2aff6c4a[1]"
    );
    assert_eq!(
        rule.conditions[1].fields,
        [VoiceConditionField {
            field: named("mPercentChanceToPlay").0,
            name: None,
            value: VoiceConditionValue::Integer { value: 50.0 },
        }]
    );
}

#[test]
fn voice_lines_read_resolves_spell_composition_against_skin_banks() {
    let event = "Play_vo_Lux_LuxLightBinding_cast3D";
    let banks = BankSet::open(&[vo_unit()], &OneBank(bank_with_event(event)), None);
    let tags = vec!["Lux".to_owned()];
    let skin = SkinVoice {
        tags: &tags,
        banks: &banks,
    };

    let lines = VoiceLines::read(&cac(), Some(&skin), &names());

    let audio = lines.situations[0].rules[0]
        .audio
        .as_ref()
        .expect("audio action");
    let owner = &audio.lines[0];
    assert_eq!(owner.audience, Audience::Owner);
    assert_eq!(
        owner.candidates,
        ["Play_vo_Lux_cast3D", "Play_vo_Lux_LuxLightBinding_cast3D"]
    );
    let resolved = owner.event.as_ref().expect("resolved event");
    assert_eq!(resolved.name, event);
    assert_eq!(resolved.id, ObjectId::from_name(event).0);
    assert_eq!(resolved.bank, VO_BANK);
}

#[test]
fn voice_lines_read_leaves_name_without_event_unresolved() {
    let banks = BankSet::open(
        &[vo_unit()],
        &OneBank(bank_with_event("Play_vo_Lux_Other")),
        None,
    );
    let tags = vec!["Lux".to_owned()];
    let skin = SkinVoice {
        tags: &tags,
        banks: &banks,
    };

    let lines = VoiceLines::read(&cac(), Some(&skin), &names());

    let audio = lines.situations[0].rules[0]
        .audio
        .as_ref()
        .expect("audio action");
    let enemy = &audio.lines[2];
    assert_eq!(enemy.audience, Audience::Enemy);
    assert_eq!(enemy.short, "Quinn3D");
    assert_eq!(enemy.event, None);
    let ally = &audio.lines[1];
    assert!(ally.short.is_empty());
    assert!(ally.candidates.is_empty());
}

fn skin_unit(object: u32, contextual: u32, voice_over: bool) -> SitedUnit {
    SitedUnit {
        unit: BankUnit {
            voice_over,
            ..vo_unit()
        },
        site: BankSite {
            object,
            class: named("SkinCharacterDataProperties").0,
            steps: Vec::new(),
        },
        holder: HolderAudio {
            contextual: Some(contextual),
            tags: vec!["Lux".to_owned()],
        },
    }
}

fn index_of(bin: &str, units: Vec<SitedUnit>) -> AudioIndex {
    let mut builder: AudioIndexBuilder = AudioIndex::builder();
    builder.add_bin(
        bin,
        BinAudio {
            units,
            ..BinAudio::default()
        },
    );
    builder.build()
}

#[test]
fn linking_skins_keeps_voice_over_units_of_each_skin_once() {
    let game = index_of(
        "data/characters/lux/skins/skin0.bin",
        vec![
            skin_unit(0x10, 0x2222_0000, true),
            skin_unit(0x10, 0x2222_0000, false),
        ],
    );

    let skins = linking_skins(0x2222_0000, &[&game]);

    let [skin] = skins.as_slice() else {
        panic!("one skin: {skins:?}");
    };
    assert_eq!(skin.bin, "data/characters/lux/skins/skin0.bin");
    assert_eq!(skin.units.len(), 1);
    assert_eq!(skin.index, 0);
}

#[test]
fn linking_skins_skips_game_skin_that_project_relinks() {
    let bin = "data/characters/lux/skins/skin7.bin";
    let project = index_of(bin, vec![skin_unit(0x17, 0x3333_0000, true)]);
    let game = index_of(bin, vec![skin_unit(0x17, 0x2222_0000, true)]);

    assert!(linking_skins(0x2222_0000, &[&project, &game]).is_empty());
    assert_eq!(linking_skins(0x3333_0000, &[&project, &game]).len(), 1);
}

#[test]
fn rule_template_reads_back_named_rule_with_owner_line_and_ignore_timer() {
    let situation = values::Embedded(object(
        "ContextualSituation",
        vec![(
            "mRules",
            PropertyValueEnum::Container(
                values::Container::new(
                    Kind::Embedded,
                    vec![rule_template("New rule", "Joke2D").into()],
                )
                .expect("rules"),
            ),
        )],
    ));
    let cac = BinObject::builder(0x2222_0000u32, named("ContextualActionData"))
        .property(
            named("mSituations"),
            values::Map::new(
                Kind::Hash,
                Kind::Embedded,
                vec![(
                    values::Hash::new(HashValue::narrow(SPELL_CAST)).into(),
                    situation.into(),
                )],
            )
            .expect("map"),
        )
        .build();

    let lines = VoiceLines::read(&cac, None, &names());

    let rule = &lines.situations[0].rules[0];
    assert_eq!(rule.name.as_deref(), Some("New rule"));
    assert_eq!(
        rule.cooldown_modifications,
        Some(CooldownModifications {
            ignore_timer: true,
            dont_reset_timer: false,
        })
    );
    let audio = rule.audio.as_ref().expect("audio action");
    assert_eq!(audio.class, named("ContextualActionPlayVO").0);
    assert_eq!(audio.lines[0].short, "Joke2D");
}
