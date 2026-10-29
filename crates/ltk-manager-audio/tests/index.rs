//! The audio index built from hand-built bins and the media fixtures, through its public surface.

mod common;

use std::io::Cursor;

use common::{fixture, packaged_sources};
use ltk_hash::BinHash;
use ltk_manager_audio::{AudioIndex, BankUnit, BinAudio, ObjectId, SourceId, media_sources};
use ltk_manager_base::hashing::named;
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject, PropertyValueEnum};

/* The names are spelled here rather than read from the crate, so a wrong constant there fails
rather than agrees. */
const SKIN_AUDIO: BinHash = named("SkinAudioProperties");
const BANK_UNITS: BinHash = named("bankUnits");
const UNIT: BinHash = named("BankUnit");
const SKIN: BinHash = named("SkinCharacterDataProperties");
const VFX_SYSTEM: BinHash = named("VfxSystemDefinitionData");
const SOUND_EVENT: BinHash = named("SoundEventData");

const SKIN_BIN: &str = "data/characters/ahri/skins/skin7.bin";
const EVENTS_BANK: &str =
    "assets/sounds/wwise2016/sfx/characters/ahri/skins/skin07/ahri_skin07_sfx_events.bnk";
const AUDIO_BANK: &str =
    "assets/sounds/wwise2016/sfx/characters/ahri/skins/skin07/ahri_skin07_sfx_audio.bnk";

fn strings(items: &[&str]) -> PropertyValueEnum {
    PropertyValueEnum::Container(
        items
            .iter()
            .map(|item| values::String::new((*item).to_owned()))
            .collect(),
    )
}

fn unit(name: &str, paths: &[&str], events: &[&str], voice_over: bool) -> values::Embedded {
    values::Embedded(values::Struct {
        class_hash: UNIT,
        properties: [
            (named("name"), values::String::new(name.to_owned()).into()),
            (named("bankPath"), strings(paths)),
            (named("events"), strings(events)),
            (named("voiceOver"), values::Bool::new(voice_over).into()),
        ]
        .into_iter()
        .collect(),
    })
}

fn bytes_of(bin: &Bin) -> Vec<u8> {
    let mut out = std::io::Cursor::new(Vec::new());
    bin.to_writer(&mut out).expect("write bin");
    out.into_inner()
}

/// A skin bin with one bank unit and a VFX system and a clip event that name sounds.
fn skin_bin() -> Vec<u8> {
    let audio = BinObject::builder(BinHash(1), SKIN_AUDIO)
        .property(
            BANK_UNITS,
            PropertyValueEnum::Container(
                vec![unit(
                    "Ahri_Skin07_SFX",
                    &[EVENTS_BANK, AUDIO_BANK],
                    &["Play_sfx_Ahri_AhriQ_OnCast"],
                    false,
                )]
                .into(),
            ),
        )
        .build();
    let vfx = BinObject::builder(BinHash(2), VFX_SYSTEM)
        .property(
            named("soundOnCreateDefault"),
            values::String::new("Play_sfx_Ahri_AhriW_Buffactivate".to_owned()),
        )
        .property(
            named("particleName"),
            values::String::new("Ahri_Skin07_W".to_owned()),
        )
        .build();
    let clip = BinObject::builder(BinHash(3), SKIN)
        .property(
            named("clipEvents"),
            PropertyValueEnum::Container(
                vec![values::Embedded(values::Struct {
                    class_hash: SOUND_EVENT,
                    properties: [(
                        named("mSoundName"),
                        values::String::new("Play_sfx_Ahri_AhriE_Missile".to_owned()).into(),
                    )]
                    .into_iter()
                    .collect(),
                })]
                .into(),
            ),
        )
        .build();

    bytes_of(&Bin::new([audio, vfx, clip], std::iter::empty::<&str>()))
}

fn index() -> AudioIndex {
    let mut builder = AudioIndex::builder();
    builder.add_bin(SKIN_BIN, BinAudio::read(&skin_bin()).expect("read bin"));
    builder.build()
}

#[test]
fn bin_audio_reads_bank_units_as_written() {
    let audio = BinAudio::read(&skin_bin()).unwrap();

    assert_eq!(
        audio.units,
        [BankUnit {
            name: "Ahri_Skin07_SFX".to_owned(),
            bank_path: vec![EVENTS_BANK.to_owned(), AUDIO_BANK.to_owned()],
            events: vec!["Play_sfx_Ahri_AhriQ_OnCast".to_owned()],
            voice_over: false,
        }]
    );
}

#[test]
fn audio_index_units_naming_path_match_without_case() {
    let index = index();

    let upper = AUDIO_BANK.to_uppercase();
    let units: Vec<&str> = index
        .units_naming(&upper)
        .map(|unit| unit.bin.as_str())
        .collect();

    assert_eq!(units, [SKIN_BIN]);
    assert_eq!(index.units_naming("assets/sounds/other.bnk").count(), 0);
}

#[test]
fn audio_index_units_listing_event_match_its_name() {
    let index = index();

    let units: Vec<&str> = index
        .units_listing("play_sfx_ahri_ahriq_oncast")
        .map(|unit| unit.unit.name.as_str())
        .collect();

    assert_eq!(units, ["Ahri_Skin07_SFX"]);
    assert_eq!(
        index
            .units_listing("Play_sfx_Ahri_AhriW_Buffactivate")
            .count(),
        0
    );
}

#[test]
fn audio_index_names_events_of_units_and_sound_fields() {
    let index = index();

    for name in [
        "Play_sfx_Ahri_AhriQ_OnCast",
        "Play_sfx_Ahri_AhriW_Buffactivate",
        "Play_sfx_Ahri_AhriE_Missile",
    ] {
        assert_eq!(index.name(ObjectId::from_name(name)), Some(name));
    }
    assert_eq!(index.name(ObjectId::from_name("Ahri_Skin07_W")), None);
}

#[test]
fn audio_index_holds_every_source_of_package_and_media_bank() {
    let mut builder = AudioIndex::builder();
    builder.add_sources(media_sources(Cursor::new(fixture("package.wpk"))).unwrap());
    builder.add_sources(media_sources(Cursor::new(fixture("media_v145.bnk"))).unwrap());
    builder.add_sources(media_sources(Cursor::new(fixture("media_v134.bnk"))).unwrap());
    let index = builder.build();

    let banked = common::bank("media_v145.bnk");
    let media = banked.media().expect("media index");
    for (source, _) in media.iter() {
        assert!(index.uses_source(source), "{source:?}");
    }
    for source in packaged_sources() {
        assert!(index.uses_source(source), "{source:?}");
    }
    assert!(!index.uses_source(SourceId(1)));
}

#[test]
fn media_sources_reads_no_further_than_media_index() {
    let bank = fixture("media_v145.bnk");
    let head = &bank[..bank.len() - 16];

    let sources = media_sources(Cursor::new(head)).unwrap();

    assert_eq!(sources.len(), 1);
}

#[test]
fn media_sources_of_event_bank_without_media_is_empty() {
    assert_eq!(
        media_sources(Cursor::new(fixture("events_v145.bnk"))).unwrap(),
        []
    );
}

#[test]
fn audio_index_round_trips_through_bytes_for_its_build() {
    let index = index();

    let bytes = index.to_bytes("16.21.1");

    assert_eq!(AudioIndex::from_bytes(&bytes, "16.21.1"), Some(index));
    assert_eq!(AudioIndex::from_bytes(&bytes, "16.22.1"), None);
}
