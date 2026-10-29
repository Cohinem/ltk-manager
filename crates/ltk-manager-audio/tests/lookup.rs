//! Events of a bank set resolved into play trees, through the public surface.

mod common;

use common::{FakeFiles, bank as fixture_bank};
use ltk_manager_audio::{
    ActionNode, BankSet, BankUnit, EventNames, MediaSite, PlayNode, PlayTree, SoundLookup,
};
use ltk_wwise::bank::{BankHeader, BankVersion, Section};
use ltk_wwise::hierarchy::{Action, Event, Hierarchy, Object, ObjectKind, StreamType, Typed};
use ltk_wwise::{Bank, BankId, MediaIndex, ObjectId, Package, SourceId};

const V145: BankVersion = BankVersion::V145;

const EVENTS: &str = "events.bnk";
const MEDIA: &str = "media.bnk";
const PACKAGE: &str = "media.wpk";

/// Returns the bytes of `bank`.
fn bytes_of(bank: &Bank) -> Vec<u8> {
    let mut bytes = Vec::new();
    bank.to_writer(&mut bytes).expect("write bank");
    bytes
}

/// Returns a version 145 bank whose hierarchy holds `objects`.
fn hierarchy_bank(objects: impl IntoIterator<Item = Object>) -> Bank {
    let mut hierarchy = Hierarchy::new();
    for object in objects {
        hierarchy.push(object);
    }
    let mut bank = Bank::new(BankHeader::new(V145, BankId(1)));
    bank.sections_mut().push(Section::Hierarchy(hierarchy));
    bank
}

/// Returns the first object of the kind `kind` in the event bank fixture, decoded.
fn template(kind: ObjectKind) -> Typed {
    let fixture = fixture_bank("events_v145.bnk");
    let object = fixture
        .hierarchy()
        .expect("hierarchy")
        .of_kind(kind)
        .next()
        .expect("an object of the kind");
    object.decode(V145).expect("decode").expect("a typed kind")
}

fn ids(ids: &[u32]) -> Vec<ObjectId> {
    ids.iter().copied().map(ObjectId).collect()
}

fn event(id: u32, actions: &[u32]) -> Object {
    let event = Event {
        id: ObjectId(id),
        actions: ids(actions),
    };
    Typed::Event(event).encode(V145).expect("encode")
}

fn play(id: u32, target: u32) -> Object {
    let action = Action::play(ObjectId(id), ObjectId(target), BankId(1));
    Typed::Action(action).encode(V145).expect("encode")
}

/// Returns a Stop action of `target`: type `0x0102`, empty property bundles, no exceptions.
fn stop(id: u32, target: u32) -> Object {
    let mut payload = id.to_le_bytes().to_vec();
    payload.extend_from_slice(&0x0102u16.to_le_bytes());
    payload.extend_from_slice(&target.to_le_bytes());
    payload.extend_from_slice(&[0, 0, 0, 0, 0, 0]);
    Object::new(ObjectKind::ACTION, payload).expect("payload holds an ID")
}

fn sound(id: u32, source: u32, stream: StreamType) -> Object {
    let Typed::Sound(mut sound) = template(ObjectKind::SOUND) else {
        unreachable!("the template is a sound");
    };
    sound.id = ObjectId(id);
    sound.source.source_id = SourceId(source);
    sound.source.stream_type = stream;
    Typed::Sound(sound).encode(V145).expect("encode")
}

fn container(kind: ObjectKind, id: u32, children: &[u32]) -> Object {
    let Typed::Container(mut container) = template(kind) else {
        unreachable!("the template is a container");
    };
    container.id = ObjectId(id);
    container.children = ids(children);
    Typed::Container(container).encode(V145).expect("encode")
}

fn mixer(id: u32, children: &[u32]) -> Object {
    container(ObjectKind::ACTOR_MIXER, id, children)
}

fn random(id: u32, children: &[u32]) -> Object {
    container(ObjectKind::RANDOM_SEQUENCE_CONTAINER, id, children)
}

/// Returns a LayerContainer: an actor-mixer payload with no layers after the children.
fn layer(id: u32, children: &[u32]) -> Object {
    let mut payload = mixer(id, children).into_payload();
    /* The layer count and the `continuous_validation` byte. */
    payload.extend_from_slice(&[0; 5]);
    Object::new(ObjectKind::LAYER_CONTAINER, payload).expect("payload holds an ID")
}

/// Returns a SwitchContainer: an actor-mixer payload with empty switch fields around the children.
fn switch(id: u32, children: &[u32]) -> Object {
    let mut payload = mixer(id, children).into_payload();
    let node_end = payload.len() - 4 - 4 * children.len();
    /* The group type, the group ID, the default switch and the continuous validation. */
    payload.splice(node_end..node_end, [0; 10]);
    /* The switch group count and the switch parameter count. */
    payload.extend_from_slice(&[0; 8]);
    Object::new(ObjectKind::SWITCH_CONTAINER, payload).expect("payload holds an ID")
}

/// Returns an object of the kind `kind` that has no typed layout.
fn untyped(kind: ObjectKind, id: u32) -> Object {
    Object::new(kind, id.to_le_bytes().to_vec()).expect("payload holds an ID")
}

/// Returns a Sound whose payload ends after its ID.
fn broken_sound(id: u32) -> Object {
    untyped(ObjectKind::SOUND, id)
}

/// Returns a bank set of one unit over the event bank `events`, a media bank of `banked` sources
/// and a package of `packaged` sources.
fn set(events: Bank, banked: &[u32], packaged: &[u32]) -> BankSet {
    let mut media = MediaIndex::new();
    for &source in banked {
        media.insert(SourceId(source), b"RIFF".to_vec());
    }
    let mut package = Package::new();
    for &source in packaged {
        package.insert_wem(SourceId(source), b"RIFF".to_vec());
    }
    let mut package_bytes = Vec::new();
    package
        .to_writer(&mut package_bytes)
        .expect("write package");

    let files = FakeFiles::default()
        .with(EVENTS, bytes_of(&events))
        .with(MEDIA, bytes_of(&Bank::media_only(MEDIA, media)))
        .with(PACKAGE, package_bytes);
    let unit = BankUnit {
        name: "unit".to_owned(),
        bank_path: vec![EVENTS.to_owned(), MEDIA.to_owned(), PACKAGE.to_owned()],
        events: Vec::new(),
        voice_over: false,
    };
    BankSet::open(&[unit], &files, None)
}

/// Resolves the event `id` of `set` with no names.
fn resolve(set: &BankSet, id: u32) -> PlayTree {
    let names = EventNames::new();
    SoundLookup::new(set, &names)
        .event(ObjectId(id))
        .expect("resolve")
        .expect("an event")
}

/// Returns the target of the only action of `tree`.
fn target(tree: &PlayTree) -> &PlayNode {
    let [
        ActionNode {
            target: Some(target),
            ..
        },
    ] = &tree.actions[..]
    else {
        panic!("not one action with a target: {tree:?}");
    };
    target
}

fn banked_sound(id: u32, source: u32) -> PlayNode {
    PlayNode::Sound {
        id: ObjectId(id),
        source: SourceId(source),
        stream: StreamType::DATA_BANK,
        media: MediaSite::InBank { file: 1 },
    }
}

#[test]
fn event_resolves_every_container_kind_with_its_children() {
    let events = hierarchy_bank([
        event(1, &[10]),
        play(10, 20),
        mixer(20, &[21, 22, 23, 24, 25]),
        random(21, &[30]),
        switch(22, &[31]),
        layer(23, &[32]),
        untyped(ObjectKind::MUSIC_TRACK, 24),
        untyped(ObjectKind(17), 25),
        sound(30, 300, StreamType::DATA_BANK),
        sound(31, 310, StreamType::DATA_BANK),
        sound(32, 320, StreamType::DATA_BANK),
    ]);
    let set = set(events, &[300, 310, 320], &[]);

    let tree = resolve(&set, 1);

    assert_eq!(
        target(&tree),
        &PlayNode::Mixer {
            id: ObjectId(20),
            children: vec![
                PlayNode::Random {
                    id: ObjectId(21),
                    children: vec![banked_sound(30, 300)],
                },
                PlayNode::Switch {
                    id: ObjectId(22),
                    children: vec![banked_sound(31, 310)],
                },
                PlayNode::Layer {
                    id: ObjectId(23),
                    children: vec![banked_sound(32, 320)],
                },
                PlayNode::Unsupported {
                    id: ObjectId(24),
                    kind: ObjectKind::MUSIC_TRACK,
                },
                PlayNode::Unsupported {
                    id: ObjectId(25),
                    kind: ObjectKind(17),
                },
            ],
        }
    );
}

#[test]
fn event_marks_object_that_no_bank_holds_as_missing() {
    let events = hierarchy_bank([event(1, &[10]), play(10, 20), mixer(20, &[21])]);
    let set = set(events, &[], &[]);

    let tree = resolve(&set, 1);

    assert_eq!(
        target(&tree),
        &PlayNode::Mixer {
            id: ObjectId(20),
            children: vec![PlayNode::Missing { id: ObjectId(21) }],
        }
    );
}

#[test]
fn event_visits_each_object_of_a_cycle_once() {
    let events = hierarchy_bank([
        event(1, &[10]),
        play(10, 20),
        mixer(20, &[21, 30]),
        mixer(21, &[20, 30, 31]),
        sound(30, 300, StreamType::DATA_BANK),
        sound(31, 310, StreamType::DATA_BANK),
    ]);
    let set = set(events, &[300, 310], &[]);

    let tree = resolve(&set, 1);

    assert_eq!(
        target(&tree),
        &PlayNode::Mixer {
            id: ObjectId(20),
            children: vec![PlayNode::Mixer {
                id: ObjectId(21),
                children: vec![banked_sound(30, 300), banked_sound(31, 310)],
            },],
        }
    );
}

#[test]
fn event_keeps_class_of_action_other_than_play_with_no_target() {
    let events = hierarchy_bank([
        event(1, &[10, 11, 12]),
        stop(10, 30),
        play(11, 30),
        sound(30, 300, StreamType::DATA_BANK),
    ]);
    let set = set(events, &[300], &[]);

    let tree = resolve(&set, 1);

    assert_eq!(
        tree.actions,
        [
            ActionNode {
                id: ObjectId(10),
                class: Some(0x0100),
                target: None,
            },
            ActionNode {
                id: ObjectId(11),
                class: Some(0x0400),
                target: Some(banked_sound(30, 300)),
            },
            ActionNode {
                id: ObjectId(12),
                class: None,
                target: None,
            },
        ]
    );
}

#[test]
fn event_finds_media_by_stream_type() {
    let events = hierarchy_bank([
        event(1, &[10]),
        play(10, 20),
        mixer(20, &[30, 31, 32, 33]),
        sound(30, 300, StreamType::DATA_BANK),
        sound(31, 310, StreamType::STREAMING),
        sound(32, 320, StreamType::PREFETCH),
        sound(33, 330, StreamType::STREAMING),
    ]);
    let set = set(events, &[300, 320], &[310, 320]);

    let tree = resolve(&set, 1);

    let PlayNode::Mixer { children, .. } = target(&tree) else {
        panic!("not a mixer: {tree:?}");
    };
    let sites: Vec<MediaSite> = children
        .iter()
        .map(|child| match child {
            PlayNode::Sound { media, .. } => *media,
            other => panic!("not a sound: {other:?}"),
        })
        .collect();
    assert_eq!(
        sites,
        [
            MediaSite::InBank { file: 1 },
            MediaSite::InPackage { file: 2 },
            MediaSite::InPackage { file: 2 },
            MediaSite::Missing,
        ]
    );
}

#[test]
fn event_decode_error_stops_that_event_only() {
    let events = hierarchy_bank([
        event(1, &[10]),
        play(10, 20),
        broken_sound(20),
        event(2, &[11]),
        play(11, 30),
        sound(30, 300, StreamType::DATA_BANK),
    ]);
    let set = set(events, &[300], &[]);
    let names = EventNames::new();
    let lookup = SoundLookup::new(&set, &names);

    let error = lookup.event(ObjectId(1)).unwrap_err();
    let other = lookup.event(ObjectId(2)).unwrap().unwrap();

    assert_eq!(error.object, ObjectId(20));
    assert_eq!(error.bank, EVENTS);
    assert_eq!(target(&other), &banked_sound(30, 300));
}

#[test]
fn event_returns_none_if_id_is_not_an_event() {
    let events = hierarchy_bank([play(10, 20)]);
    let set = set(events, &[], &[]);
    let names = EventNames::new();
    let lookup = SoundLookup::new(&set, &names);

    assert_eq!(lookup.event(ObjectId(10)).unwrap(), None);
    assert_eq!(lookup.event(ObjectId(99)).unwrap(), None);
}

#[test]
fn event_named_hashes_name_and_keeps_it() {
    let id = ObjectId::from_name("Play_sfx_Test");
    let events = hierarchy_bank([event(id.0, &[])]);
    let set = set(events, &[], &[]);
    let names = EventNames::new();

    let tree = SoundLookup::new(&set, &names)
        .event_named("Play_sfx_Test")
        .unwrap()
        .unwrap();

    assert_eq!(tree.event, id);
    assert_eq!(tree.name.as_deref(), Some("Play_sfx_Test"));
}

#[test]
fn event_takes_its_name_from_the_name_table() {
    let id = ObjectId::from_name("Play_sfx_Test");
    let events = hierarchy_bank([event(id.0, &[])]);
    let set = set(events, &[], &[]);
    let names: EventNames = ["Play_sfx_Test"].into_iter().collect();

    let tree = SoundLookup::new(&set, &names).event(id).unwrap().unwrap();

    assert_eq!(tree.name.as_deref(), Some("Play_sfx_Test"));
}

#[test]
fn fixture_events_of_version_134_resolve_to_sounds() {
    let files = FakeFiles::default()
        .with_fixture(EVENTS, "events_v134.bnk")
        .with_fixture(MEDIA, "media_v134.bnk");
    let unit = BankUnit {
        name: "Map22".to_owned(),
        bank_path: vec![EVENTS.to_owned(), MEDIA.to_owned()],
        events: Vec::new(),
        voice_over: false,
    };
    let set = BankSet::open(&[unit], &files, None);
    let names = EventNames::new();
    let lookup = SoundLookup::new(&set, &names);

    let events = fixture_bank("events_v134.bnk");
    let targets: Vec<PlayNode> = events
        .hierarchy()
        .unwrap()
        .of_kind(ObjectKind::EVENT)
        .flat_map(|event| lookup.event(event.id()).unwrap().unwrap().actions)
        .filter_map(|action| action.target)
        .collect();

    assert!(!targets.is_empty());
    assert!(
        targets
            .iter()
            .all(|target| !matches!(target, PlayNode::Missing { .. })),
        "{targets:?}"
    );
}

#[test]
fn fixture_events_resolve_to_media_of_their_media_bank() {
    let files = FakeFiles::default()
        .with_fixture(EVENTS, "events_v145.bnk")
        .with_fixture(MEDIA, "media_v145.bnk")
        .with_fixture(PACKAGE, "package.wpk");
    let unit = BankUnit {
        name: "Map22".to_owned(),
        bank_path: vec![EVENTS.to_owned(), MEDIA.to_owned(), PACKAGE.to_owned()],
        events: Vec::new(),
        voice_over: false,
    };
    let set = BankSet::open(&[unit], &files, None);
    let names = EventNames::new();
    let lookup = SoundLookup::new(&set, &names);

    let events = fixture_bank("events_v145.bnk");
    let trees: Vec<PlayTree> = events
        .hierarchy()
        .unwrap()
        .of_kind(ObjectKind::EVENT)
        .map(|event| lookup.event(event.id()).unwrap().unwrap())
        .collect();

    fn banked_sites(node: &PlayNode, sites: &mut Vec<MediaSite>) {
        match node {
            PlayNode::Sound { stream, media, .. } if *stream == StreamType::DATA_BANK => {
                sites.push(*media)
            }
            PlayNode::Random { children, .. }
            | PlayNode::Switch { children, .. }
            | PlayNode::Layer { children, .. }
            | PlayNode::Mixer { children, .. } => {
                for child in children {
                    banked_sites(child, sites);
                }
            }
            _ => {}
        }
    }
    let mut sites = Vec::new();
    for action in trees.iter().flat_map(|tree| &tree.actions) {
        if let Some(target) = &action.target {
            banked_sites(target, &mut sites);
        }
    }
    assert!(!sites.is_empty());
    assert!(
        sites
            .iter()
            .all(|site| *site == MediaSite::InBank { file: 1 })
    );

    insta::assert_debug_snapshot!(trees);
}
