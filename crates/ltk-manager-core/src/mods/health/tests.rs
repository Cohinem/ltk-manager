//! End-to-end tests at the check seam: verdicts over the same stale-bin
//! fixtures the repair suite uses.

use super::*;
use crate::mods::index::{LibraryModEntry, ModArchiveFormat};
use crate::mods::test_support::{
    make_slugged_entry, make_test_library, make_unpacked_entry, place_bin_archived_fantome,
    point_at_installed_build, seed_library, stale_bin,
};
use std::fs;

fn archived_entry(id: &str, slug: &str) -> LibraryModEntry {
    make_slugged_entry(id, slug, ModArchiveFormat::Fantome)
}

#[test]
fn checking_a_stale_archived_fantome_reports_it_repairable_and_remembers() {
    let storage = tempfile::tempdir().unwrap();
    let (library, mut config) = make_test_library(storage.path());
    point_at_installed_build(&mut config, storage.path());
    place_bin_archived_fantome(storage.path(), "stale-mod", &stale_bin());
    seed_library(&library, &config, vec![archived_entry("id-1", "stale-mod")]);
    let archive = storage.path().join("mods").join("stale-mod.fantome");
    let before = fs::read(&archive).unwrap();

    let verdict = library.check_mod_health(&config, "id-1").unwrap();

    assert_eq!(verdict.health, ModHealth::Repairable);
    assert_eq!(verdict.fixable, 1);
    assert_eq!(fs::read(&archive).unwrap(), before, "a check never writes");

    let verdicts = library.mod_health_verdicts(&config).unwrap();
    assert_eq!(verdicts.get("id-1").unwrap(), &verdict);
}

#[test]
fn checking_a_stale_project_mod_reports_it_repairable() {
    let storage = tempfile::tempdir().unwrap();
    let (library, mut config) = make_test_library(storage.path());
    point_at_installed_build(&mut config, storage.path());
    crate::mods::test_support::place_bin_project_mod(storage.path(), "unpacked-mod", &stale_bin());
    seed_library(
        &library,
        &config,
        vec![make_unpacked_entry("id-1", "unpacked-mod")],
    );

    let verdict = library.check_mod_health(&config, "id-1").unwrap();

    assert_eq!(verdict.health, ModHealth::Repairable);
    assert_eq!(verdict.fixable, 1);
}

/// Story: one unreadable mod does not cost the user the rest of the sweep.
#[test]
fn checking_many_skips_the_mod_it_cannot_read() {
    let storage = tempfile::tempdir().unwrap();
    let (library, mut config) = make_test_library(storage.path());
    point_at_installed_build(&mut config, storage.path());
    place_bin_archived_fantome(storage.path(), "good-mod", &stale_bin());
    // An archive-storage entry whose archive is gone is a mod the check
    // cannot read.
    let broken_dir = storage.path().join("mods").join("broken-mod");
    fs::create_dir_all(&broken_dir).unwrap();
    fs::write(broken_dir.join("mod.config.json"), "{}").unwrap();
    seed_library(
        &library,
        &config,
        vec![
            archived_entry("id-broken", "broken-mod"),
            archived_entry("id-good", "good-mod"),
        ],
    );

    let recorded =
        library.check_mods_health(&config, &["id-broken".to_string(), "id-good".to_string()]);

    assert_eq!(recorded, 1);
    let verdicts = library.mod_health_verdicts(&config).unwrap();
    assert_eq!(
        verdicts.get("id-good").unwrap().health,
        ModHealth::Repairable
    );
    assert!(!verdicts.contains_key("id-broken"));
}

/// Story: a repaired mod's badge updates without the user asking for a
/// re-check — the repair already analyzed the mod, so the verdict rides along.
#[test]
fn a_repair_refreshes_the_stored_verdict() {
    let storage = tempfile::tempdir().unwrap();
    let (library, mut config) = make_test_library(storage.path());
    point_at_installed_build(&mut config, storage.path());
    place_bin_archived_fantome(storage.path(), "stale-mod", &stale_bin());
    seed_library(&library, &config, vec![archived_entry("id-1", "stale-mod")]);

    let checked = library.check_mod_health(&config, "id-1").unwrap();
    assert_eq!(checked.health, ModHealth::Repairable);

    library.repair_mod(&config, "id-1").unwrap();

    let verdicts = library.mod_health_verdicts(&config).unwrap();
    assert_eq!(verdicts.get("id-1").unwrap().health, ModHealth::Healthy);
}

/// Story: a repair that wrote and was then called off leaves a verdict about
/// content that has since changed. The sweep compares only the basis, so a
/// stale verdict would stand until the game patches - it has to go instead.
#[test]
fn forgetting_a_verdict_makes_the_sweep_owe_that_mod_a_check() {
    let storage = tempfile::tempdir().unwrap();
    let (library, mut config) = make_test_library(storage.path());
    point_at_installed_build(&mut config, storage.path());
    crate::mods::test_support::place_bin_project_mod(storage.path(), "stale-mod", &stale_bin());
    seed_library(
        &library,
        &config,
        vec![make_unpacked_entry("id-1", "stale-mod")],
    );
    library.check_mod_health(&config, "id-1").unwrap();
    assert!(
        library
            .mod_health_verdicts(&config)
            .unwrap()
            .contains_key("id-1")
    );

    library.forget_health_check(&library.storage_dir(&config).unwrap(), "id-1");

    assert!(library.mod_health_verdicts(&config).unwrap().is_empty());
}

/// Story: a build rewrites a rule's sentences, and the sweep sees no reason to
/// re-check anything - the basis has not moved. The words must never come out
/// of the store, so the file keeps the counts alone and a load reconstructs
/// every sentence from the rules this build ships.
#[test]
fn the_store_keeps_no_sentences_and_a_load_reconstructs_them() {
    let storage = tempfile::tempdir().unwrap();
    let brief = RuleBrief {
        rule: "bin/property-type".to_owned(),
        title: "A title an older build wrote".to_owned(),
        description: "A sentence an older build wrote".to_owned(),
        count: 3,
        fixable: 1,
        mismatches: vec![problems::TypeMismatch {
            expected: "File".to_owned(),
            found: "Hash".to_owned(),
        }],
        unfixable: Some("A why-not an older build wrote".to_owned()),
    };
    let file = VerdictFile {
        verdicts: std::iter::once((
            "id-1".to_owned(),
            ModHealthVerdict {
                mod_id: "id-1".to_owned(),
                health: ModHealth::Repairable,
                fixable: 1,
                counts: Counts::default(),
                rules: vec![brief],
                checked_at: "2026-08-28T10:00:00Z".to_owned(),
                basis: HealthCheckBasis::default(),
            },
        ))
        .collect(),
    };
    file.save(storage.path()).unwrap();

    let written = fs::read_to_string(storage.path().join("mod-health-verdicts.json")).unwrap();
    assert!(!written.contains("older build wrote"), "{written}");
    assert!(!written.contains("title"), "{written}");

    let loaded = VerdictFile::load(storage.path());
    let brief = &loaded.verdicts["id-1"].rules[0];

    let rule = problems::rules::all()
        .into_iter()
        .find(|rule| rule.id().0 == "bin/property-type")
        .unwrap();
    assert_eq!(brief.title, rule.title());
    assert_eq!(brief.description, rule.description());
    assert_eq!(
        brief.unfixable.as_deref(),
        Some(rule.unfixable_description())
    );
    assert_eq!((brief.count, brief.fixable), (3, 1));
}

/// Story: a build adds data the old shape never wrote - the type pairs - and
/// the basis has not moved, so the sweep sees nothing due. A verdict from an
/// older shape has to read as never checked, or its row would draw without
/// the data every newer row has.
#[test]
fn a_file_from_an_older_shape_loads_as_never_checked() {
    let storage = tempfile::tempdir().unwrap();
    fs::write(
        storage.path().join("mod-health-verdicts.json"),
        r#"{
          "version": 0,
          "verdicts": {
            "id-1": {
              "modId": "id-1",
              "health": "repairable",
              "fixable": 1,
              "counts": { "fatals": 3, "errors": 0, "warnings": 0, "infos": 0 },
              "checkedAt": "2026-08-28T10:00:00Z"
            }
          }
        }"#,
    )
    .unwrap();

    assert!(VerdictFile::load(storage.path()).verdicts.is_empty());
}

/// Forgetting a mod nothing remembers writes nothing, so a cancel over a mod
/// the run never got to does not rewrite the whole file.
#[test]
fn forgetting_a_verdict_that_is_not_held_writes_nothing() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    let storage_dir = library.storage_dir(&config).unwrap();

    library.forget_health_check(&storage_dir, "never-checked");

    assert!(!storage_dir.join("mod-health-verdicts.json").exists());
}
