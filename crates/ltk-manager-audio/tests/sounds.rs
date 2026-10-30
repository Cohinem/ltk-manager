//! Event names resolved into play trees for a viewport, through the public surface.

mod common;

use common::{FakeFiles, bank as fixture_bank};
use ltk_manager_audio::{
    AudioIndex, BankUnit, BinAudio, EventNode, MediaContainer, ResolvedSound, SoundResolution,
    resolve_sounds,
};
use ltk_wwise::bank::{BankHeader, BankVersion, Section};
use ltk_wwise::hierarchy::{Action, Event, Hierarchy, Object, ObjectKind, StreamType, Typed};
use ltk_wwise::{Bank, BankId, MediaIndex, ObjectId, SourceId};

const V145: BankVersion = BankVersion::V145;

const SKIN_EVENTS: &str = "assets/sounds/skin03_sfx_events.bnk";
const SKIN_MEDIA: &str = "assets/sounds/skin03_sfx_audio.bnk";
const BASE_EVENTS: &str = "assets/sounds/base_sfx_events.bnk";
const BASE_MEDIA: &str = "assets/sounds/base_sfx_audio.bnk";

const STEP: &str = "Play_sfx_Ahri_Step";
const CAST: &str = "Play_sfx_Ahri_Cast";

fn bytes_of(bank: &Bank) -> Vec<u8> {
    let mut bytes = Vec::new();
    bank.to_writer(&mut bytes).expect("write bank");
    bytes
}

fn hierarchy_bank(objects: impl IntoIterator<Item = Object>) -> Bank {
    let mut hierarchy = Hierarchy::new();
    for object in objects {
        hierarchy.push(object);
    }
    let mut bank = Bank::new(BankHeader::new(V145, BankId(1)));
    bank.sections_mut().push(Section::Hierarchy(hierarchy));
    bank
}

fn media_bank(path: &str, sources: &[u32]) -> Vec<u8> {
    let mut media = MediaIndex::new();
    for &source in sources {
        media.insert(SourceId(source), b"RIFF".to_vec());
    }
    bytes_of(&Bank::media_only(path, media))
}

/// Returns the objects of an event `name` that plays one data bank sound of `source`.
fn played(name: &str, action: u32, sound: u32, source: u32) -> [Object; 3] {
    let event = Typed::Event(Event {
        id: ObjectId::from_name(name),
        actions: vec![ObjectId(action)],
    });
    let play = Typed::Action(Action::play(ObjectId(action), ObjectId(sound), BankId(1)));

    let fixture = fixture_bank("events_v145.bnk");
    let template = fixture
        .hierarchy()
        .expect("hierarchy")
        .of_kind(ObjectKind::SOUND)
        .next()
        .expect("a sound")
        .decode(V145)
        .expect("decode")
        .expect("a typed sound");
    let Typed::Sound(mut typed) = template else {
        unreachable!("the template is a sound");
    };
    typed.id = ObjectId(sound);
    typed.source.source_id = SourceId(source);
    typed.source.stream_type = StreamType::DATA_BANK;

    [
        event.encode(V145).expect("encode"),
        play.encode(V145).expect("encode"),
        Typed::Sound(typed).encode(V145).expect("encode"),
    ]
}

fn unit(name: &str, paths: &[&str], events: &[&str]) -> BankUnit {
    BankUnit {
        name: name.to_owned(),
        bank_path: paths.iter().map(|path| (*path).to_owned()).collect(),
        events: events.iter().map(|event| (*event).to_owned()).collect(),
        voice_over: false,
    }
}

/// The banks of the skin play `STEP` from source 11, and the base banks play `CAST` from 22.
fn files() -> FakeFiles {
    FakeFiles::default()
        .with(
            SKIN_EVENTS,
            bytes_of(&hierarchy_bank(played(STEP, 100, 200, 11))),
        )
        .with(SKIN_MEDIA, media_bank(SKIN_MEDIA, &[11]))
        .with(
            BASE_EVENTS,
            bytes_of(&hierarchy_bank(played(CAST, 101, 201, 22))),
        )
        .with(BASE_MEDIA, media_bank(BASE_MEDIA, &[22]))
}

/// An index whose one bank unit registers `CAST` on the base banks.
fn base_index() -> AudioIndex {
    let mut builder = AudioIndex::builder();
    builder.add_bin(
        "data/characters/ahri/ahri.bin",
        BinAudio {
            units: vec![unit("Ahri_Base_SFX", &[BASE_EVENTS, BASE_MEDIA], &[CAST]).into()],
            event_names: vec![CAST.to_owned()],
            ..BinAudio::default()
        },
    );
    builder.build()
}

/// Returns the source and the container of every sound under the tree of `resolved`.
fn media_of(resolved: &ResolvedSound) -> Vec<(u32, Option<MediaContainer>)> {
    let SoundResolution::Resolved { tree, .. } = &resolved.resolution else {
        panic!("{} did not resolve: {resolved:?}", resolved.name);
    };
    tree.actions
        .iter()
        .filter_map(|action| action.node.as_ref())
        .filter_map(|node| match node {
            EventNode::Sound { source, media, .. } => {
                Some((*source, media.as_ref().map(|media| media.container)))
            }
            _ => None,
        })
        .collect()
}

#[test]
fn resolve_sounds_reads_event_from_own_bank_units() {
    let skin_units = [unit("Skin03_SFX", &[SKIN_EVENTS, SKIN_MEDIA], &[])];

    let resolved = resolve_sounds(&skin_units, &[STEP.to_owned()], &[], &files(), None);

    assert_eq!(resolved.len(), 1);
    assert_eq!(resolved[0].name, STEP);
    assert_eq!(media_of(&resolved[0]), [(11, Some(MediaContainer::Bank))]);
}

#[test]
fn resolve_sounds_reads_properties_of_action_and_sound() {
    let skin_units = [unit("Skin03_SFX", &[SKIN_EVENTS, SKIN_MEDIA], &[])];

    let resolved = resolve_sounds(&skin_units, &[STEP.to_owned()], &[], &files(), None);

    let SoundResolution::Resolved { properties, .. } = &resolved[0].resolution else {
        panic!("{STEP} did not resolve: {:?}", resolved[0]);
    };
    let ids: Vec<u32> = properties.iter().map(|object| object.id).collect();
    assert_eq!(ids, [100, 200]);
}

#[test]
fn resolve_sounds_adds_index_units_for_name_own_units_miss() {
    let skin_units = [unit("Skin03_SFX", &[SKIN_EVENTS, SKIN_MEDIA], &[])];
    let index = base_index();

    let resolved = resolve_sounds(
        &skin_units,
        &[STEP.to_owned(), CAST.to_owned()],
        &[&index],
        &files(),
        None,
    );

    assert_eq!(media_of(&resolved[0]), [(11, Some(MediaContainer::Bank))]);
    assert_eq!(media_of(&resolved[1]), [(22, Some(MediaContainer::Bank))]);
}

#[test]
fn resolve_sounds_reports_name_no_bank_holds() {
    let skin_units = [unit("Skin03_SFX", &[SKIN_EVENTS, SKIN_MEDIA], &[])];
    let index = base_index();

    let resolved = resolve_sounds(
        &skin_units,
        &["Play_sfx_Nowhere".to_owned()],
        &[&index],
        &files(),
        None,
    );

    assert_eq!(resolved[0].resolution, SoundResolution::NoEvent);
}

#[test]
fn resolve_sounds_prefers_own_unit_over_index_unit_of_same_event() {
    let skin_units = [unit("Skin03_SFX", &[SKIN_EVENTS, SKIN_MEDIA], &[])];
    let mut builder = AudioIndex::builder();
    builder.add_bin(
        "data/characters/ahri/ahri.bin",
        BinAudio {
            units: vec![unit("Ahri_Base_SFX", &[BASE_EVENTS, BASE_MEDIA], &[STEP]).into()],
            ..BinAudio::default()
        },
    );
    let index = builder.build();
    let files = files().with(
        BASE_EVENTS,
        bytes_of(&hierarchy_bank(played(STEP, 101, 201, 22))),
    );

    let resolved = resolve_sounds(&skin_units, &[STEP.to_owned()], &[&index], &files, None);

    assert_eq!(media_of(&resolved[0]), [(11, Some(MediaContainer::Bank))]);
}
