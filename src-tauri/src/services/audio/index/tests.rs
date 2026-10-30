use super::*;

const BUILD: GameBuild = GameBuild::new(16, 16, 8_049_184);

fn ready(build: Option<GameBuild>) -> Slot {
    Slot::Ready {
        build,
        index: Arc::default(),
    }
}

#[test]
fn slot_of_unknown_build_does_not_answer_known_build() {
    let slot = ready(None);

    assert!(slot.answer(None).is_some());
    assert!(slot.answer(Some(BUILD)).is_none());
}

#[test]
fn audio_index_state_clear_drops_index_of_unknown_build() {
    let state = AudioIndexState(Mutex::new(ready(None)));

    state.clear();

    assert!(state.0.lock().answer(None).is_none());
}
