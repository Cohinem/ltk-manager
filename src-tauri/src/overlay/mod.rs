use crate::error::{AppError, AppResult, Utf8PathExt};
use crate::mods::{LinkedBinState, ModLibrary, WadReportState};
use crate::state::{Settings, WadBlocklistEntry};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

const SCRIPTS_WAD: &str = "scripts.wad.client";
const TFT_WAD: &str = "map22.wad.client";

#[derive(Clone, serde::Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum OverlayStage {
    Indexing,
    Collecting,
    Patching,
    Strings,
    Complete,
}

/// Progress event emitted during overlay building.
#[derive(Clone, serde::Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct OverlayProgress {
    pub stage: OverlayStage,
    pub current_file: Option<String>,
    pub current: u32,
    pub total: u32,
}

impl ModLibrary {
    /// Ensure the overlay exists and is up-to-date for the current enabled mod set.
    ///
    /// Returns the overlay root directory (the prefix passed to the legacy patcher)
    /// and the number of mods whose property-bins reference linked dependencies that
    /// don't resolve against the overlay WADs they land in (0 when everything
    /// resolves). The offenders themselves are recorded into [`LinkedBinState`] and
    /// announced via the `linked-bins-updated` event so the library badges can refresh.
    ///
    /// Workshop project paths (if any) are loaded via `FsModContent` and prepended
    /// to the enabled mod list so they take highest priority.
    pub fn ensure_overlay(
        &self,
        settings: &Settings,
        workshop_project_paths: &[PathBuf],
        force_rebuild: bool,
    ) -> AppResult<(PathBuf, usize)> {
        let storage_dir = self.storage_dir(settings)?;

        Self::flush_overlays_if_app_version_changed(&storage_dir);

        let game_dir = crate::utils::game::resolve_game_dir(settings)?;
        let (profile_slug, enabled_mods) = self.get_enabled_mods_for_overlay(settings)?;

        let profile_dir = storage_dir.join("profiles").join(profile_slug.as_str());
        let overlay_root = profile_dir.join("overlay");

        // A manual rebuild discards this profile's cached overlay state so the
        // builder regenerates every WAD from scratch instead of reusing files.
        if force_rebuild {
            tracing::info!("Overlay: force rebuild requested, purging cached overlay state");
            Self::purge_overlay_artifacts(&profile_dir, true);
        }

        tracing::info!("Overlay: storage_dir={}", storage_dir.display());
        tracing::info!("Overlay: profile_slug={}", profile_slug);
        tracing::info!("Overlay: overlay_root={}", overlay_root.display());
        tracing::info!("Overlay: game_dir={}", game_dir.display());

        let enabled_ids = enabled_mods
            .iter()
            .map(|m| m.id.clone())
            .collect::<Vec<_>>();
        tracing::info!(
            "Overlay: enabled_mods={} ids=[{}]",
            enabled_ids.len(),
            enabled_ids.join(", ")
        );

        let utf8_game_dir = game_dir.clone().try_into_utf8("game directory")?;
        let utf8_overlay_root = overlay_root.clone().try_into_utf8("overlay root")?;
        let utf8_state_dir = profile_dir.try_into_utf8("profile directory")?;

        let available_wads = crate::utils::game::list_game_wads(&game_dir).unwrap_or_else(|e| {
            tracing::warn!(
                "Failed to enumerate game WADs for regex expansion: {}; \
                 regex blocklist entries will match nothing",
                e
            );
            Vec::new()
        });
        let blocked_wads = resolve_blocked_wads(settings, &available_wads);
        tracing::info!("Overlay: blocked_wads count={}", blocked_wads.len());

        let string_override_mode = resolve_string_override_mode(settings, &game_dir);
        tracing::info!("Overlay: string_override_mode={:?}", string_override_mode);

        Self::clean_corrupt_overlay_state(&utf8_state_dir);

        let app_handle_clone = self.app_handle().clone();
        let mut builder =
            ltk_overlay::OverlayBuilder::new(utf8_game_dir, utf8_overlay_root, utf8_state_dir)
                .with_blocked_wads(blocked_wads)
                .with_string_overrides(string_override_mode)
                .with_progress(move |progress| {
                    let stage = match progress.stage {
                        ltk_overlay::OverlayStage::Indexing => OverlayStage::Indexing,
                        ltk_overlay::OverlayStage::CollectingOverrides => OverlayStage::Collecting,
                        ltk_overlay::OverlayStage::PatchingWad => OverlayStage::Patching,
                        ltk_overlay::OverlayStage::ApplyingStringOverrides => OverlayStage::Strings,
                        ltk_overlay::OverlayStage::Complete => OverlayStage::Complete,
                    };
                    let _ = app_handle_clone.emit(
                        "overlay-progress",
                        OverlayProgress {
                            stage,
                            current_file: progress.current_file,
                            current: progress.current,
                            total: progress.total,
                        },
                    );
                });

        let mut all_mods = Vec::new();
        for project_path in workshop_project_paths {
            let utf8_path = project_path
                .clone()
                .try_into_utf8("workshop project path")?;
            let dir_name = project_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");
            let id = format!("workshop:{}", dir_name);
            tracing::info!("Adding workshop project: id={}, path={}", id, utf8_path);
            all_mods.push(ltk_overlay::EnabledMod {
                id,
                content: Box::new(ltk_overlay::FsModContent::new(utf8_path)),
                enabled_layers: None,
            });
        }
        all_mods.extend(enabled_mods);
        builder.set_enabled_mods(all_mods);

        builder
            .build()
            .map_err(|e| AppError::Other(format!("Overlay build failed: {}", e)))?;

        let linked_bin_offenders = builder.take_linked_bin_offenders();
        let offender_count = linked_bin_offenders.len();

        // Record offenders as a byproduct of this single build (no separate
        // pre-flight). The library badges and the reachable warning dialog read
        // them via `get_linked_bin_offenders`; the event tells the frontend the
        // snapshot changed. Failure here must not fail the patch.
        if let Some(state) = self.app_handle().try_state::<LinkedBinState>() {
            if let Err(e) = state.record(linked_bin_offenders) {
                tracing::warn!("Failed to record linked-bin offenders: {}", e);
            } else {
                let _ = self.app_handle().emit("linked-bins-updated", ());
            }
        }

        // Capture per-mod WAD reports for the library badge UI. Failure to
        // persist must not fail the patch — log and continue.
        //
        // Note: `OverlayBuilder::build()` emits its own `Complete` progress event
        // *before* returning, so the frontend may see that event before the reports
        // are persisted. We emit a dedicated `wad-reports-updated` event after
        // persisting so the frontend knows the cache is ready to query.
        let reports = builder.take_mod_wad_reports();
        if !reports.is_empty() {
            if let Some(state) = self.app_handle().try_state::<WadReportState>() {
                if let Err(e) = state.record_reports(reports) {
                    tracing::warn!("Failed to persist per-mod WAD reports: {}", e);
                } else {
                    let _ = self.app_handle().emit("wad-reports-updated", ());
                }
            }
        }

        Ok((overlay_root, offender_count))
    }

    /// Force a full rebuild of the active profile's overlay.
    ///
    /// Discards the profile's cached overlay state (patched WADs, `overlay.json`,
    /// metadata and game-index caches) so the builder regenerates everything from
    /// scratch. This is the escape hatch for the case where the incremental builder
    /// would otherwise reuse a stale or incorrectly-built overlay WAD — its reuse
    /// decision keys on the mod set and content, not on the overlay's actual bytes
    /// or the builder version.
    pub fn rebuild_overlay(&self, settings: &Settings) -> AppResult<(PathBuf, usize)> {
        self.ensure_overlay(settings, &[], true)
    }

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
    fn flush_overlays_if_app_version_changed(storage_dir: &Path) {
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
                    Self::purge_overlay_artifacts(&path, false);
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
    fn purge_overlay_artifacts(profile_dir: &Path, include_game_index: bool) {
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
    fn clean_corrupt_overlay_state(state_dir: &camino::Utf8Path) {
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
}

/// Resolve which locales mods' string overrides should be applied to.
///
/// With the "all locales" setting on, every installed locale is patched.
/// Otherwise only the locale the League client is configured to use — read
/// from `LeagueClientSettings.yaml`, falling back to the sole installed locale
/// and finally to `en_us` so string overrides still apply on unusual installs.
pub(crate) fn resolve_string_override_mode(
    settings: &Settings,
    game_dir: &Path,
) -> ltk_overlay::StringOverrideMode {
    if settings.apply_string_overrides_to_all_locales {
        return ltk_overlay::StringOverrideMode::AllInstalled;
    }

    let locale = crate::utils::locale::detect_league_locale(game_dir).unwrap_or_else(|| {
        tracing::warn!("Falling back to 'en_us' for string overrides");
        "en_us".to_string()
    });
    ltk_overlay::StringOverrideMode::Locales(vec![locale])
}

/// Resolve the user's blocklist settings into a concrete, deduped list of WAD
/// filenames to hand to `ltk_overlay::OverlayBuilder::with_blocked_wads`.
///
/// - `Exact` entries are lowercased and passed through as-is.
/// - `Regex` entries are compiled case-insensitively and expanded against
///   `available_wads`; invalid patterns are logged and skipped so one bad entry
///   can't break the whole patch.
/// - `block_scripts_wad` and `!patch_tft` add their respective WADs.
///
/// `available_wads` should come from `crate::utils::game::list_game_wads`; pass an empty slice if
/// enumeration failed (regex entries then match nothing).
pub(crate) fn resolve_blocked_wads(settings: &Settings, available_wads: &[String]) -> Vec<String> {
    let mut blocked: Vec<String> = Vec::new();

    for entry in &settings.wad_blocklist {
        match entry {
            WadBlocklistEntry::Exact { value } => {
                blocked.push(value.to_lowercase());
            }
            WadBlocklistEntry::Regex { value } => {
                match regex::Regex::new(&format!("(?i){}", value)) {
                    Ok(re) => {
                        for wad in available_wads {
                            if re.is_match(wad) {
                                blocked.push(wad.clone());
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Invalid regex in wad_blocklist {:?}: {}", value, e);
                    }
                }
            }
        }
    }

    if settings.block_scripts_wad {
        blocked.push(SCRIPTS_WAD.to_string());
    }
    if !settings.patch_tft {
        blocked.push(TFT_WAD.to_string());
    }

    blocked.sort();
    blocked.dedup();
    blocked
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_blocked_wads_exact_lowercased_and_scripts_added_by_default() {
        let settings = Settings {
            wad_blocklist: vec![WadBlocklistEntry::Exact {
                value: "Aatrox.wad.client".to_string(),
            }],
            ..Settings::default()
        };
        let result = resolve_blocked_wads(&settings, &[]);
        assert!(result.contains(&"aatrox.wad.client".to_string()));
        assert!(result.contains(&"scripts.wad.client".to_string()));
        assert!(result.contains(&"map22.wad.client".to_string()));
    }

    #[test]
    fn resolve_blocked_wads_regex_expanded_against_available() {
        let settings = Settings {
            block_scripts_wad: false,
            patch_tft: true,
            wad_blocklist: vec![WadBlocklistEntry::Regex {
                value: r"^map\d+\.en_us\.wad\.client$".to_string(),
            }],
            ..Settings::default()
        };
        let available = vec![
            "map11.en_us.wad.client".to_string(),
            "map12.wad.client".to_string(),
            "map22.en_us.wad.client".to_string(),
            "aatrox.wad.client".to_string(),
        ];
        let result = resolve_blocked_wads(&settings, &available);
        assert_eq!(
            result,
            vec![
                "map11.en_us.wad.client".to_string(),
                "map22.en_us.wad.client".to_string(),
            ]
        );
    }

    #[test]
    fn resolve_blocked_wads_invalid_regex_skipped_and_others_kept() {
        let settings = Settings {
            block_scripts_wad: false,
            patch_tft: true,
            wad_blocklist: vec![
                WadBlocklistEntry::Regex {
                    value: "[bad(".to_string(),
                },
                WadBlocklistEntry::Exact {
                    value: "keeper.wad.client".to_string(),
                },
            ],
            ..Settings::default()
        };
        let result = resolve_blocked_wads(&settings, &[]);
        assert_eq!(result, vec!["keeper.wad.client".to_string()]);
    }

    #[test]
    fn resolve_blocked_wads_dedupes_overlapping_entries() {
        let settings = Settings {
            block_scripts_wad: true,
            patch_tft: true,
            wad_blocklist: vec![
                WadBlocklistEntry::Exact {
                    value: "Scripts.wad.client".to_string(),
                },
                WadBlocklistEntry::Regex {
                    value: "^scripts".to_string(),
                },
            ],
            ..Settings::default()
        };
        let available = vec!["scripts.wad.client".to_string()];
        let result = resolve_blocked_wads(&settings, &available);
        assert_eq!(result, vec!["scripts.wad.client".to_string()]);
    }

    #[test]
    fn overlay_stage_serialization() {
        assert_eq!(
            serde_json::to_string(&OverlayStage::Indexing).unwrap(),
            "\"indexing\""
        );
        assert_eq!(
            serde_json::to_string(&OverlayStage::Collecting).unwrap(),
            "\"collecting\""
        );
        assert_eq!(
            serde_json::to_string(&OverlayStage::Patching).unwrap(),
            "\"patching\""
        );
        assert_eq!(
            serde_json::to_string(&OverlayStage::Strings).unwrap(),
            "\"strings\""
        );
        assert_eq!(
            serde_json::to_string(&OverlayStage::Complete).unwrap(),
            "\"complete\""
        );
    }

    #[test]
    fn overlay_progress_serialization() {
        let progress = OverlayProgress {
            stage: OverlayStage::Patching,
            current_file: Some("test.wad.client".to_string()),
            current: 5,
            total: 10,
        };
        let json = serde_json::to_value(&progress).unwrap();
        assert_eq!(json["stage"], "patching");
        assert_eq!(json["currentFile"], "test.wad.client");
        assert_eq!(json["current"], 5);
        assert_eq!(json["total"], 10);
    }
}
