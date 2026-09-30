use super::*;

#[test]
fn a_request_is_due_once_it_settles() {
    let refresh = OverlayRefresh::default();
    let now = Instant::now();
    refresh.request_at(now);

    assert!(!refresh.is_due(now));
    assert!(refresh.is_due(now + SETTLE));
}

#[test]
fn another_edit_restarts_the_settle_window() {
    let refresh = OverlayRefresh::default();
    let start = Instant::now();
    refresh.request_at(start);
    refresh.request_at(start + SETTLE);

    assert!(!refresh.is_due(start + SETTLE));
}

#[test]
fn nothing_is_due_without_a_request() {
    assert!(!OverlayRefresh::default().is_due(Instant::now() + SETTLE));
}

#[test]
fn deferring_reports_only_the_first_hold() {
    let refresh = OverlayRefresh::default();
    refresh.request();

    assert!(refresh.defer_to_game_end());
    assert!(!refresh.defer_to_game_end());
    assert!(refresh.waits_for_game());
}

#[test]
fn clearing_drops_the_request_and_the_hold() {
    let refresh = OverlayRefresh::default();
    let now = Instant::now();
    refresh.request_at(now);
    refresh.defer_to_game_end();

    refresh.clear();

    assert!(!refresh.is_due(now + SETTLE));
    assert!(!refresh.waits_for_game());
}
