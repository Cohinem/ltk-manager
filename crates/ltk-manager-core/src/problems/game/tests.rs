use super::*;

#[test]
fn warming_builds_the_index_before_anything_asks() {
    let game = tempfile::tempdir().expect("a temp dir");
    std::fs::create_dir_all(game.path().join("DATA").join("FINAL")).expect("DATA/FINAL");
    let content = InstalledContent::at(game.path());
    assert!(content.held.get().is_none());

    content.warm();

    let held = content.held.get().expect("an index after warming");
    assert!(held.at.is_empty());
    assert!(!content.holds(WadHash(1)));
}

#[test]
fn warming_an_install_with_no_archives_still_answers() {
    let game = tempfile::tempdir().expect("a temp dir");
    let content = InstalledContent::at(game.path());

    content.warm();

    assert!(content.held.get().is_some());
    assert_eq!(content.read(WadHash(1)), Ok(None));
}
