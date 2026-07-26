//! Lifecycle of a profile's cached overlay artifacts.
//!
//! The builder decides whether to reuse an existing overlay by hashing the mod
//! set, mod content, game fingerprint, and a state schema version. None of those
//! move when the overlay-building *logic* changes, so a fix shipped in a new
//! release would never reach anyone who already has an overlay on disk. Purging
//! on version change is what forces that one clean rebuild.
//!
//! Every function here is best-effort: a cache that can't be deleted is logged
//! and skipped, never fatal.

use std::path::Path;

/// Wipe every profile's cached overlay artifacts when the app version changed
/// since the overlays were last built.
///
/// The overlay builder keys its reuse/skip decisions on the mod set, mod
/// content, game fingerprint and a state *schema* version — none of which move
/// when the overlay-building *logic* changes between releases. So a build-logic
/// fix would otherwise never reach users who already have an overlay on disk.
/// Gating on the app version forces one clean rebuild after each update.
///
/// Best-effort: a marker file under `storage_dir` records the version that last
/// built overlays. Failures are logged, never fatal.
pub(super) fn flush_overlays_if_app_version_changed(storage_dir: &Path) {
    const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
    let marker = storage_dir.join(".overlay-build-version");

    let up_to_date = std::fs::read_to_string(&marker)
        .ok()
        .is_some_and(|v| v.trim() == APP_VERSION);
    if up_to_date {
        return;
    }

    let profiles_dir = storage_dir.join("profiles");
    if let Ok(entries) = std::fs::read_dir(&profiles_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                purge_overlay_artifacts(&path, false);
            }
        }
    }

    let _ = std::fs::create_dir_all(storage_dir);
    match std::fs::write(&marker, APP_VERSION) {
        Ok(()) => tracing::info!(
            "Flushed cached overlays for app version {} (overlay build logic may have changed)",
            APP_VERSION
        ),
        Err(e) => tracing::warn!(
            "Failed to write overlay build-version marker {}: {}",
            marker.display(),
            e
        ),
    }
}

/// Remove a profile's cached overlay artifacts so the next build starts clean.
///
/// Always removes the patched-WAD `overlay/` tree, the `overlay.json` state
/// file, and the `override_meta.bin` metadata cache. The `game_index.bin` cache
/// is only removed when `include_game_index` is set — it is expensive to rebuild
/// and is independently validated by the game fingerprint, so the version flush
/// keeps it and only a manual full rebuild drops it.
pub(super) fn purge_overlay_artifacts(profile_dir: &Path, include_game_index: bool) {
    let overlay_dir = profile_dir.join("overlay");
    if overlay_dir.exists() {
        if let Err(e) = std::fs::remove_dir_all(&overlay_dir) {
            tracing::warn!(
                "Failed to remove overlay directory {}: {}",
                overlay_dir.display(),
                e
            );
        }
    }

    let mut files = vec![
        profile_dir.join("overlay.json"),
        profile_dir.join("override_meta.bin"),
    ];
    if include_game_index {
        files.push(profile_dir.join("game_index.bin"));
    }
    for file in files {
        if file.exists() {
            if let Err(e) = std::fs::remove_file(&file) {
                tracing::warn!(
                    "Failed to remove overlay artifact {}: {}",
                    file.display(),
                    e
                );
            }
        }
    }
}

/// Scan `state_dir` for top-level JSON files that are empty or contain invalid
/// JSON and remove them so `ltk_overlay` does not fail to parse stale/corrupt
/// state files written by a previous run that was interrupted mid-write.
pub(super) fn clean_corrupt_overlay_state(state_dir: &camino::Utf8Path) {
    let entries = match std::fs::read_dir(state_dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let contents = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if contents.trim().is_empty()
            || serde_json::from_str::<serde_json::Value>(&contents).is_err()
        {
            tracing::warn!(
                "Removing corrupt overlay state file before build: {}",
                path.display()
            );
            let _ = std::fs::remove_file(&path);
        }
    }
}
