use super::*;

fn names(items: &[&str]) -> Vec<String> {
    items.iter().map(|item| (*item).to_owned()).collect()
}

#[test]
fn events_list_edits_appends_created_event() {
    let edits = events_list_edits(&names(&["Play_a"]), &[], &names(&["Play_b"]));

    assert_eq!(
        edits,
        [ListEdit::Append {
            name: "Play_b".to_owned()
        }]
    );
}

#[test]
fn events_list_edits_skips_name_that_list_holds() {
    let edits = events_list_edits(&names(&["play_B"]), &[], &names(&["Play_b"]));

    assert!(edits.is_empty());
}

#[test]
fn events_list_edits_sets_renamed_event_in_its_place() {
    let edits = events_list_edits(
        &names(&["Play_a", "Play_b"]),
        &names(&["Play_b"]),
        &names(&["Play_c"]),
    );

    assert_eq!(
        edits,
        [ListEdit::Set {
            index: 1,
            name: "Play_c".to_owned()
        }]
    );
}

#[test]
fn events_list_edits_removes_deleted_events_last_first() {
    let edits = events_list_edits(
        &names(&["Play_a", "Play_b", "Play_c"]),
        &names(&["Play_a", "Play_c", "Play_x"]),
        &[],
    );

    assert_eq!(
        edits,
        [ListEdit::Remove { index: 2 }, ListEdit::Remove { index: 0 }]
    );
}

#[test]
fn events_list_edits_appends_renamed_event_that_list_lacks() {
    let edits = events_list_edits(
        &names(&["Play_a"]),
        &names(&["Play_x"]),
        &names(&["Play_y"]),
    );

    assert_eq!(
        edits,
        [ListEdit::Append {
            name: "Play_y".to_owned()
        }]
    );
}
