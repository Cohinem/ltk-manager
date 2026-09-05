//! The four slots the app keeps one index in.

use super::*;

fn ready() -> ObjectIndex {
    let chunks: &[Chunk<'_>] = &[("data/objects.bin", prop(&[("characters/aatrox", "Skin")]))];
    let (_tmp, index) = build(&[("Objects.wad.client", chunks)], 1);
    index
}

#[test]
fn a_state_starts_absent_and_a_build_moves_it_through_building_to_ready() {
    let state = ObjectIndexState::<String>::default();
    assert!(matches!(
        state.snapshot().unwrap(),
        ObjectIndexSnapshot::Absent
    ));

    let ticket = state.begin().unwrap().expect("nothing is building");
    assert!(matches!(
        state.snapshot().unwrap(),
        ObjectIndexSnapshot::Building
    ));
    assert!(state.is_current(ticket));
    assert!(state.begin().unwrap().is_none(), "one build at a time");

    state.finish(ticket, Ok(ready())).unwrap();
    assert!(matches!(
        state.snapshot().unwrap(),
        ObjectIndexSnapshot::Ready(_)
    ));
    assert!(
        state.begin().unwrap().is_none(),
        "a ready index is not rebuilt unasked"
    );
}

#[test]
fn a_failed_build_is_reported_and_can_be_retried() {
    let state = ObjectIndexState::<String>::default();
    let ticket = state.begin().unwrap().unwrap();
    state.finish(ticket, Err("no install".to_owned())).unwrap();

    match state.snapshot().unwrap() {
        ObjectIndexSnapshot::Failed(error) => assert_eq!(error, "no install"),
        other => panic!("expected a failure, got {other:?}"),
    }
    assert!(
        state.begin().unwrap().is_some(),
        "a failure is retried by the next warm"
    );
}

#[test]
fn clearing_drops_the_index_and_the_result_of_a_build_still_running() {
    let state = ObjectIndexState::<String>::default();
    let ticket = state.begin().unwrap().unwrap();

    state.clear().unwrap();
    assert!(
        !state.is_current(ticket),
        "the running build is told to stop"
    );
    assert!(matches!(
        state.snapshot().unwrap(),
        ObjectIndexSnapshot::Absent
    ));

    state.finish(ticket, Ok(ready())).unwrap();
    assert!(
        matches!(state.snapshot().unwrap(), ObjectIndexSnapshot::Absent),
        "a result arriving after a clear is dropped"
    );
}

#[test]
fn a_newer_build_outranks_the_result_of_an_older_one() {
    let state = ObjectIndexState::<String>::default();
    let old = state.begin().unwrap().unwrap();
    state.clear().unwrap();
    let new = state.begin().unwrap().unwrap();

    state.finish(old, Err("late".to_owned())).unwrap();
    assert!(matches!(
        state.snapshot().unwrap(),
        ObjectIndexSnapshot::Building
    ));

    state.finish(new, Ok(ready())).unwrap();
    assert!(matches!(
        state.snapshot().unwrap(),
        ObjectIndexSnapshot::Ready(_)
    ));
}

#[test]
fn renaming_touches_a_ready_index_alone() {
    let state = ObjectIndexState::<String>::default();
    state
        .rename(|index| index.named(&TestNames::over(&[], &[])))
        .unwrap();
    assert!(matches!(
        state.snapshot().unwrap(),
        ObjectIndexSnapshot::Absent
    ));

    let ticket = state.begin().unwrap().unwrap();
    state.finish(ticket, Ok(ready())).unwrap();
    state
        .rename(|index| index.named(&TestNames::over(&["characters/aatrox"], &["Skin"])))
        .unwrap();

    let ObjectIndexSnapshot::Ready(index) = state.snapshot().unwrap() else {
        panic!("renaming keeps the index ready");
    };
    assert_eq!(ranked(&index, "aatrox"), ["characters/aatrox"]);
}
