use super::*;
use crate::mods::index::document::load_library_index;
use crate::mods::index::{ModArchiveFormat, ModFault};
use crate::mods::test_support::{
    RecordingEventSink, make_bad_crc_fantome_zip, make_full_fantome_zip, make_library_with_events,
    make_modpkg, make_slugged_entry, make_test_library, mod_project_named, place_installed_mod,
    seed_library,
};
use assert_matches::assert_matches;
use std::sync::Arc;

/// A mod the layout migration moved: a metadata-only directory, the archive
/// beside it, and the entry saying the content is still in there.
fn place_moved_fantome(storage: &Path, slug: &str) {
    let mods_dir = storage.join("mods");
    let mod_dir = mods_dir.join(slug);
    fs::create_dir_all(&mod_dir).unwrap();
    fs::write(
        mod_dir.join("mod.config.json"),
        serde_json::to_string_pretty(&mod_project_named(slug)).unwrap(),
    )
    .unwrap();
    make_full_fantome_zip(&mods_dir.join(format!("{slug}.fantome")));
}

fn archived_entry(id: &str, slug: &str) -> LibraryModEntry {
    LibraryModEntry {
        storage: ModStorage::Archive,
        ..make_slugged_entry(id, slug, ModArchiveFormat::Fantome)
    }
}

fn stored_as(storage_dir: &Path, mod_id: &str) -> ModStorage {
    load_library_index(storage_dir)
        .unwrap()
        .mods
        .iter()
        .find(|m| m.id == mod_id)
        .unwrap()
        .storage
}

#[test]
fn unpacking_writes_the_content_tree_and_keeps_the_archive() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_moved_fantome(storage.path(), "full-mod");
    seed_library(&library, &config, vec![archived_entry("id-1", "full-mod")]);

    let updated = library
        .set_mod_storage(&config, "id-1", ModStorage::Project)
        .unwrap();

    assert_eq!(updated.storage, ModStorage::Project);
    assert!(updated.has_archive);
    assert_eq!(stored_as(storage.path(), "id-1"), ModStorage::Project);

    let mod_dir = storage.path().join("mods").join("full-mod");
    let base = mod_dir.join("content").join("base");
    assert!(base.join("Aatrox.wad.client").is_dir());
    assert!(base.join("Ashe.wad.client").is_dir());
    assert!(base.join("raw").join("assets").is_dir());
    assert!(
        storage
            .path()
            .join("mods")
            .join("full-mod.fantome")
            .is_file()
    );
}

/// The archive names the mod whatever the user has since called it, so a fresh
/// import would quietly undo every rename and category they typed.
#[test]
fn unpacking_keeps_the_metadata_the_user_edited() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_moved_fantome(storage.path(), "full-mod");

    let mod_dir = storage.path().join("mods").join("full-mod");
    let mut project = mod_project_named("full-mod");
    project.display_name = "My Renamed Mod".to_string();
    project.tags = vec![ltk_mod_project::ModTag::from("skin".to_string())];
    project.champions = vec!["Aatrox".to_string()];
    fs::write(
        mod_dir.join("mod.config.json"),
        serde_json::to_string_pretty(&project).unwrap(),
    )
    .unwrap();
    fs::write(mod_dir.join("thumbnail.webp"), b"user thumbnail").unwrap();
    fs::write(mod_dir.join("README.md"), b"how i use it").unwrap();

    seed_library(&library, &config, vec![archived_entry("id-1", "full-mod")]);
    let updated = library
        .set_mod_storage(&config, "id-1", ModStorage::Project)
        .unwrap();

    assert_eq!(updated.display_name, "My Renamed Mod");
    assert_eq!(updated.champions, vec!["Aatrox"]);
    assert_eq!(updated.tags, vec!["skin"]);
    assert_eq!(
        fs::read(mod_dir.join("thumbnail.webp")).unwrap(),
        b"user thumbnail"
    );
    assert_eq!(
        fs::read(mod_dir.join("README.md")).unwrap(),
        b"how i use it"
    );
}

/// The layers an archive declares are what a profile's layer states name, and
/// the importer resets them to a single default one.
#[test]
fn unpacking_keeps_the_layers_the_archive_declares() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());

    let mods_dir = storage.path().join("mods");
    let mod_dir = mods_dir.join("layered-mod");
    fs::create_dir_all(&mod_dir).unwrap();
    fs::write(
        mod_dir.join("mod.config.json"),
        serde_json::to_string_pretty(&mod_project_named("layered-mod")).unwrap(),
    )
    .unwrap();
    crate::mods::test_support::make_layered_fantome_zip(&mods_dir.join("layered-mod.fantome"));

    seed_library(
        &library,
        &config,
        vec![archived_entry("id-1", "layered-mod")],
    );
    library
        .set_mod_storage(&config, "id-1", ModStorage::Project)
        .unwrap();

    let project = load_mod_project(&mod_dir).unwrap();
    let high_res = project
        .layers
        .iter()
        .find(|l| l.name == "high_res")
        .expect("the archive's own layer survives the unpack");
    assert_eq!(
        high_res.string_overrides["en_us"]["game_character_displayname_Ashe"],
        "Frost Archer"
    );
}

/// The bug this guards is not hypothetical: archives written by other tools
/// routinely carry checksums that describe nothing, and a reader that trusts
/// them refuses the whole file.
#[test]
fn unpacking_reads_an_archive_whose_checksums_are_wrong() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());

    let mods_dir = storage.path().join("mods");
    let mod_dir = mods_dir.join("full-mod");
    fs::create_dir_all(&mod_dir).unwrap();
    fs::write(
        mod_dir.join("mod.config.json"),
        serde_json::to_string_pretty(&mod_project_named("full-mod")).unwrap(),
    )
    .unwrap();
    make_bad_crc_fantome_zip(&mods_dir.join("full-mod.fantome"));

    seed_library(&library, &config, vec![archived_entry("id-1", "full-mod")]);
    library
        .set_mod_storage(&config, "id-1", ModStorage::Project)
        .unwrap();

    assert_eq!(
        fs::read(
            mod_dir.join("content/base/Aatrox.wad.client/data/characters/aatrox/skins/skin01.bin")
        )
        .unwrap(),
        b"aatrox skin bytes"
    );
}

/// A conversion that cannot land is refused before the index moves, so the mod
/// still reads out of the archive it was reading out of.
#[test]
fn an_unpack_past_the_path_limit_is_refused_and_leaves_the_mod_alone() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_moved_fantome(storage.path(), "full-mod");
    seed_library(&library, &config, vec![archived_entry("id-1", "full-mod")]);

    let _limit = long_paths::test_limit::just_past(&storage.path().join("mods"), 20);

    assert_matches!(
        library.set_mod_storage(&config, "id-1", ModStorage::Project),
        Err(AppError::ValidationFailed(_))
    );
    assert_eq!(stored_as(storage.path(), "id-1"), ModStorage::Archive);

    let names: Vec<String> = fs::read_dir(storage.path().join("mods"))
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(
        names.len(),
        2,
        "no staging directory outlives it: {names:?}"
    );
}

/// The tree is measured where it will live, not where it is unpacked. A
/// staging directory is a uuid, so measuring one refuses mods that fit under
/// the slug they are about to be renamed onto.
#[test]
fn an_unpack_is_measured_against_the_directory_it_lands_in() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_moved_fantome(storage.path(), "full-mod");
    seed_library(&library, &config, vec![archived_entry("id-1", "full-mod")]);

    let _limit =
        long_paths::test_limit::just_past(&storage.path().join("mods").join("full-mod"), 80);

    assert_matches!(
        library.set_mod_storage(&config, "id-1", ModStorage::Project),
        Ok(_)
    );
    assert_eq!(stored_as(storage.path(), "id-1"), ModStorage::Project);
}

#[test]
fn repacking_drops_the_content_tree_and_keeps_everything_else() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_installed_mod(storage.path(), "full-mod", ModArchiveFormat::Fantome, true);
    seed_library(
        &library,
        &config,
        vec![make_slugged_entry(
            "id-1",
            "full-mod",
            ModArchiveFormat::Fantome,
        )],
    );

    let updated = library
        .set_mod_storage(&config, "id-1", ModStorage::Archive)
        .unwrap();

    assert_eq!(updated.storage, ModStorage::Archive);
    assert_eq!(stored_as(storage.path(), "id-1"), ModStorage::Archive);

    let mod_dir = storage.path().join("mods").join("full-mod");
    assert!(!mod_dir.join("content").exists());
    assert!(mod_dir.join("mod.config.json").is_file());
    assert!(
        storage
            .path()
            .join("mods")
            .join("full-mod.fantome")
            .is_file()
    );
}

/// The archive is the only thing that can hold the content once the tree is
/// gone, so a mod installed with retention off cannot go back.
#[test]
fn repacking_without_an_archive_is_refused() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_installed_mod(storage.path(), "full-mod", ModArchiveFormat::Fantome, false);
    seed_library(
        &library,
        &config,
        vec![make_slugged_entry(
            "id-1",
            "full-mod",
            ModArchiveFormat::Fantome,
        )],
    );

    assert_matches!(
        library.set_mod_storage(&config, "id-1", ModStorage::Archive),
        Err(AppError::ValidationFailed(_))
    );
    assert!(
        storage
            .path()
            .join("mods")
            .join("full-mod")
            .join("content")
            .is_dir()
    );
}

#[test]
fn a_modpkg_has_no_unpacked_form_to_switch_to() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());

    let mods_dir = storage.path().join("mods");
    let mod_dir = mods_dir.join("packed-mod");
    fs::create_dir_all(&mod_dir).unwrap();
    fs::write(
        mod_dir.join("mod.config.json"),
        serde_json::to_string_pretty(&mod_project_named("packed-mod")).unwrap(),
    )
    .unwrap();
    make_modpkg(&mods_dir.join("packed-mod.modpkg"), "packed-mod");

    seed_library(
        &library,
        &config,
        vec![make_slugged_entry(
            "id-1",
            "packed-mod",
            ModArchiveFormat::Modpkg,
        )],
    );

    assert_matches!(
        library.set_mod_storage(&config, "id-1", ModStorage::Project),
        Err(AppError::ValidationFailed(_))
    );
}

#[test]
fn a_faulted_mod_cannot_change_storage() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_moved_fantome(storage.path(), "full-mod");

    let mut entry = archived_entry("id-1", "full-mod");
    entry.fault = Some(ModFault::ConversionFailed {
        error: "boom".to_string(),
        quarantine_dir: "q".to_string(),
    });
    seed_library(&library, &config, vec![entry]);

    assert_matches!(
        library.set_mod_storage(&config, "id-1", ModStorage::Project),
        Err(AppError::ValidationFailed(_))
    );
}

#[test]
fn asking_for_the_storage_a_mod_already_has_leaves_it_alone() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_installed_mod(storage.path(), "full-mod", ModArchiveFormat::Fantome, false);
    seed_library(
        &library,
        &config,
        vec![make_slugged_entry(
            "id-1",
            "full-mod",
            ModArchiveFormat::Fantome,
        )],
    );

    // Retention was off, so the archive check this would otherwise run has
    // nothing to find — reaching it at all is the regression.
    let updated = library
        .set_mod_storage(&config, "id-1", ModStorage::Project)
        .unwrap();

    assert_eq!(updated.storage, ModStorage::Project);
    assert!(
        storage
            .path()
            .join("mods")
            .join("full-mod")
            .join("content")
            .is_dir()
    );
}

#[test]
fn an_unknown_mod_is_reported_as_missing() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    seed_library(&library, &config, Vec::new());

    assert_matches!(
        library.set_mod_storage(&config, "nope", ModStorage::Project),
        Err(AppError::ModNotFound(_))
    );
}

/// A conversion is one rename either way, so nothing it leaves behind should
/// outlive it — a stray staging directory would be adopted as a second mod.
#[test]
fn unpacking_leaves_nothing_beside_the_mod() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_moved_fantome(storage.path(), "full-mod");
    seed_library(&library, &config, vec![archived_entry("id-1", "full-mod")]);

    library
        .set_mod_storage(&config, "id-1", ModStorage::Project)
        .unwrap();

    let names: Vec<String> = fs::read_dir(storage.path().join("mods"))
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(names.len(), 2, "{names:?}");
    assert!(names.contains(&"full-mod".to_string()));
    assert!(names.contains(&"full-mod.fantome".to_string()));
}

/// The stages a conversion reported, with the unit named where it named one.
fn reported(events: &RecordingEventSink) -> Vec<(FantomeImportStage, Option<String>)> {
    events
        .events()
        .into_iter()
        .filter_map(|event| match event {
            BackendEvent::ModStorageProgress(progress) => {
                Some((progress.stage, progress.current_item))
            }
            _ => None,
        })
        .collect()
}

/// Unpacking writes a whole WAD tree and takes seconds, so it has to say so
/// while it runs and say when it stopped.
///
/// The whole sequence is pinned rather than its ends, because the steps that go
/// wrong are the ones that name nothing. The `RAW/` pass is a counted unit of
/// its own, named for the directory rather than for a WAD, and the one step
/// past the extraction is the metadata.
#[test]
fn unpacking_reports_each_unit_then_completes() {
    use FantomeImportStage::{Complete, Extracting, Finalizing};

    let storage = tempfile::tempdir().unwrap();
    let events = Arc::new(RecordingEventSink::default());
    let (library, config) = make_library_with_events(storage.path(), events.clone());
    place_moved_fantome(storage.path(), "full-mod");
    seed_library(&library, &config, vec![archived_entry("id-1", "full-mod")]);

    library
        .set_mod_storage(&config, "id-1", ModStorage::Project)
        .unwrap();

    assert_eq!(
        reported(&events),
        [
            (Extracting, Some("Aatrox.wad.client".to_owned())),
            (Extracting, Some("Ashe.wad.client".to_owned())),
            (Extracting, Some("RAW".to_owned())),
            (Finalizing, None),
            /* After the swap, not when the import finished. */
            (Complete, None),
        ]
    );
}

/// A repack has no WADs to count, and still has to open and close a report or
/// the toast it drives never appears.
#[test]
fn repacking_reports_a_finalizing_step_then_completes() {
    let storage = tempfile::tempdir().unwrap();
    let events = Arc::new(RecordingEventSink::default());
    let (library, config) = make_library_with_events(storage.path(), events.clone());
    place_moved_fantome(storage.path(), "full-mod");
    seed_library(&library, &config, vec![archived_entry("id-1", "full-mod")]);
    library
        .set_mod_storage(&config, "id-1", ModStorage::Project)
        .unwrap();

    let before = reported(&events).len();
    library
        .set_mod_storage(&config, "id-1", ModStorage::Archive)
        .unwrap();

    assert_eq!(
        reported(&events)[before..],
        [
            (FantomeImportStage::Finalizing, None),
            (FantomeImportStage::Complete, None)
        ]
    );
}

/// A mod that cannot convert at all fails through the call, so nothing opens a
/// report that would then have to be closed with an error.
#[test]
fn a_mod_with_no_archive_reports_nothing() {
    let storage = tempfile::tempdir().unwrap();
    let events = Arc::new(RecordingEventSink::default());
    let (library, config) = make_library_with_events(storage.path(), events.clone());
    let mods_dir = storage.path().join("mods");
    fs::create_dir_all(mods_dir.join("no-archive")).unwrap();
    fs::write(
        mods_dir.join("no-archive").join("mod.config.json"),
        serde_json::to_string_pretty(&mod_project_named("no-archive")).unwrap(),
    )
    .unwrap();
    seed_library(
        &library,
        &config,
        vec![archived_entry("id-1", "no-archive")],
    );

    assert!(
        library
            .set_mod_storage(&config, "id-1", ModStorage::Project)
            .is_err()
    );
    assert!(reported(&events).is_empty());
}
