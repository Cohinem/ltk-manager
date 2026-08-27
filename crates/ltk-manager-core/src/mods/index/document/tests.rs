use super::*;
use crate::mods::test_support::{
    make_slugged_entry, make_test_entry, place_installed_mod, place_mod_files,
};

#[test]
fn library_index_default_has_one_profile() {
    let index = LibraryIndex::default();
    assert_eq!(index.profiles.len(), 1);
    assert_eq!(index.profiles[0].name, "Default");
    assert_eq!(index.profiles[0].slug.as_str(), "default");
    assert_eq!(index.active_profile_id, index.profiles[0].id);
    assert!(index.mods.is_empty());
}

#[test]
fn library_index_save_and_load_round_trip() {
    let dir = tempfile::tempdir().unwrap();
    let index = LibraryIndex::default();
    save_library_index(dir.path(), &index).unwrap();
    let loaded = load_library_index(dir.path()).unwrap();
    assert_eq!(loaded.profiles.len(), 1);
    assert_eq!(loaded.profiles[0].name, "Default");
    assert_eq!(loaded.active_profile_id, loaded.profiles[0].id);
}

#[test]
fn load_library_index_returns_default_when_no_file() {
    let dir = tempfile::tempdir().unwrap();
    let index = load_library_index(dir.path()).unwrap();
    assert_eq!(index.profiles.len(), 1);
    assert_eq!(index.profiles[0].name, "Default");
}

#[test]
fn get_active_profile_finds_profile() {
    let index = LibraryIndex::default();
    let profile = get_active_profile(&index).unwrap();
    assert_eq!(profile.name, "Default");
}

#[test]
fn get_active_profile_returns_error_when_missing() {
    let index = LibraryIndex {
        version: 0,
        mods: Vec::new(),
        profiles: Vec::new(),
        active_profile_id: "nonexistent".to_string(),
        folders: vec![LibraryFolder {
            id: ROOT_FOLDER_ID.to_string(),
            name: String::new(),
            mod_ids: Vec::new(),
        }],
        folder_order: vec![ROOT_FOLDER_ID.to_string()],
    };
    assert!(get_active_profile(&index).is_err());
}

#[test]
fn resolve_profile_dirs_produces_correct_paths() {
    let storage_dir = Path::new("/storage");
    let slug = ProfileSlug("my-profile".to_string());
    let (overlay_dir, cache_dir) = resolve_profile_dirs(storage_dir, &slug);
    assert!(overlay_dir.ends_with("profiles/my-profile/overlay"));
    assert!(cache_dir.ends_with("profiles/my-profile/cache"));
}

#[test]
fn get_profile_by_id_not_found() {
    let index = LibraryIndex::default();
    assert!(get_profile_by_id(&index, "nonexistent-id").is_err());
}

#[test]
fn load_library_index_migrates_legacy_without_folders() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("library.json");

    // Write a legacy JSON without folders or folder_order fields
    let legacy_json = serde_json::json!({
        "mods": [
            {
                "id": "mod-a",
                "installedAt": "2026-01-01T00:00:00Z",
                "format": "modpkg"
            },
            {
                "id": "mod-b",
                "installedAt": "2026-01-01T00:00:00Z",
                "format": "modpkg"
            }
        ],
        "profiles": [{
            "id": "p1",
            "name": "Default",
            "slug": "default",
            "modOrder": ["mod-a", "mod-b"],
            "enabledMods": ["mod-a"],
            "layerStates": {},
            "createdAt": "2026-01-01T00:00:00Z",
            "lastUsed": "2026-01-01T00:00:00Z"
        }],
        "activeProfileId": "p1"
    });
    fs::write(&path, serde_json::to_string_pretty(&legacy_json).unwrap()).unwrap();

    let index = load_library_index(dir.path()).unwrap();

    // Root folder should exist with all mods
    let root = index.folders.iter().find(|f| f.id == ROOT_FOLDER_ID);
    assert!(
        root.is_some(),
        "Root folder should be created during migration"
    );
    let root = root.unwrap();
    assert_eq!(root.mod_ids, vec!["mod-a", "mod-b"]);

    // folder_order should contain root
    assert_eq!(index.folder_order, vec![ROOT_FOLDER_ID]);
}

#[test]
fn mod_archive_format_extension() {
    assert_eq!(ModArchiveFormat::Fantome.extension(), "fantome");
    assert_eq!(ModArchiveFormat::Modpkg.extension(), "modpkg");
}

#[test]
fn mod_archive_format_from_extension() {
    assert_eq!(
        ModArchiveFormat::from_extension("modpkg"),
        Some(ModArchiveFormat::Modpkg)
    );
    assert_eq!(
        ModArchiveFormat::from_extension("FANTOME"),
        Some(ModArchiveFormat::Fantome)
    );
    assert_eq!(
        ModArchiveFormat::from_extension("zip"),
        Some(ModArchiveFormat::Fantome)
    );
    assert_eq!(ModArchiveFormat::from_extension("rar"), None);
}

#[test]
fn a_legacy_entry_points_at_the_uuid_layout() {
    let storage_dir = Path::new("/storage");
    let entry = make_test_entry("abc-123", ModArchiveFormat::Fantome);

    assert!(entry.mod_dir(storage_dir).ends_with("mods/abc-123"));
    assert!(
        entry
            .archive_path(storage_dir)
            .ends_with("archives/abc-123.fantome")
    );
}

#[test]
fn a_slugged_entry_keeps_its_archive_beside_the_mod() {
    let storage_dir = Path::new("/storage");
    let entry = make_slugged_entry("abc-123", "cool-skin", ModArchiveFormat::Modpkg);

    assert!(entry.mod_dir(storage_dir).ends_with("mods/cool-skin"));
    assert!(
        entry
            .archive_path(storage_dir)
            .ends_with("mods/cool-skin.modpkg")
    );
    assert!(
        entry
            .quarantine_dir(storage_dir)
            .ends_with("quarantine/abc-123")
    );
}

/// A modpkg is packed by design, and a legacy entry is packed by circumstance:
/// its content is still in `archives/` whatever format it came from.
#[test]
fn a_modpkg_and_anything_pre_migration_read_as_packed() {
    assert!(make_slugged_entry("a", "a", ModArchiveFormat::Modpkg).is_packed());
    assert!(!make_slugged_entry("a", "a", ModArchiveFormat::Fantome).is_packed());
    assert!(!make_slugged_entry("a", "a", ModArchiveFormat::Unknown).is_packed());

    assert!(make_test_entry("a", ModArchiveFormat::Modpkg).is_packed());
    assert!(make_test_entry("a", ModArchiveFormat::Fantome).is_packed());
}

/// The pre-slug layout left `mods/<uuid>/` holding metadata and nothing else,
/// so an entry whose archive is gone has no content anywhere.
#[test]
fn a_legacy_fantome_needs_its_archive_to_be_present() {
    let storage = tempfile::tempdir().unwrap();
    place_mod_files(storage.path(), "id-1", ModArchiveFormat::Fantome);

    let entry = make_test_entry("id-1", ModArchiveFormat::Fantome);
    assert!(entry.is_present(storage.path()));

    fs::remove_file(entry.archive_path(storage.path())).unwrap();
    assert!(!entry.is_present(storage.path()));
}

/// A fantome installed with archive retention off has no archive, and is still
/// perfectly readable — its content is the directory.
#[test]
fn an_unpacked_mod_is_present_without_an_archive() {
    let storage = tempfile::tempdir().unwrap();
    place_installed_mod(
        storage.path(),
        "cool-skin",
        ModArchiveFormat::Fantome,
        false,
    );

    let entry = make_slugged_entry("id-1", "cool-skin", ModArchiveFormat::Fantome);
    assert!(entry.is_present(storage.path()));
}

/// A modpkg's content never leaves its archive, so losing it loses the mod.
#[test]
fn a_packed_mod_needs_its_archive_to_be_present() {
    let storage = tempfile::tempdir().unwrap();
    place_installed_mod(storage.path(), "cool-skin", ModArchiveFormat::Modpkg, false);

    let entry = make_slugged_entry("id-1", "cool-skin", ModArchiveFormat::Modpkg);
    assert!(!entry.is_present(storage.path()));

    fs::write(entry.archive_path(storage.path()), b"fake").unwrap();
    assert!(entry.is_present(storage.path()));
}

#[test]
fn a_legacy_entry_is_present_while_its_uuid_layout_is() {
    let storage = tempfile::tempdir().unwrap();
    place_mod_files(storage.path(), "id-1", ModArchiveFormat::Modpkg);

    let entry = make_test_entry("id-1", ModArchiveFormat::Modpkg);
    assert!(entry.is_present(storage.path()));

    fs::remove_file(entry.archive_path(storage.path())).unwrap();
    assert!(!entry.is_present(storage.path()));
}

/// A faulted mod has no directory left — only what quarantine holds — and the
/// library still has to show it so the user can act on it.
#[test]
fn a_faulted_entry_is_present_while_its_quarantine_is() {
    let storage = tempfile::tempdir().unwrap();
    let mut entry = make_test_entry("id-1", ModArchiveFormat::Fantome);
    entry.fault = Some(ModFault::ConversionFailed {
        error: "boom".to_string(),
        quarantine_dir: String::new(),
    });

    assert!(!entry.is_present(storage.path()));

    fs::create_dir_all(entry.quarantine_dir(storage.path())).unwrap();
    assert!(entry.is_present(storage.path()));
}
