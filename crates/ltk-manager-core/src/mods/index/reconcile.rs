//! Bringing the index back in line with what is actually on disk.
//!
//! The index and the filesystem drift apart whenever something happens outside
//! the app: a user deletes an archive, drops one into `archives/` by hand, or
//! replaces one in place. Reconciliation runs on startup and on watcher wakeups
//! to repair that drift.

use crate::mods::archive::{install, metadata};
use crate::mods::index::{LibraryIndex, ModArchiveFormat};
use crate::mods::organize::folders;
use std::fs;
use std::path::{Path, PathBuf};

/// Reconcile the library index against the filesystem.
///
/// 1. Remove orphaned mod entries (missing files on disk)
/// 2. Sync profile mod_order lists with the valid mod set
/// 3. Discover and register unrecognised archives
/// 4. Re-extract metadata when an archive is newer than its cached config
///
/// Returns `true` if changes were made.
pub(crate) fn reconcile_library_index(
    storage_dir: &Path,
    index: &mut LibraryIndex,
    refreshed_ids: &mut Vec<String>,
) -> bool {
    let mut changed = false;
    changed |= remove_orphaned_entries(storage_dir, index);
    changed |= sync_profile_mod_orders(index);
    changed |= discover_new_archives(storage_dir, index);
    changed |= refresh_stale_metadata(storage_dir, index, refreshed_ids);
    changed
}

/// Remove mod entries whose metadata or archive files no longer exist on disk
/// and clean up stale references in all profiles.
fn remove_orphaned_entries(storage_dir: &Path, index: &mut LibraryIndex) -> bool {
    let orphaned_ids: Vec<String> = index
        .mods
        .iter()
        .filter(|entry| {
            let metadata_ok = entry
                .metadata_dir(storage_dir)
                .join("mod.config.json")
                .exists();
            let archive_ok = entry.archive_path(storage_dir).exists();
            !metadata_ok || !archive_ok
        })
        .map(|entry| entry.id.clone())
        .collect();

    if orphaned_ids.is_empty() {
        return false;
    }

    let orphaned_set: std::collections::HashSet<&str> =
        orphaned_ids.iter().map(|s| s.as_str()).collect();

    for id in &orphaned_ids {
        tracing::warn!(
            "Removing orphaned mod entry {} (files missing from disk)",
            id
        );
    }

    index.mods.retain(|m| !orphaned_set.contains(m.id.as_str()));

    for profile in &mut index.profiles {
        profile
            .mod_order
            .retain(|id| !orphaned_set.contains(id.as_str()));
        profile
            .enabled_mods
            .retain(|id| !orphaned_set.contains(id.as_str()));
        profile
            .layer_states
            .retain(|id, _| !orphaned_set.contains(id.as_str()));
    }

    tracing::info!(
        "Reconciled library index: removed {} orphaned mod entries",
        orphaned_ids.len()
    );
    true
}

/// Ensure all profiles contain all valid mods in their `mod_order` and
/// that `item_order` + folders are consistent with the mod set.
fn sync_profile_mod_orders(index: &mut LibraryIndex) -> bool {
    let mut changed = false;

    // Sync folders and folder_order with valid mods
    changed |= folders::sync_folders(index);

    // Derive flat mod order from folder_order + folder contents
    let flat = folders::flatten_folder_order(index);
    let valid_ids: std::collections::HashSet<&str> =
        index.mods.iter().map(|m| m.id.as_str()).collect();

    for profile in &mut index.profiles {
        let before = profile.mod_order.len() + profile.enabled_mods.len();
        profile
            .enabled_mods
            .retain(|id| valid_ids.contains(id.as_str()));

        // Replace mod_order with the flattened item_order
        if profile.mod_order != flat {
            profile.mod_order = flat.clone();
            changed = true;
        }

        // Re-derive enabled_mods order from the new flat order
        let enabled_set: std::collections::HashSet<&str> =
            profile.enabled_mods.iter().map(|s| s.as_str()).collect();
        let new_enabled: Vec<String> = flat
            .iter()
            .filter(|id| enabled_set.contains(id.as_str()))
            .cloned()
            .collect();
        if profile.enabled_mods != new_enabled {
            profile.enabled_mods = new_enabled;
        }

        if profile.mod_order.len() + profile.enabled_mods.len() != before {
            changed = true;
        }
    }

    changed
}

/// Scan `archives/` for mod files not registered in the index and install them.
fn discover_new_archives(storage_dir: &Path, index: &mut LibraryIndex) -> bool {
    let archives_dir = storage_dir.join("archives");
    if !archives_dir.is_dir() {
        return false;
    }

    let known_ids: std::collections::HashSet<&str> =
        index.mods.iter().map(|m| m.id.as_str()).collect();

    let unknown_archives: Vec<PathBuf> = fs::read_dir(&archives_dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ModArchiveFormat::from_extension(ext).is_some())
        })
        .filter(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .is_none_or(|stem| !known_ids.contains(stem))
        })
        .collect();

    let mut changed = false;
    for path in unknown_archives {
        let path_str = path.display().to_string();
        match install::install_single_mod_to_index(storage_dir, index, &path_str) {
            Ok((_entry, installed)) => {
                tracing::info!(
                    "Discovered and registered archive: {} as {}",
                    path.display(),
                    installed.id
                );
                if let Err(e) = fs::remove_file(&path) {
                    tracing::warn!(
                        "Failed to delete original archive {}: {}",
                        path.display(),
                        e
                    );
                }
                changed = true;
            }
            Err(e) => {
                tracing::warn!("Skipping invalid archive {}: {}", path.display(), e);
                cleanup_failed_discovery(&path, storage_dir);
            }
        }
    }

    changed
}

/// Remove a corrupt/invalid archive that failed discovery so it doesn't
/// get retried on every subsequent reconciliation cycle.
fn cleanup_failed_discovery(original_path: &Path, storage_dir: &Path) {
    if let Err(e) = fs::remove_file(original_path) {
        tracing::warn!(
            "Failed to remove invalid archive {}: {}",
            original_path.display(),
            e
        );
    }

    let archives_dir = storage_dir.join("archives");
    let mods_dir = storage_dir.join("mods");

    // Clean up any partial artifacts left by the failed install (UUID-named copies).
    // install_single_mod_to_index copies the archive to {uuid}.{ext} and creates mods/{uuid}/
    // before it can fail during metadata extraction.
    if let Ok(entries) = fs::read_dir(&archives_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            let is_archive = p
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ModArchiveFormat::from_extension(ext).is_some());
            if !is_archive {
                continue;
            }
            if let Some(stem) = p.file_stem().and_then(|s| s.to_str()) {
                let metadata_dir = mods_dir.join(stem);
                let config_path = metadata_dir.join("mod.config.json");
                if metadata_dir.is_dir() && !config_path.exists() {
                    tracing::info!("Cleaning up partial install artifacts for {}", stem);
                    let _ = fs::remove_file(&p);
                    let _ = fs::remove_dir_all(&metadata_dir);
                }
            }
        }
    }
}

/// Re-extract metadata for mods whose archive is newer than the cached `mod.config.json`.
/// Also collects the ids of mods whose archive changed, so the caller can flag
/// any cached WAD reports as stale.
fn refresh_stale_metadata(
    storage_dir: &Path,
    index: &LibraryIndex,
    refreshed_ids: &mut Vec<String>,
) -> bool {
    let mut changed = false;

    for entry in &index.mods {
        let archive_path = entry.archive_path(storage_dir);
        let config_path = entry.metadata_dir(storage_dir).join("mod.config.json");

        let archive_mtime = match fs::metadata(&archive_path).and_then(|m| m.modified()) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let config_mtime = match fs::metadata(&config_path).and_then(|m| m.modified()) {
            Ok(t) => t,
            Err(_) => continue,
        };

        if archive_mtime > config_mtime {
            let metadata_dir = entry.metadata_dir(storage_dir);
            let result = match entry.format {
                ModArchiveFormat::Fantome => {
                    metadata::extract_fantome_metadata(&archive_path, &metadata_dir)
                }
                ModArchiveFormat::Modpkg => {
                    metadata::extract_modpkg_metadata(&archive_path, &metadata_dir)
                }
            };

            match result {
                Ok(()) => {
                    tracing::info!("Re-extracted stale metadata for mod {}", entry.id);
                    refreshed_ids.push(entry.id.clone());
                    changed = true;
                }
                Err(e) => {
                    tracing::warn!("Failed to re-extract metadata for mod {}: {}", entry.id, e);
                }
            }
        }
    }

    changed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mods::index::document::{load_library_index, save_library_index};
    use crate::mods::test_support::{
        make_fantome_zip, make_test_entry, make_test_profile, place_mod_files,
    };
    use crate::mods::types::{LibraryFolder, ROOT_FOLDER_ID};

    #[test]
    fn reconcile_no_changes_returns_false() {
        let dir = tempfile::tempdir().unwrap();
        let entry = make_test_entry("mod-a", ModArchiveFormat::Modpkg);
        place_mod_files(dir.path(), "mod-a", ModArchiveFormat::Modpkg);

        let mut index = LibraryIndex {
            version: 0,
            mods: vec![entry],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["mod-a"],
                vec!["mod-a"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["mod-a".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(!reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert_eq!(index.mods.len(), 1);
        assert_eq!(index.profiles[0].mod_order, vec!["mod-a"]);
        assert_eq!(index.profiles[0].enabled_mods, vec!["mod-a"]);
    }

    #[test]
    fn reconcile_removes_orphaned_mod_missing_archive() {
        let dir = tempfile::tempdir().unwrap();
        let entry = make_test_entry("mod-a", ModArchiveFormat::Modpkg);

        // Only place metadata, no archive
        let meta_dir = dir.path().join("mods").join("mod-a");
        fs::create_dir_all(&meta_dir).unwrap();
        fs::write(meta_dir.join("mod.config.json"), "{}").unwrap();

        let mut index = LibraryIndex {
            version: 0,
            mods: vec![entry],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["mod-a"],
                vec!["mod-a"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["mod-a".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert!(index.mods.is_empty());
        assert!(index.profiles[0].mod_order.is_empty());
        assert!(index.profiles[0].enabled_mods.is_empty());
    }

    #[test]
    fn reconcile_removes_orphaned_mod_missing_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let entry = make_test_entry("mod-a", ModArchiveFormat::Modpkg);

        // Only place archive, no metadata
        let archive_dir = dir.path().join("archives");
        fs::create_dir_all(&archive_dir).unwrap();
        fs::write(archive_dir.join("mod-a.modpkg"), b"fake").unwrap();

        let mut index = LibraryIndex {
            version: 0,
            mods: vec![entry],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["mod-a"],
                vec!["mod-a"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["mod-a".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert!(index.mods.is_empty());
    }

    #[test]
    fn reconcile_removes_orphaned_mod_missing_both() {
        let dir = tempfile::tempdir().unwrap();

        let mut index = LibraryIndex {
            version: 0,
            mods: vec![make_test_entry("ghost", ModArchiveFormat::Fantome)],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["ghost"],
                vec!["ghost"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["ghost".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert!(index.mods.is_empty());
        assert!(index.profiles[0].mod_order.is_empty());
        assert!(index.profiles[0].enabled_mods.is_empty());
    }

    #[test]
    fn reconcile_keeps_valid_mods_removes_orphans() {
        let dir = tempfile::tempdir().unwrap();
        place_mod_files(dir.path(), "valid", ModArchiveFormat::Modpkg);
        // "orphan" has no files on disk

        let mut index = LibraryIndex {
            version: 0,
            mods: vec![
                make_test_entry("valid", ModArchiveFormat::Modpkg),
                make_test_entry("orphan", ModArchiveFormat::Modpkg),
            ],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["valid", "orphan"],
                vec!["valid", "orphan"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["valid".to_string(), "orphan".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert_eq!(index.mods.len(), 1);
        assert_eq!(index.mods[0].id, "valid");
        assert_eq!(index.profiles[0].mod_order, vec!["valid"]);
        assert_eq!(index.profiles[0].enabled_mods, vec!["valid"]);
    }

    #[test]
    fn reconcile_cleans_multiple_orphans() {
        let dir = tempfile::tempdir().unwrap();

        let mut index = LibraryIndex {
            version: 0,
            mods: vec![
                make_test_entry("ghost-1", ModArchiveFormat::Modpkg),
                make_test_entry("ghost-2", ModArchiveFormat::Fantome),
                make_test_entry("ghost-3", ModArchiveFormat::Modpkg),
            ],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["ghost-1", "ghost-2", "ghost-3"],
                vec!["ghost-1"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec![
                    "ghost-1".to_string(),
                    "ghost-2".to_string(),
                    "ghost-3".to_string(),
                ],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert!(index.mods.is_empty());
        assert!(index.profiles[0].mod_order.is_empty());
        assert!(index.profiles[0].enabled_mods.is_empty());
    }

    #[test]
    fn reconcile_adds_missing_mods_to_profile_mod_order() {
        let dir = tempfile::tempdir().unwrap();
        place_mod_files(dir.path(), "mod-a", ModArchiveFormat::Modpkg);
        place_mod_files(dir.path(), "mod-b", ModArchiveFormat::Modpkg);

        // Profile only knows about mod-a, but mod-b exists in index
        let mut index = LibraryIndex {
            version: 0,
            mods: vec![
                make_test_entry("mod-a", ModArchiveFormat::Modpkg),
                make_test_entry("mod-b", ModArchiveFormat::Modpkg),
            ],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["mod-a"],
                vec!["mod-a"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["mod-a".to_string(), "mod-b".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert_eq!(index.profiles[0].mod_order, vec!["mod-a", "mod-b"]);
        // enabled_mods should be unchanged — missing mods are added disabled
        assert_eq!(index.profiles[0].enabled_mods, vec!["mod-a"]);
    }

    #[test]
    fn reconcile_adds_missing_mods_to_multiple_profiles() {
        let dir = tempfile::tempdir().unwrap();
        place_mod_files(dir.path(), "mod-a", ModArchiveFormat::Modpkg);
        place_mod_files(dir.path(), "mod-b", ModArchiveFormat::Fantome);

        let mut index = LibraryIndex {
            version: 0,
            mods: vec![
                make_test_entry("mod-a", ModArchiveFormat::Modpkg),
                make_test_entry("mod-b", ModArchiveFormat::Fantome),
            ],
            profiles: vec![
                make_test_profile("p1", "Default", vec!["mod-a"], vec![]),
                make_test_profile("p2", "Ranked", vec!["mod-b"], vec!["mod-b"]),
            ],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["mod-a".to_string(), "mod-b".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert_eq!(index.profiles[0].mod_order, vec!["mod-a", "mod-b"]);
        assert_eq!(index.profiles[1].mod_order, vec!["mod-a", "mod-b"]);
    }

    #[test]
    fn reconcile_removes_stale_profile_references() {
        let dir = tempfile::tempdir().unwrap();
        place_mod_files(dir.path(), "mod-a", ModArchiveFormat::Modpkg);

        // Profile references "deleted-mod" which isn't in index.mods at all
        let mut index = LibraryIndex {
            version: 0,
            mods: vec![make_test_entry("mod-a", ModArchiveFormat::Modpkg)],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["mod-a", "deleted-mod"],
                vec!["mod-a", "deleted-mod"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["mod-a".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert_eq!(index.profiles[0].mod_order, vec!["mod-a"]);
        assert_eq!(index.profiles[0].enabled_mods, vec!["mod-a"]);
    }

    #[test]
    fn reconcile_handles_orphan_removal_and_missing_mod_order_together() {
        let dir = tempfile::tempdir().unwrap();
        place_mod_files(dir.path(), "mod-a", ModArchiveFormat::Modpkg);
        place_mod_files(dir.path(), "mod-b", ModArchiveFormat::Modpkg);
        // "orphan" has no files

        // Profile 1 has orphan + mod-a, missing mod-b
        // Profile 2 has only orphan
        let mut index = LibraryIndex {
            version: 0,
            mods: vec![
                make_test_entry("mod-a", ModArchiveFormat::Modpkg),
                make_test_entry("mod-b", ModArchiveFormat::Modpkg),
                make_test_entry("orphan", ModArchiveFormat::Fantome),
            ],
            profiles: vec![
                make_test_profile("p1", "Default", vec!["orphan", "mod-a"], vec!["orphan"]),
                make_test_profile("p2", "Ranked", vec!["orphan"], vec!["orphan"]),
            ],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec![
                    "mod-a".to_string(),
                    "mod-b".to_string(),
                    "orphan".to_string(),
                ],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert_eq!(index.mods.len(), 2);

        // Profile 1: orphan removed, mod-b added
        assert_eq!(index.profiles[0].mod_order, vec!["mod-a", "mod-b"]);
        assert!(index.profiles[0].enabled_mods.is_empty());

        // Profile 2: orphan removed, both mods added
        assert_eq!(index.profiles[1].mod_order, vec!["mod-a", "mod-b"]);
        assert!(index.profiles[1].enabled_mods.is_empty());
    }

    #[test]
    fn reconcile_empty_index_returns_false() {
        let dir = tempfile::tempdir().unwrap();
        let mut index = LibraryIndex {
            version: 0,
            mods: Vec::new(),
            profiles: vec![make_test_profile("p1", "Default", vec![], vec![])],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: Vec::new(),
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(!reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
    }

    #[test]
    fn load_library_index_reconciles_orphaned_entries() {
        let dir = tempfile::tempdir().unwrap();

        // Save an index with a mod that has no files on disk
        let index = LibraryIndex {
            version: 0,
            mods: vec![make_test_entry("ghost", ModArchiveFormat::Modpkg)],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["ghost"],
                vec!["ghost"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["ghost".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };
        save_library_index(dir.path(), &index).unwrap();

        let mut loaded = load_library_index(dir.path()).unwrap();
        let reconciled = reconcile_library_index(dir.path(), &mut loaded, &mut Vec::new());
        assert!(reconciled);
        assert!(loaded.mods.is_empty());
        assert!(loaded.profiles[0].mod_order.is_empty());
        assert!(loaded.profiles[0].enabled_mods.is_empty());
    }

    #[test]
    fn reconcile_discovers_unregistered_archive() {
        let dir = tempfile::tempdir().unwrap();
        let archives_dir = dir.path().join("archives");
        fs::create_dir_all(&archives_dir).unwrap();

        make_fantome_zip(&archives_dir.join("cool-skin.fantome"));

        let mut index = LibraryIndex {
            version: 0,
            mods: Vec::new(),
            profiles: vec![make_test_profile("p1", "Default", vec![], vec![])],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: Vec::new(),
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert_eq!(index.mods.len(), 1);
        assert_eq!(index.mods[0].format, ModArchiveFormat::Fantome);
        assert_eq!(index.profiles[0].mod_order.len(), 1);
        assert_eq!(index.profiles[0].enabled_mods.len(), 1);
        // Original file should be deleted
        assert!(!archives_dir.join("cool-skin.fantome").exists());
        // UUID-named file should exist
        let uuid_archive = index.mods[0].archive_path(dir.path());
        assert!(uuid_archive.exists());
    }

    #[test]
    fn reconcile_skips_known_archive_stems() {
        let dir = tempfile::tempdir().unwrap();
        place_mod_files(dir.path(), "mod-a", ModArchiveFormat::Fantome);

        let mut index = LibraryIndex {
            version: 0,
            mods: vec![make_test_entry("mod-a", ModArchiveFormat::Fantome)],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["mod-a"],
                vec!["mod-a"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["mod-a".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(!reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert_eq!(index.mods.len(), 1);
    }

    #[test]
    fn reconcile_skips_corrupt_archive() {
        let dir = tempfile::tempdir().unwrap();
        let archives_dir = dir.path().join("archives");
        fs::create_dir_all(&archives_dir).unwrap();

        // Write invalid data with .fantome extension
        fs::write(archives_dir.join("corrupt.fantome"), b"not a zip").unwrap();

        let mut index = LibraryIndex {
            version: 0,
            mods: Vec::new(),
            profiles: vec![make_test_profile("p1", "Default", vec![], vec![])],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: Vec::new(),
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        // Should not crash, the corrupt file is cleaned up to prevent retry loops
        assert!(!reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
        assert!(index.mods.is_empty());
        assert!(!archives_dir.join("corrupt.fantome").exists());
    }

    #[test]
    fn reconcile_reextracts_stale_metadata() {
        let dir = tempfile::tempdir().unwrap();
        place_mod_files(dir.path(), "mod-a", ModArchiveFormat::Fantome);

        // Replace the fake archive with a real fantome zip
        let archive_path = dir.path().join("archives").join("mod-a.fantome");
        make_fantome_zip(&archive_path);

        // Backdate the config so the archive appears newer
        let config_path = dir
            .path()
            .join("mods")
            .join("mod-a")
            .join("mod.config.json");
        let past = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_000_000);
        filetime::set_file_mtime(&config_path, filetime::FileTime::from_system_time(past)).unwrap();

        let mut index = LibraryIndex {
            version: 0,
            mods: vec![make_test_entry("mod-a", ModArchiveFormat::Fantome)],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["mod-a"],
                vec!["mod-a"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["mod-a".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));

        // Metadata should have been re-extracted with real data
        let config_content = fs::read_to_string(&config_path).unwrap();
        let project: ltk_mod_project::ModProject = serde_json::from_str(&config_content).unwrap();
        assert_eq!(project.display_name, "Test Mod");
    }

    #[test]
    fn reconcile_skips_fresh_metadata() {
        let dir = tempfile::tempdir().unwrap();
        place_mod_files(dir.path(), "mod-a", ModArchiveFormat::Fantome);

        // Backdate the archive so config is newer
        let archive_path = dir.path().join("archives").join("mod-a.fantome");
        let past = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_000_000);
        filetime::set_file_mtime(&archive_path, filetime::FileTime::from_system_time(past))
            .unwrap();

        let mut index = LibraryIndex {
            version: 0,
            mods: vec![make_test_entry("mod-a", ModArchiveFormat::Fantome)],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["mod-a"],
                vec!["mod-a"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["mod-a".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };

        assert!(!reconcile_library_index(
            dir.path(),
            &mut index,
            &mut Vec::new()
        ));
    }

    #[test]
    fn load_library_index_no_reconciliation_when_clean() {
        let dir = tempfile::tempdir().unwrap();
        place_mod_files(dir.path(), "mod-a", ModArchiveFormat::Modpkg);

        let index = LibraryIndex {
            version: 0,
            mods: vec![make_test_entry("mod-a", ModArchiveFormat::Modpkg)],
            profiles: vec![make_test_profile(
                "p1",
                "Default",
                vec!["mod-a"],
                vec!["mod-a"],
            )],
            active_profile_id: "p1".to_string(),
            folders: vec![LibraryFolder {
                id: ROOT_FOLDER_ID.to_string(),
                name: String::new(),
                mod_ids: vec!["mod-a".to_string()],
            }],
            folder_order: vec![ROOT_FOLDER_ID.to_string()],
        };
        save_library_index(dir.path(), &index).unwrap();

        let mut loaded = load_library_index(dir.path()).unwrap();
        let reconciled = reconcile_library_index(dir.path(), &mut loaded, &mut Vec::new());
        assert!(!reconciled);
        assert_eq!(loaded.mods.len(), 1);
        assert_eq!(loaded.profiles[0].mod_order, vec!["mod-a"]);
    }
}
