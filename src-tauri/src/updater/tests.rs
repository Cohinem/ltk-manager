use super::*;

#[test]
fn progress_reports_each_percentage_once() {
    let mut progress = Progress::default();

    assert_eq!(progress.advance(10, Some(1000)), Some(1));
    assert_eq!(progress.advance(5, Some(1000)), None);
    assert_eq!(progress.advance(5, Some(1000)), Some(2));
}

#[test]
fn progress_caps_at_one_hundred() {
    let mut progress = Progress::default();

    assert_eq!(progress.advance(1500, Some(1000)), Some(100));
    assert_eq!(progress.advance(10, Some(1000)), None);
}

#[test]
fn progress_without_a_length_reports_nothing() {
    let mut progress = Progress::default();

    assert_eq!(progress.advance(10, None), None);
    assert_eq!(progress.advance(10, Some(0)), None);
}

#[test]
fn an_executable_opens_with_mz() {
    assert!(is_executable(b"MZ\x90\x00"));
    assert!(!is_executable(b"PK\x03\x04"));
    assert!(!is_executable(b""));
}
