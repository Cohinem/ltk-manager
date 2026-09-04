use crate::error::{AppError, AppResult};
use serde_json::Value;
use std::fs;
use std::path::Path;

use super::{LibraryIndex, library_index_path};
use crate::mods::types::ROOT_FOLDER_ID;
use crate::utils::fs::atomic_write;

/// Current schema version for the library index.
/// Increment this when making breaking changes to the schema and add a
/// corresponding `vN_to_vN+1` migration function.
pub(crate) const CURRENT_VERSION: u32 = 2;

impl LibraryIndex {
    /// Load a library index from disk, migrating from older schema versions
    /// if needed.
    ///
    /// Reads the raw JSON, detects the schema version, backs up the file if
    /// migration is needed, applies sequential migrations (v0→v1, v1→v2, etc.),
    /// persists the result, and deserializes into the typed `LibraryIndex`.
    ///
    /// Returns `AppError::SchemaVersionTooNew` if the file was written by a
    /// newer app version.
    pub(super) fn load_and_migrate(storage_dir: &Path) -> AppResult<Self> {
        let path = library_index_path(storage_dir);

        let raw = fs::read_to_string(&path)?;
        let mut value: Value = serde_json::from_str(&raw).map_err(AppError::from)?;
        let file_version = Self::extract_version(&value);

        if file_version > CURRENT_VERSION {
            return Err(AppError::SchemaVersionTooNew {
                file_version,
                max_supported: CURRENT_VERSION,
            });
        }

        let migrated = file_version < CURRENT_VERSION;
        if migrated {
            Self::backup(storage_dir, file_version)?;

            if file_version < 1 {
                value = Self::migrate_v0_to_v1(value)?;
            }

            if file_version < 2 {
                value = Self::migrate_v1_to_v2(value)?;
            }
        }

        let index: Self = serde_json::from_value(value).map_err(AppError::from)?;

        if migrated {
            let contents = serde_json::to_string_pretty(&index)?;
            atomic_write(&path, contents.as_bytes())?;
        }

        Ok(index)
    }

    /// Extract the schema version from raw library index JSON.
    /// Returns 0 if the `version` field is absent (pre-versioning files).
    fn extract_version(value: &Value) -> u32 {
        value.get("version").and_then(|v| v.as_u64()).unwrap_or(0) as u32
    }

    /// Back up the library index file before migrating from the given version.
    /// Copies `library.json` to `library.v{from_version}.json.bak`.
    fn backup(storage_dir: &Path, from_version: u32) -> AppResult<()> {
        let src = library_index_path(storage_dir);
        let dst = storage_dir.join(format!("library.v{}.json.bak", from_version));
        fs::copy(&src, &dst)?;
        tracing::info!(
            "Backed up library index (v{}) to {}",
            from_version,
            dst.display()
        );
        Ok(())
    }

    /// Migrate a v0 (pre-versioning) index to v1.
    ///
    /// Ensures the root folder exists with all mods assigned, populates
    /// `folderOrder`, and sets `version` to 1. This absorbs the ad-hoc
    /// migration that previously lived in `load_library_index`.
    fn migrate_v0_to_v1(mut value: Value) -> AppResult<Value> {
        let obj = value
            .as_object_mut()
            .ok_or_else(|| AppError::Other("Library index is not a JSON object".to_string()))?;

        if !obj.contains_key("folders") {
            obj.insert("folders".to_string(), Value::Array(Vec::new()));
        }

        let has_root = obj
            .get("folders")
            .and_then(|f| f.as_array())
            .is_some_and(|arr| {
                arr.iter()
                    .any(|f| f.get("id").and_then(|id| id.as_str()) == Some(ROOT_FOLDER_ID))
            });

        if !has_root {
            let active_profile_id = obj
                .get("activeProfileId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let mod_ids: Vec<Value> = obj
                .get("profiles")
                .and_then(|p| p.as_array())
                .and_then(|profiles| {
                    profiles.iter().find(|p| {
                        p.get("id").and_then(|id| id.as_str()) == Some(&active_profile_id)
                    })
                })
                .and_then(|profile| profile.get("modOrder"))
                .and_then(|mo| mo.as_array())
                .cloned()
                .unwrap_or_else(|| {
                    obj.get("mods")
                        .and_then(|m| m.as_array())
                        .map(|mods| mods.iter().filter_map(|m| m.get("id").cloned()).collect())
                        .unwrap_or_default()
                });

            let root_folder = serde_json::json!({
                "id": ROOT_FOLDER_ID,
                "name": "",
                "modIds": mod_ids
            });

            if let Some(folders) = obj.get_mut("folders").and_then(|f| f.as_array_mut()) {
                folders.insert(0, root_folder);
            }
        }

        if !obj.contains_key("folderOrder") {
            obj.insert("folderOrder".to_string(), Value::Array(Vec::new()));
        }

        let all_folder_ids: Vec<Value> = obj
            .get("folders")
            .and_then(|f| f.as_array())
            .map(|folders| {
                folders
                    .iter()
                    .filter_map(|f| f.get("id").cloned())
                    .collect()
            })
            .unwrap_or_default();

        if let Some(order) = obj.get_mut("folderOrder").and_then(|fo| fo.as_array_mut()) {
            let has_root_in_order = order.iter().any(|v| v.as_str() == Some(ROOT_FOLDER_ID));
            if !has_root_in_order {
                order.insert(0, Value::String(ROOT_FOLDER_ID.to_string()));
            }

            if order.len() <= 1 && !all_folder_ids.is_empty() {
                *order = all_folder_ids;
            }
        }

        obj.insert("version".to_string(), Value::Number(1.into()));
        tracing::info!("Migrated library index from v0 to v1");

        Ok(value)
    }

    /// Migrate a v1 index to v2, the schema that knows about slug directories.
    ///
    /// Every entry keeps `slug: null`, which is what marks it as still living
    /// in the uuid layout — moving the directories is the layout migration's
    /// job, and it runs after this one. Until it does, every entry reads its
    /// content out of `archives/`, whatever its format says, which is what
    /// `storage` has to record.
    fn migrate_v1_to_v2(mut value: Value) -> AppResult<Value> {
        let obj = value
            .as_object_mut()
            .ok_or_else(|| AppError::Other("Library index is not a JSON object".to_string()))?;

        if let Some(mods) = obj.get_mut("mods").and_then(|m| m.as_array_mut()) {
            for entry in mods.iter_mut().filter_map(Value::as_object_mut) {
                entry.insert("storage".to_string(), Value::String("archive".to_string()));
            }
        }

        obj.insert("version".to_string(), Value::Number(2.into()));
        tracing::info!("Migrated library index from v1 to v2");

        Ok(value)
    }
}

#[cfg(test)]
mod tests;
