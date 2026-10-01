//! Unit tests for assembling the overlay's mod list.

use std::collections::HashSet;

use super::WorkshopTestProject;
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
        .collect_overlay_mods(
            &[WorkshopTestProject::all_layers(
                storage.path().join("project"),
            )],
            vec![fs_mod("installed")],
        )
        .unwrap();

    let ids: Vec<&str> = mods.iter().map(|m| m.id.as_str()).collect();
    assert_eq!(ids, ["workshop:project", "installed"]);
}

#[test]
fn workshop_projects_carry_their_tested_layers() {
    let storage = tempfile::tempdir().unwrap();
    let (library, _config) = make_test_library(storage.path());
    let layers = HashSet::from(["extras".to_owned()]);
    let project = WorkshopTestProject {
        path: storage.path().join("project"),
        enabled_layers: Some(layers.clone()),
    };

    let mods = library
        .collect_overlay_mods(&[project], Vec::new())
        .unwrap();

    assert_eq!(mods[0].enabled_layers, Some(layers));
}

#[test]
fn a_workshop_test_keeps_base_on() {
    let project = WorkshopTestProject {
        path: "project".into(),
        enabled_layers: Some(HashSet::new()),
    };

    assert!(project.is_layer_active("base"));
    assert!(!project.is_layer_active("extras"));
    assert!(WorkshopTestProject::all_layers("project").is_layer_active("extras"));
}
