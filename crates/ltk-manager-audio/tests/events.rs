//! The events of an opened event bank, resolved through a fake store, through the public surface.

mod common;

use common::{FakeFiles, FakeNames, fixture};
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{
    Audience, AudienceName, AudioEvent, AudioFile, AudioIndex, BankSetOrigin, BankSite, BankUnit,
    BinAudio, ContextualRule, ContextualRules, EventBank, EventNode, EventPlaylistItem,
    EventStatus, HolderAudio, MediaContainer, ObjectId, OpenedBank, PlayMode, SiteStep, SitedUnit,
    SoundStream,
};
use ltk_manager_base::hashing::named;
use ltk_wwise::bank::{BankHeader, BankVersion, Section};
use ltk_wwise::hierarchy::{Action, Event, Hierarchy, Object, ObjectKind, Typed};
use ltk_wwise::{Bank, BankId, Package, SourceId};

const DIR: &str = "assets/sounds/wwise2016/sfx/shared";
const EVENTS: &str = "assets/sounds/wwise2016/sfx/shared/map22_sfx_events.bnk";
const MEDIA: &str = "assets/sounds/wwise2016/sfx/shared/map22_sfx_audio.bnk";
const PACKAGE: &str = "assets/sounds/wwise2016/sfx/shared/map22_sfx_audio.wpk";

/// The events of `events_v145.bnk`, in file order.
const FIXTURE_EVENTS: [u32; 3] = [339_038_649, 3_553_705_574, 3_890_987_893];

/// The event of the fixture whose tree contains the one `DATA_BANK` sound, 879168912.
const BANKED_EVENT: u32 = 339_038_649;
const BANKED_SOURCE: u32 = 879_168_912;

/// The streaming sources of `events_v145.bnk`, which no fixture package contains.
const STREAMED: [u32; 16] = [
    6_126_505,
    486_319_399,
    686_453_154,
    400_805_526,
    872_844_278,
    6102,
    494_898_776,
    1_011_279_409,
    349_514_972,
    307_720_992,
    112_571_979,
    195_911_386,
    104_734_880,
    183_398_573,
    955_065_921,
    753_477_248,
];

/// A package that contains one placeholder media for each streaming source of the event fixture.
fn streamed_package() -> Vec<u8> {
    let mut package = Package::new();
    for source in STREAMED {
        package.insert_wem(SourceId(source), b"RIFF".to_vec());
    }
    let mut bytes = Vec::new();
    package.to_writer(&mut bytes).expect("write package");
    bytes
}

fn opened(path: &str, bytes: Vec<u8>) -> OpenedBank {
    OpenedBank {
        path: path.to_owned(),
        file: AudioFile {
            asset: AssetRef::File {
                path: format!("C:/mods/{path}"),
            },
            contents: bytes,
        },
    }
}

/// An index with one bank unit that names the events bank, the media bank and the package.
fn unit_index() -> AudioIndex {
    let mut builder = AudioIndex::builder();
    builder.add_bin(
        "data/maps/shipping/map22/map22.bin",
        BinAudio {
            units: vec![
                ltk_manager_audio::BankUnit {
                    name: "Map22_SFX".to_owned(),
                    bank_path: vec![EVENTS.to_owned(), MEDIA.to_owned(), PACKAGE.to_owned()],
                    events: Vec::new(),
                    voice_over: false,
                }
                .into(),
            ],
            ..BinAudio::default()
        },
    );
    builder.build()
}

fn event_of(events: &[AudioEvent], id: u32) -> &AudioEvent {
    events
        .iter()
        .find(|event| event.id == id)
        .unwrap_or_else(|| panic!("no event {id}"))
}

/// Returns every sound of `nodes` as `(source, media)`.
fn sounds(nodes: impl IntoIterator<Item = EventNode>) -> Vec<(u32, Option<MediaContainer>)> {
    let mut found = Vec::new();
    for node in nodes {
        match node {
            EventNode::Sound { source, media, .. } => {
                found.push((source, media.map(|media| media.container)));
            }
            EventNode::Random { children, .. }
            | EventNode::Switch { children, .. }
            | EventNode::Layer { children, .. }
            | EventNode::Mixer { children, .. } => found.extend(sounds(children)),
            _ => {}
        }
    }
    found
}

fn tree_sounds(bank: &EventBank, event: u32) -> Vec<(u32, Option<MediaContainer>)> {
    let tree = bank.event(ObjectId(event)).unwrap().unwrap();
    sounds(tree.actions.into_iter().filter_map(|action| action.node))
}

#[test]
fn event_bank_resolves_every_fixture_event_with_its_bank_unit() {
    let files = FakeFiles::default()
        .with_fixture(MEDIA, "media_v145.bnk")
        .with(PACKAGE, streamed_package());
    let index = unit_index();

    let bank = EventBank::open(
        opened(EVENTS, fixture("events_v145.bnk")),
        &[&index],
        &files,
        None,
        &FakeNames::default(),
    );
    let list = bank.events();

    let ids: Vec<u32> = list.events.iter().map(|event| event.id).collect();
    assert_eq!(ids, FIXTURE_EVENTS);
    assert_eq!(list.origin, BankSetOrigin::Units);
    for event in &list.events {
        assert_eq!(event.status, EventStatus::Resolved, "{event:?}");
    }
    let media: u32 = list.events.iter().map(|event| event.media_count).sum();
    assert_eq!(media, 17);
}

#[test]
fn event_bank_lists_playlist_of_each_fixture_random_container() {
    let files = FakeFiles::default().with_fixture(MEDIA, "media_v145.bnk");
    let index = unit_index();
    let bank = EventBank::open(
        opened(EVENTS, fixture("events_v145.bnk")),
        &[&index],
        &files,
        None,
        &FakeNames::default(),
    );

    fn randoms(node: &EventNode, found: &mut Vec<(PlayMode, usize, Vec<EventPlaylistItem>)>) {
        match node {
            EventNode::Random {
                children,
                mode,
                playlist,
                ..
            } => {
                found.push((*mode, children.len(), playlist.clone()));
                children.iter().for_each(|child| randoms(child, found));
            }
            EventNode::Switch { children, .. }
            | EventNode::Layer { children, .. }
            | EventNode::Mixer { children, .. } => {
                children.iter().for_each(|child| randoms(child, found));
            }
            _ => {}
        }
    }
    let mut found = Vec::new();
    for event in FIXTURE_EVENTS {
        let tree = bank.event(ObjectId(event)).unwrap().unwrap();
        for node in tree
            .actions
            .iter()
            .filter_map(|action| action.node.as_ref())
        {
            randoms(node, &mut found);
        }
    }

    assert_eq!(found.len(), 5);
    for (mode, children, playlist) in found {
        let mut listed: Vec<u32> = playlist.iter().map(|item| item.child).collect();
        listed.sort_unstable();
        let every_child: Vec<u32> = (0..u32::try_from(children).unwrap()).collect();

        assert_eq!(mode, PlayMode::Random);
        assert_eq!(listed, every_child);
        assert!(playlist.iter().all(|item| item.weight == 1), "{playlist:?}");
    }
}

#[test]
fn event_bank_marks_data_bank_sounds_missing_without_media_bank() {
    let files = FakeFiles::default().with(PACKAGE, streamed_package());
    let index = unit_index();

    let bank = EventBank::open(
        opened(EVENTS, fixture("events_v145.bnk")),
        &[&index],
        &files,
        None,
        &FakeNames::default(),
    );
    let list = bank.events();

    assert_eq!(
        event_of(&list.events, BANKED_EVENT).status,
        EventStatus::MediaMissing
    );
    let banked: Vec<_> = tree_sounds(&bank, BANKED_EVENT)
        .into_iter()
        .filter(|(source, _)| *source == BANKED_SOURCE)
        .collect();
    assert_eq!(banked, [(BANKED_SOURCE, None)]);
}

#[test]
fn event_bank_falls_back_to_sibling_media_bank() {
    let files = FakeFiles::default().with_fixture(MEDIA, "media_v145.bnk");

    let bank = EventBank::open(
        opened(EVENTS, fixture("events_v145.bnk")),
        &[&AudioIndex::default()],
        &files,
        None,
        &FakeNames::default(),
    );
    let list = bank.events();

    assert_eq!(list.origin, BankSetOrigin::Siblings);
    let paths: Vec<&str> = list.files.iter().map(|file| file.path.as_str()).collect();
    assert_eq!(paths, [EVENTS, MEDIA, PACKAGE]);
    assert!(
        tree_sounds(&bank, BANKED_EVENT).contains(&(BANKED_SOURCE, Some(MediaContainer::Bank)))
    );
}

#[test]
fn event_bank_finds_voice_over_unit_of_localized_bank_under_its_locale() {
    let vo =
        |locale: &str, file: &str| format!("assets/sounds/wwise2016/vo/{locale}/shared/{file}");
    let mut builder = AudioIndex::builder();
    builder.add_bin(
        "data/maps/shipping/map22/map22.bin",
        BinAudio {
            units: vec![
                BankUnit {
                    name: "Map22_VO".to_owned(),
                    bank_path: vec![
                        vo("en_US", "map22_vo_events.bnk"),
                        vo("en_US", "map22_vo_audio.bnk"),
                    ],
                    events: Vec::new(),
                    voice_over: true,
                }
                .into(),
            ],
            ..BinAudio::default()
        },
    );
    let index = builder.build();
    let files =
        FakeFiles::default().with_fixture(&vo("ko_KR", "map22_vo_audio.bnk"), "media_v145.bnk");

    let bank = EventBank::open(
        opened(
            &vo("ko_kr", "map22_vo_events.bnk"),
            fixture("events_v145.bnk"),
        ),
        &[&index],
        &files,
        None,
        &FakeNames::default(),
    );
    let list = bank.events();

    assert_eq!(list.origin, BankSetOrigin::Units);
    let paths: Vec<&str> = list.files.iter().map(|file| file.path.as_str()).collect();
    assert_eq!(
        paths,
        [
            vo("ko_kr", "map22_vo_events.bnk"),
            vo("ko_KR", "map22_vo_audio.bnk")
        ]
    );
    assert!(
        tree_sounds(&bank, BANKED_EVENT).contains(&(BANKED_SOURCE, Some(MediaContainer::Bank)))
    );
}

#[test]
fn event_bank_without_events_stem_opens_alone() {
    let path = format!("{DIR}/map22_sfx.bnk");

    let bank = EventBank::open(
        opened(&path, fixture("events_v145.bnk")),
        &[],
        &FakeFiles::default(),
        None,
        &FakeNames::default(),
    );

    assert_eq!(bank.events().origin, BankSetOrigin::Alone);
}

fn hierarchy_bank(objects: impl IntoIterator<Item = Object>) -> Vec<u8> {
    let mut hierarchy = Hierarchy::new();
    for object in objects {
        hierarchy.push(object);
    }
    let mut bank = Bank::new(BankHeader::new(BankVersion::V145, BankId(1)));
    bank.sections_mut().push(Section::Hierarchy(hierarchy));
    let mut bytes = Vec::new();
    bank.to_writer(&mut bytes).expect("write bank");
    bytes
}

fn event(id: u32, actions: &[u32]) -> Object {
    Typed::Event(Event {
        id: ObjectId(id),
        actions: actions.iter().copied().map(ObjectId).collect(),
    })
    .encode(BankVersion::V145)
    .expect("encode")
}

fn play(id: u32, target: u32) -> Object {
    Typed::Action(Action::play(ObjectId(id), ObjectId(target), BankId(1)))
        .encode(BankVersion::V145)
        .expect("encode")
}

/// Returns a Stop action of `target`: type `0x0102`, empty property bundles, no exceptions.
fn stop(id: u32, target: u32) -> Object {
    let mut payload = id.to_le_bytes().to_vec();
    payload.extend_from_slice(&0x0102u16.to_le_bytes());
    payload.extend_from_slice(&target.to_le_bytes());
    payload.extend_from_slice(&[0, 0, 0, 0, 0, 0]);
    Object::new(ObjectKind::ACTION, payload).expect("payload contains an ID")
}

#[test]
fn event_bank_marks_target_that_no_bank_holds() {
    let name = "Play_sfx_Ahri_AhriQ_OnCast";
    let id = ObjectId::from_name(name).0;
    let bytes = hierarchy_bank([event(id, &[10, 11]), play(10, 99), stop(11, 98)]);
    let mut names = AudioIndex::builder();
    names.add_bin(
        "data/ahri.bin",
        BinAudio {
            event_names: vec![name.to_owned()],
            ..BinAudio::default()
        },
    );
    let names = names.build();

    let bank = EventBank::open(
        opened(EVENTS, bytes),
        &[&names],
        &FakeFiles::default(),
        None,
        &FakeNames::default(),
    );
    let list = bank.events();
    let tree = bank.event(ObjectId(id)).unwrap().unwrap();

    assert_eq!(list.events[0].name.as_deref(), Some(name));
    assert_eq!(list.events[0].status, EventStatus::ObjectMissing);
    let actions: Vec<(Option<&str>, Option<u32>)> = tree
        .actions
        .iter()
        .map(|action| (action.label.as_deref(), action.target))
        .collect();
    assert_eq!(
        actions,
        [(Some("Play"), Some(99)), (Some("Stop"), Some(98))]
    );
    assert_eq!(tree.actions[0].node, Some(EventNode::Missing { id: 99 }));
}

#[test]
fn event_bank_reports_stream_of_each_sound() {
    let files = FakeFiles::default()
        .with_fixture(MEDIA, "media_v145.bnk")
        .with(PACKAGE, streamed_package());
    let index = unit_index();
    let bank = EventBank::open(
        opened(EVENTS, fixture("events_v145.bnk")),
        &[&index],
        &files,
        None,
        &FakeNames::default(),
    );

    let tree = bank.event(ObjectId(BANKED_EVENT)).unwrap().unwrap();
    let mut streams = Vec::new();
    fn collect(node: &EventNode, streams: &mut Vec<(u32, SoundStream)>) {
        match node {
            EventNode::Sound { source, stream, .. } => streams.push((*source, *stream)),
            EventNode::Random { children, .. }
            | EventNode::Switch { children, .. }
            | EventNode::Layer { children, .. }
            | EventNode::Mixer { children, .. } => {
                for child in children {
                    collect(child, streams);
                }
            }
            _ => {}
        }
    }
    for action in &tree.actions {
        if let Some(node) = &action.node {
            collect(node, &mut streams);
        }
    }

    assert!(streams.contains(&(BANKED_SOURCE, SoundStream::DataBank)));
    assert!(streams.contains(&(6_126_505, SoundStream::Streaming)));
}

const SKIN_BIN: &str = "data/characters/ahri/skins/skin0.bin";
const CAC_BIN: &str = "data/characters/ahri/ahri_multi_skins.bin";
const CAC_OBJECT: u32 = 0x2222_0000;

/// A unit at `skinAudioProperties.bankUnits[0]` that names `EVENTS` and lists `events`.
fn listing_unit(events: &[&str], contextual: Option<u32>) -> SitedUnit {
    SitedUnit {
        unit: BankUnit {
            name: "Ahri_Base_VO".to_owned(),
            bank_path: vec![EVENTS.to_owned()],
            events: events.iter().map(|event| (*event).to_owned()).collect(),
            voice_over: true,
        },
        site: BankSite {
            object: 0x1111_0000,
            class: named("SkinCharacterDataProperties").0,
            steps: vec![
                SiteStep::Field(named("skinAudioProperties").0),
                SiteStep::Field(named("bankUnits").0),
                SiteStep::Index(0),
            ],
        },
        holder: HolderAudio {
            contextual,
            tags: vec!["Ahri".to_owned()],
        },
    }
}

#[test]
fn event_bank_names_events_from_contextual_rules_with_their_rule() {
    const SPELL: u32 = 0x5be1_1000;
    const SPELL_CAST: u32 = 0x5ca5_7000;
    let name = "Play_vo_Ahri_AhriBasicAttack_cast3D";
    let id = ObjectId::from_name(name).0;
    let mut builder = AudioIndex::builder();
    builder.add_bin(
        SKIN_BIN,
        BinAudio {
            units: vec![listing_unit(&[], Some(CAC_OBJECT))],
            ..BinAudio::default()
        },
    );
    builder.add_bin(
        CAC_BIN,
        BinAudio {
            contextual: vec![ContextualRules {
                object: CAC_OBJECT,
                rules: vec![ContextualRule {
                    situation: SPELL_CAST,
                    name: Some("Basic 1".to_owned()),
                    steps: vec![
                        SiteStep::Field(named("mSituations").0),
                        SiteStep::Key("5ca57000".to_owned()),
                        SiteStep::Field(named("mRules").0),
                        SiteStep::Index(0),
                    ],
                    spells: vec![SPELL],
                    names: vec![AudienceName::new(Audience::Owner, "cast3D")],
                }],
            }],
            ..BinAudio::default()
        },
    );
    let index = builder.build();
    let names = FakeNames::default()
        .with_asset(CAC_BIN)
        .with_hash(SPELL, "Characters/Ahri/Spells/AhriBasicAttack")
        .with_hash(SPELL_CAST, "SpellCast");

    let bank = EventBank::open(
        opened(EVENTS, hierarchy_bank([event(id, &[])])),
        &[&index],
        &FakeFiles::default(),
        None,
        &names,
    );
    let list = bank.events();

    assert_eq!(list.events[0].name.as_deref(), Some(name));
    let contexts = &list.events[0].contexts;
    assert_eq!(contexts.len(), 1);
    assert_eq!(contexts[0].situation, "SpellCast");
    assert_eq!(contexts[0].rule.as_deref(), Some("Basic 1"));
    assert_eq!(contexts[0].audience, Audience::Owner);
    assert!(!contexts[0].ambiguous);
    assert_eq!(contexts[0].row.object_hash, "0x22220000");
    assert_eq!(
        contexts[0]
            .row
            .property
            .as_ref()
            .map(|row| row.path.as_str()),
        Some("6f5eb901{5ca57000}.1a116faf[0]")
    );
}

#[test]
fn event_bank_reveals_events_row_of_unit_that_lists_event() {
    let name = "Play_vo_Ahri_Joke";
    let id = ObjectId::from_name(name).0;
    let mut builder = AudioIndex::builder();
    builder.add_bin(
        SKIN_BIN,
        BinAudio {
            units: vec![listing_unit(&["Play_vo_Ahri_Taunt", name], None)],
            event_names: vec!["Play_vo_Ahri_Taunt".to_owned(), name.to_owned()],
            ..BinAudio::default()
        },
    );
    let index = builder.build();

    let bank = EventBank::open(
        opened(EVENTS, hierarchy_bank([event(id, &[])])),
        &[&index],
        &FakeFiles::default(),
        None,
        &FakeNames::default(),
    );
    let list = bank.events();

    let listed = list.events[0]
        .listed
        .as_ref()
        .expect("a unit lists the event");
    assert_eq!(listed.bin, SKIN_BIN);
    assert_eq!(
        listed.property.as_ref().map(|row| row.path.as_str()),
        Some("8f7b194f.f8f29f92[0].12d8e384[1]")
    );
    assert!(list.events[0].contexts.is_empty());
}
