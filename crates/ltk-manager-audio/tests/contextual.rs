//! The event names composed from the contextual rules of the skins that name a bank.

mod common;

use std::collections::HashSet;

use common::FakeNames;
use ltk_manager_audio::{
    Audience, AudienceName, AudioIndex, BankUnit, BinAudio, ContextualMatch, ContextualRule,
    ContextualRules, HolderAudio, ObjectId, SitedUnit, contextual_names,
};

const EVENTS: &str =
    "assets/sounds/wwise2016/vo/en_us/characters/ahri/skins/skin04/ahri_skin04_vo_events.bnk";
const CAC_OBJECT: u32 = 0x2222_0000;
const SPELL: u32 = 0x5be1_1000;

fn rule(name: &str, spells: Vec<u32>, short: &str) -> ContextualRule {
    ContextualRule {
        name: Some(name.to_owned()),
        spells,
        names: vec![AudienceName::new(Audience::Owner, short)],
        ..ContextualRule::default()
    }
}

/// An index with one skin whose unit names the bank, and the rules that its link reaches.
fn index(tags: &[&str], rules: Vec<ContextualRule>) -> AudioIndex {
    let mut builder = AudioIndex::builder();
    builder.add_bin(
        "data/characters/ahri/skins/skin4.bin",
        BinAudio {
            units: vec![SitedUnit {
                unit: BankUnit {
                    name: "Ahri_Skin04_VO".to_owned(),
                    bank_path: vec![EVENTS.to_owned()],
                    events: Vec::new(),
                    voice_over: true,
                },
                holder: HolderAudio {
                    contextual: Some(CAC_OBJECT),
                    tags: tags.iter().map(|tag| (*tag).to_owned()).collect(),
                },
                ..SitedUnit::default()
            }],
            ..BinAudio::default()
        },
    );
    builder.add_bin(
        "data/characters/ahri/ahri_multi_skins.bin",
        BinAudio {
            contextual: vec![ContextualRules {
                object: CAC_OBJECT,
                rules,
            }],
            ..BinAudio::default()
        },
    );
    builder.build()
}

fn events(names: &[&str]) -> HashSet<ObjectId> {
    names.iter().map(|name| ObjectId::from_name(name)).collect()
}

fn matches(index: &AudioIndex, bank: &[&str], names: &FakeNames) -> Vec<ContextualMatch> {
    let units: Vec<_> = index.units_naming(EVENTS).collect();
    contextual_names(&units, &[index], &events(bank), names)
}

fn composed(found: &[ContextualMatch]) -> Vec<(&str, usize, bool)> {
    found
        .iter()
        .map(|found| (found.name.as_str(), found.rule, found.ambiguous))
        .collect()
}

#[test]
fn contextual_names_compose_with_every_tag() {
    let index = index(
        &["Ahri", "AhriSkin04"],
        vec![
            rule("Skin04 Long", Vec::new(), "Move2DLong_Skin04"),
            rule("Basic", Vec::new(), "Taunt"),
        ],
    );

    let found = matches(
        &index,
        &["Play_vo_AhriSkin04_Move2DLong_Skin04", "Play_vo_Ahri_Taunt"],
        &FakeNames::default(),
    );

    assert_eq!(
        composed(&found),
        [
            ("Play_vo_AhriSkin04_Move2DLong_Skin04", 0, false),
            ("Play_vo_Ahri_Taunt", 1, false),
        ]
    );
    assert_eq!(found[0].object, CAC_OBJECT);
    assert_eq!(found[0].audience, Audience::Owner);
    assert_eq!(
        found[0].event,
        ObjectId::from_name("Play_vo_AhriSkin04_Move2DLong_Skin04")
    );
}

#[test]
fn contextual_names_compose_spell_segment_for_spell_condition() {
    let index = index(&["Ahri"], vec![rule("Basic 1", vec![SPELL], "cast3D")]);
    let names = FakeNames::default().with_hash(SPELL, "Characters/Ahri/Spells/AhriBasicAttack");

    let found = matches(&index, &["Play_vo_Ahri_AhriBasicAttack_cast3D"], &names);

    assert_eq!(
        composed(&found),
        [("Play_vo_Ahri_AhriBasicAttack_cast3D", 0, false)]
    );
}

#[test]
fn contextual_names_skip_compositions_not_in_bank() {
    let index = index(&["Ahri"], vec![rule("Basic", Vec::new(), "Taunt")]);

    let found = matches(&index, &["Play_vo_Ahri_Joke"], &FakeNames::default());

    assert!(found.is_empty());
}

#[test]
fn contextual_names_mark_ambiguous_rule() {
    let index = index(
        &["Ahri", "AhriSkin04"],
        vec![rule("Joke", Vec::new(), "Joke")],
    );

    let found = matches(
        &index,
        &["Play_vo_Ahri_Joke", "Play_vo_AhriSkin04_Joke"],
        &FakeNames::default(),
    );

    assert_eq!(
        composed(&found),
        [
            ("Play_vo_Ahri_Joke", 0, true),
            ("Play_vo_AhriSkin04_Joke", 0, true),
        ]
    );
}
