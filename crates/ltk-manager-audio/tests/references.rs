//! The bank units that name a bank, grouped and ranked, through the public surface.

mod common;

use common::FakeNames;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{
    AudioIndex, BankList, BankReferences, BankSite, BankUnit, BinAudio, HolderAudio, SetFileState,
    SiteStep, SitedUnit,
};
use ltk_manager_base::hashing::named;

const EVENTS: &str =
    "ASSETS/Sounds/Wwise2016/VO/en_US/Characters/Ahri/Skins/Skin07/Ahri_Skin07_VO_events.bnk";
const MEDIA: &str =
    "ASSETS/Sounds/Wwise2016/VO/en_US/Characters/Ahri/Skins/Skin07/Ahri_Skin07_VO_audio.bnk";
const PACKAGE: &str =
    "ASSETS/Sounds/Wwise2016/VO/en_US/Characters/Ahri/Skins/Skin07/Ahri_Skin07_VO_audio.wpk";

const SKIN_OBJECT: u32 = 0x1111_0000;
const CAC_OBJECT: u32 = 0x2222_0000;

fn site(object: u32, index: usize) -> BankSite {
    BankSite {
        object,
        class: named("SkinCharacterDataProperties").0,
        steps: vec![
            SiteStep::Field(named("skinAudioProperties").0),
            SiteStep::Field(named("bankUnits").0),
            SiteStep::Index(index),
        ],
    }
}

fn vo_unit(index: usize) -> SitedUnit {
    SitedUnit {
        unit: BankUnit {
            name: "Ahri_Skin07_VO".to_owned(),
            bank_path: vec![MEDIA.to_owned(), EVENTS.to_owned(), PACKAGE.to_owned()],
            events: Vec::new(),
            voice_over: true,
        },
        site: site(SKIN_OBJECT, index),
        holder: HolderAudio {
            contextual: Some(CAC_OBJECT),
            tags: vec!["Ahri".to_owned()],
        },
    }
}

fn index_of(bins: &[(&str, Vec<SitedUnit>)]) -> AudioIndex {
    let mut builder = AudioIndex::builder();
    for (bin, units) in bins {
        builder.add_bin(
            bin,
            BinAudio {
                units: units.clone(),
                ..BinAudio::default()
            },
        );
    }
    builder.build()
}

fn bins(references: &BankReferences, group: usize) -> Vec<&str> {
    references.units[group]
        .declarations
        .iter()
        .map(|declaration| declaration.row.bin.as_str())
        .collect()
}

#[test]
fn bank_references_group_identical_units() {
    let game = index_of(&[
        ("data/characters/ahri/skins/skin1.bin", vec![vo_unit(1)]),
        ("data/characters/ahri/skins/skin2.bin", vec![vo_unit(1)]),
    ]);

    let references = BankReferences::of(EVENTS, &[&game], &FakeNames::default());

    assert_eq!(references.units.len(), 1);
    assert_eq!(references.units[0].name, "Ahri_Skin07_VO");
    assert!(references.units[0].voice_over);
    assert_eq!(
        bins(&references, 0),
        [
            "data/characters/ahri/skins/skin1.bin",
            "data/characters/ahri/skins/skin2.bin"
        ]
    );
}

#[test]
fn bank_references_list_project_first_then_matching_skin_then_root() {
    let project = index_of(&[("data/characters/ahri/skins/skin9.bin", vec![vo_unit(0)])]);
    let game = index_of(&[
        ("data/characters/ahri/skins/skin1.bin", vec![vo_unit(1)]),
        ("data/characters/ahri/skins/root.bin", vec![vo_unit(1)]),
        ("data/characters/ahri/skins/skin7.bin", vec![vo_unit(1)]),
    ]);

    let references = BankReferences::of(EVENTS, &[&project, &game], &FakeNames::default());

    assert_eq!(
        bins(&references, 0),
        [
            "data/characters/ahri/skins/skin9.bin",
            "data/characters/ahri/skins/skin7.bin",
            "data/characters/ahri/skins/root.bin",
            "data/characters/ahri/skins/skin1.bin",
        ]
    );
}

#[test]
fn bank_references_find_media_bank_unit_and_mark_opened_file() {
    let game = index_of(&[("data/characters/ahri/skins/skin7.bin", vec![vo_unit(1)])]);
    let names = FakeNames::default().with_asset(EVENTS);

    let references = BankReferences::of(&MEDIA.to_lowercase(), &[&game], &names);

    let files: Vec<(&str, bool, bool)> = references.units[0]
        .files
        .iter()
        .map(|file| {
            (
                file.path.as_str(),
                file.opened,
                file.state == SetFileState::Found,
            )
        })
        .collect();
    assert_eq!(
        files,
        [
            (MEDIA, true, false),
            (EVENTS, false, true),
            (PACKAGE, false, false)
        ]
    );
}

#[test]
fn bank_references_write_unit_row_and_contextual_link() {
    let mut cac = BinAudio::default();
    cac.contextual.push(ltk_manager_audio::ContextualRules {
        object: CAC_OBJECT,
        rules: Vec::new(),
    });
    let mut builder = AudioIndex::builder();
    builder.add_bin(
        "data/characters/ahri/skins/skin7.bin",
        BinAudio {
            units: vec![vo_unit(1)],
            ..BinAudio::default()
        },
    );
    builder.add_bin("data/characters/ahri/ahri_multi_skins.bin", cac);
    let game = builder.build();
    let names = FakeNames::default()
        .with_asset("data/characters/ahri/skins/skin7.bin")
        .with_field(named("skinAudioProperties").0, "skinAudioProperties")
        .with_field(named("bankUnits").0, "bankUnits");

    let references = BankReferences::of(EVENTS, &[&game], &names);

    let declaration = &references.units[0].declarations[0];
    assert_eq!(
        declaration.row.asset,
        Some(AssetRef::File {
            path: "data/characters/ahri/skins/skin7.bin".to_owned()
        })
    );
    assert_eq!(declaration.row.object_hash, "0x11110000");
    let property = declaration.row.property.as_ref().expect("a row");
    assert_eq!(property.path, "8f7b194f.f8f29f92[1]");
    assert_eq!(property.label, "skinAudioProperties.bankUnits[1]");
    let contextual = declaration.contextual.as_ref().expect("a link");
    assert_eq!(contextual.object_hash, "0x22220000");
    assert_eq!(contextual.bin, "data/characters/ahri/ahri_multi_skins.bin");
    assert_eq!(contextual.property, None);
}

#[test]
fn bank_references_return_lists_that_name_path() {
    let mut builder = AudioIndex::builder();
    builder.add_bin(
        "data/characters/ahri/ahri.bin",
        BinAudio {
            lists: vec![BankList {
                paths: vec![EVENTS.to_owned()],
                site: BankSite {
                    object: 5,
                    class: named("SpellObject").0,
                    steps: vec![
                        SiteStep::Field(named("mSpell").0),
                        SiteStep::Field(named("AudioBankPaths").0),
                    ],
                },
            }],
            ..BinAudio::default()
        },
    );
    let game = builder.build();

    let references = BankReferences::of(EVENTS, &[&game], &FakeNames::default());

    assert!(references.units.is_empty());
    assert_eq!(references.lists.len(), 1);
    assert_eq!(references.lists[0].bin, "data/characters/ahri/ahri.bin");
    assert_eq!(
        references.lists[0]
            .property
            .as_ref()
            .map(|row| row.path.as_str()),
        Some("56d2be52.3b182105")
    );
}
