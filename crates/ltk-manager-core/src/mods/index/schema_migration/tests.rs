use super::*;
use fs_err as fs;

fn make_legacy_json_no_folders() -> Value {
    serde_json::json!({
        "mods": [
            { "id": "mod-a", "installedAt": "2026-01-01T00:00:00Z", "format": "modpkg" },
            { "id": "mod-b", "installedAt": "2026-01-01T00:00:00Z", "format": "modpkg" }
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
    })
}

fn make_legacy_json_with_folders() -> Value {
    serde_json::json!({
        "mods": [
            { "id": "mod-a", "installedAt": "2026-01-01T00:00:00Z", "format": "modpkg" }
        ],
        "profiles": [{
            "id": "p1",
            "name": "Default",
            "slug": "default",
            "modOrder": ["mod-a"],
            "enabledMods": ["mod-a"],
            "layerStates": {},
            "createdAt": "2026-01-01T00:00:00Z",
            "lastUsed": "2026-01-01T00:00:00Z"
        }],
        "activeProfileId": "p1",
        "folders": [{
            "id": "root",
            "name": "",
            "modIds": ["mod-a"]
        }],
        "folderOrder": ["root"]
    })
}

fn make_current_version_json() -> Value {
    let mut json = make_legacy_json_with_folders();
    json.as_object_mut()
        .unwrap()
        .insert("version".to_string(), Value::Number(CURRENT_VERSION.into()));
    json
}

#[test]
fn extract_version_missing_field_returns_zero() {
    let json = make_legacy_json_no_folders();
    assert_eq!(LibraryIndex::extract_version(&json), 0);
}

#[test]
fn extract_version_present_field() {
    let json = make_current_version_json();
    assert_eq!(LibraryIndex::extract_version(&json), CURRENT_VERSION);
}

#[test]
fn migrate_v0_to_v1_creates_root_folder_and_assigns_mods() {
    let json = make_legacy_json_no_folders();
    let result = LibraryIndex::migrate_v0_to_v1(json).unwrap();

    let folders = result["folders"].as_array().unwrap();
    let root = folders.iter().find(|f| f["id"] == ROOT_FOLDER_ID).unwrap();
    let mod_ids: Vec<&str> = root["modIds"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(mod_ids, vec!["mod-a", "mod-b"]);

    let folder_order: Vec<&str> = result["folderOrder"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert!(folder_order.contains(&ROOT_FOLDER_ID));

    assert_eq!(result["version"], 1);
}

#[test]
fn migrate_v0_to_v1_with_existing_folders_preserves_them() {
    let json = make_legacy_json_with_folders();
    let result = LibraryIndex::migrate_v0_to_v1(json).unwrap();

    let folders = result["folders"].as_array().unwrap();
    assert_eq!(folders.len(), 1);
    assert_eq!(folders[0]["id"], ROOT_FOLDER_ID);
    assert_eq!(result["version"], 1);
}

#[test]
fn migrate_v0_to_v1_result_deserializes_into_library_index() {
    let json = make_legacy_json_no_folders();
    let migrated = LibraryIndex::migrate_v0_to_v1(json).unwrap();
    let index: LibraryIndex = serde_json::from_value(migrated).unwrap();

    assert_eq!(index.version, 1);
    assert_eq!(index.mods.len(), 2);
    assert_eq!(index.profiles.len(), 1);
    assert!(index.folders.iter().any(|f| f.id == ROOT_FOLDER_ID));
}

#[test]
fn load_and_migrate_current_version_no_migration() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("library.json");
    let json = make_current_version_json();
    fs::write(&path, serde_json::to_string_pretty(&json).unwrap()).unwrap();

    let index = LibraryIndex::load_and_migrate(dir.path()).unwrap();
    assert_eq!(index.version, CURRENT_VERSION);

    let backup = dir
        .path()
        .join(format!("library.v{}.json.bak", CURRENT_VERSION));
    assert!(!backup.exists());
}

#[test]
fn load_and_migrate_v0_creates_backup_and_migrates() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("library.json");
    let json = make_legacy_json_no_folders();
    let original_content = serde_json::to_string_pretty(&json).unwrap();
    fs::write(&path, &original_content).unwrap();

    let index = LibraryIndex::load_and_migrate(dir.path()).unwrap();
    assert_eq!(index.version, CURRENT_VERSION);
    assert!(index.folders.iter().any(|f| f.id == ROOT_FOLDER_ID));

    let backup = dir.path().join("library.v0.json.bak");
    assert!(backup.exists());
    assert_eq!(fs::read_to_string(&backup).unwrap(), original_content);
}

#[test]
fn load_and_migrate_rejects_future_version() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("library.json");
    let mut json = make_current_version_json();
    json.as_object_mut()
        .unwrap()
        .insert("version".to_string(), Value::Number(99.into()));
    fs::write(&path, serde_json::to_string_pretty(&json).unwrap()).unwrap();

    let result = LibraryIndex::load_and_migrate(dir.path());
    assert!(result.is_err());
    match result.unwrap_err() {
        AppError::SchemaVersionTooNew {
            file_version,
            max_supported,
        } => {
            assert_eq!(file_version, 99);
            assert_eq!(max_supported, CURRENT_VERSION);
        }
        other => panic!("Expected SchemaVersionTooNew, got: {:?}", other),
    }

    let backup = dir.path().join("library.v99.json.bak");
    assert!(!backup.exists());
}

#[test]
fn load_and_migrate_v0_with_folders_preserves_data() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("library.json");
    let json = make_legacy_json_with_folders();
    fs::write(&path, serde_json::to_string_pretty(&json).unwrap()).unwrap();

    let index = LibraryIndex::load_and_migrate(dir.path()).unwrap();
    assert_eq!(index.version, CURRENT_VERSION);
    assert_eq!(index.mods.len(), 1);
    assert_eq!(index.folders.len(), 1);
    assert_eq!(index.folders[0].id, ROOT_FOLDER_ID);
    assert_eq!(index.folders[0].mod_ids, vec!["mod-a"]);
}

/// Every v1 entry reads its content out of `archives/` until the layout
/// migration moves it, whatever format it came from.
#[test]
fn migrate_v1_to_v2_records_every_mod_as_archive_stored() {
    let mut json = make_legacy_json_with_folders();
    json.as_object_mut()
        .unwrap()
        .insert("version".to_string(), Value::Number(1.into()));
    let before = json.clone();

    let result = LibraryIndex::migrate_v1_to_v2(json).unwrap();
    assert_eq!(result["version"], 2);
    assert_eq!(result["mods"][0]["storage"], "archive");
    assert_eq!(result["mods"][0]["id"], before["mods"][0]["id"]);
    assert_eq!(result["folders"], before["folders"]);
    assert_eq!(result["profiles"], before["profiles"]);
}

/// Every v1 entry comes out of the migration still in the uuid layout, which is
/// what tells the app the layout migration has not run.
#[test]
fn a_migrated_v1_index_reports_every_mod_as_pending() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("library.json");
    let mut json = make_legacy_json_with_folders();
    json.as_object_mut()
        .unwrap()
        .insert("version".to_string(), Value::Number(1.into()));
    fs::write(&path, serde_json::to_string_pretty(&json).unwrap()).unwrap();

    let index = LibraryIndex::load_and_migrate(dir.path()).unwrap();
    assert_eq!(index.version, 2);
    assert!(index.mods.iter().all(|m| m.slug.is_none()));
    assert!(dir.path().join("library.v1.json.bak").exists());
}

/// A v0 file chains through both migrations in one load.
#[test]
fn load_and_migrate_chains_v0_through_v2() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("library.json");
    fs::write(
        &path,
        serde_json::to_string_pretty(&make_legacy_json_no_folders()).unwrap(),
    )
    .unwrap();

    let index = LibraryIndex::load_and_migrate(dir.path()).unwrap();
    assert_eq!(index.version, 2);
    assert!(index.folders.iter().any(|f| f.id == ROOT_FOLDER_ID));
    assert_eq!(index.mods.len(), 2);
    assert!(dir.path().join("library.v0.json.bak").exists());
}
