//! Unit tests for assembling the overlay's mod list.

use crate::mods::test_support::make_test_library;

fn fs_mod(id: &str) -> ltk_overlay::EnabledMod {
    ltk_overlay::EnabledMod {
        id: id.to_owned(),
        content: Box::new(ltk_overlay::FsModContent::new("unused".into())),
        enabled_layers: None,
    }
}

#[test]
fn workshop_projects_outrank_enabled_mods() {
    let storage = tempfile::tempdir().unwrap();
    let (library, _config) = make_test_library(storage.path());

    let mods = library
        .collect_overlay_mods(&[storage.path().join("project")], vec![fs_mod("installed")])
        .unwrap();

    let ids: Vec<&str> = mods.iter().map(|m| m.id.as_str()).collect();
    assert_eq!(ids, ["workshop:project", "installed"]);
}
