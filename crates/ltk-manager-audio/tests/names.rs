//! The event name table through the public surface.

mod common;

use common::FakeFiles;
use ltk_manager_audio::{BankSet, BankUnit, EventNames};
use ltk_wwise::ObjectId;

#[test]
fn event_names_resolve_id_to_name() {
    let names: EventNames = ["Play_vo_Ahri_Attack"].into_iter().collect();

    assert_eq!(
        names.get(ObjectId(0x2890_d955)),
        Some("Play_vo_Ahri_Attack")
    );
    assert_eq!(names.get(ObjectId(1)), None);
}

#[test]
fn event_names_keep_first_name_of_an_id() {
    let mut names = EventNames::new();

    assert!(names.insert("Play_vo_Ahri_Attack"));
    assert!(!names.insert("PLAY_VO_AHRI_ATTACK"));

    assert_eq!(names.len(), 1);
    assert_eq!(
        names.get(ObjectId(0x2890_d955)),
        Some("Play_vo_Ahri_Attack")
    );
}

#[test]
fn bank_set_event_names_hold_events_of_its_units() {
    let unit = BankUnit {
        name: "Ahri_Base_VO".to_owned(),
        bank_path: Vec::new(),
        events: vec!["Play_vo_Ahri_Attack".to_owned()],
        voice_over: true,
    };

    let set = BankSet::open(&[unit], &FakeFiles::default(), None);

    assert_eq!(
        set.event_names()
            .get(ObjectId::from_name("Play_vo_Ahri_Attack")),
        Some("Play_vo_Ahri_Attack")
    );
}
