//! Core application configuration.
//!
//! [`Config`] holds the patching-relevant settings shared by every frontend.
//! UI preferences (theme, tray behavior, hotkeys, …) live in the Tauri shell's
//! `Settings`, which embeds this struct via `#[serde(flatten)]` so everything
//! persists to a single `settings.json`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn default_true() -> bool {
    true
}

fn default_wad_blocklist() -> Vec<WadBlocklistEntry> {
    vec![]
}

/// A single entry in the WAD blocklist.
///
/// `Exact` matches a literal filename (case-insensitively). `Regex` matches
/// against every WAD filename in the game install; the pattern is always
/// applied case-insensitively.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WadBlocklistEntry {
    Exact { value: String },
    Regex { value: String },
}

/// Accepts both the legacy `["Name.wad.client", ...]` format and the new
/// tagged `[{ "kind": "exact", "value": "..." }, ...]` format. Legacy strings
/// are migrated to `Exact` entries.
fn deserialize_wad_blocklist<'de, D>(deserializer: D) -> Result<Vec<WadBlocklistEntry>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum RawEntry {
        Legacy(String),
        Tagged(WadBlocklistEntry),
    }

    let raw: Vec<RawEntry> = Vec::deserialize(deserializer)?;
    Ok(raw
        .into_iter()
        .map(|entry| match entry {
            RawEntry::Legacy(value) => WadBlocklistEntry::Exact { value },
            RawEntry::Tagged(entry) => entry,
        })
        .collect())
}

/// Patching-relevant configuration: everything the mod library, overlay
/// builder, and patcher need, and nothing UI-specific.
///
/// Every field is optional or defaulted so a partial (or empty) JSON document
/// deserializes into a usable configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[cfg_attr(feature = "ts", ts(as = "Option<String>"))]
    pub league_path: Option<PathBuf>,
    #[cfg_attr(feature = "ts", ts(as = "Option<String>"))]
    pub mod_storage_path: Option<PathBuf>,
    /// Directory where mod projects are stored (for Creator Workshop).
    #[cfg_attr(feature = "ts", ts(as = "Option<String>"))]
    pub workshop_path: Option<PathBuf>,
    /// Whether to patch TFT game files (Map22.wad.client). Default: false.
    #[serde(default)]
    pub patch_tft: bool,
    /// Whether to block mods from patching Scripts.wad.client. Default: true.
    #[serde(default = "default_true")]
    pub block_scripts_wad: bool,
    /// Whether to run the linked-bin dependency check before starting the patcher. Default: true.
    #[serde(default = "default_true")]
    pub linked_bin_check_enabled: bool,
    /// Additional WAD files to exclude from overlay building.
    #[serde(
        default = "default_wad_blocklist",
        deserialize_with = "deserialize_wad_blocklist"
    )]
    pub wad_blocklist: Vec<WadBlocklistEntry>,
    /// Run the injection host elevated (UAC). An elevated game can only be
    /// injected by an equally elevated host, so this is required when League
    /// runs as administrator. Off by default: when off, non-elevated users
    /// avoid a UAC prompt on every patcher start. Auto-elevation still kicks in
    /// when League is detected configured to run as admin, regardless of this
    /// flag (see `commands::patcher::start_patcher_inner`).
    #[serde(default)]
    pub elevate_injector: bool,
    /// Whether to automatically categorize mods from their content (champions,
    /// maps and content tags derived from the WAD/chunk footprint, surfaced as
    /// "auto" suggestions and library filters). When off, only the categories
    /// the user sets themselves are used. Default: true.
    #[serde(default = "default_true")]
    pub auto_categorization_enabled: bool,
    /// Whether to enforce the anti-skinhack scan while patching. When on
    /// (default), a champion WAD that fails the scan aborts patching. When off,
    /// the `CSLOL_HOOK_OPT_OUT_AH_V1` hook flag is set so failures are
    /// downgraded to warnings and flagged mods load anyway. Default: true.
    #[serde(default = "default_true")]
    pub enforce_skinhack_scan: bool,
    /// Whether mods' string overrides are applied to every installed locale
    /// instead of only the locale the League client is configured to use.
    /// Default: false (current locale only).
    #[serde(default)]
    pub apply_string_overrides_to_all_locales: bool,
    /// Raise the injection host's log level from `Info` to `Debug`. The host and
    /// the injected DLL decide their own verbosity from this, so it is the only
    /// way to get their diagnostics out of a release build - `RUST_LOG` only
    /// affects the manager's own tracing. Read at patcher start, so a change
    /// takes effect on the next start. Default: false.
    #[serde(default)]
    pub verbose_patcher_logging: bool,
    /// Whether to set the `LAZY_WAD_SCAN` hook flag, which delays the anti-hack
    /// WAD scan to the load stage instead of scanning every archive up front.
    /// The overlay makes lazy scanning crash-prone, so the DLL only honours the
    /// flag when the game has crash reporting disabled - with it enabled this is
    /// inert rather than harmful. Default: false.
    #[serde(default)]
    pub lazy_wad_scan: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            league_path: None,
            mod_storage_path: None,
            workshop_path: None,
            patch_tft: false,
            block_scripts_wad: true,
            linked_bin_check_enabled: true,
            wad_blocklist: default_wad_blocklist(),
            elevate_injector: false,
            auto_categorization_enabled: true,
            enforce_skinhack_scan: true,
            apply_string_overrides_to_all_locales: false,
            verbose_patcher_logging: false,
            lazy_wad_scan: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_default_values() {
        let config = Config::default();
        assert!(config.league_path.is_none());
        assert!(config.mod_storage_path.is_none());
        assert!(config.workshop_path.is_none());
        assert!(!config.patch_tft);
        assert!(config.block_scripts_wad);
        assert!(config.linked_bin_check_enabled);
        assert!(config.wad_blocklist.is_empty());
        assert!(!config.elevate_injector);
        assert!(config.auto_categorization_enabled);
        assert!(config.enforce_skinhack_scan);
        assert!(!config.apply_string_overrides_to_all_locales);
        assert!(!config.verbose_patcher_logging);
        assert!(!config.lazy_wad_scan);
    }

    #[test]
    fn config_deserializes_from_empty_object() {
        let config: Config = serde_json::from_str("{}").unwrap();
        assert!(config.league_path.is_none());
        assert!(config.block_scripts_wad);
        assert!(config.enforce_skinhack_scan);
    }

    #[test]
    fn wad_blocklist_accepts_legacy_string_array() {
        let json = r#"{
            "wadBlocklist": ["Map12.wad.client", "Aatrox.wad.client"]
        }"#;
        let config: Config = serde_json::from_str(json).unwrap();
        assert_eq!(config.wad_blocklist.len(), 2);
        assert_eq!(
            config.wad_blocklist[0],
            WadBlocklistEntry::Exact {
                value: "Map12.wad.client".to_string()
            }
        );
        assert_eq!(
            config.wad_blocklist[1],
            WadBlocklistEntry::Exact {
                value: "Aatrox.wad.client".to_string()
            }
        );
    }

    #[test]
    fn wad_blocklist_accepts_tagged_entries() {
        let json = r#"{
            "wadBlocklist": [
                { "kind": "exact", "value": "Map12.wad.client" },
                { "kind": "regex", "value": "^map\\d+\\.en_us\\.wad\\.client$" }
            ]
        }"#;
        let config: Config = serde_json::from_str(json).unwrap();
        assert_eq!(config.wad_blocklist.len(), 2);
        assert!(matches!(
            config.wad_blocklist[0],
            WadBlocklistEntry::Exact { .. }
        ));
        assert!(matches!(
            config.wad_blocklist[1],
            WadBlocklistEntry::Regex { .. }
        ));
    }

    #[test]
    fn wad_blocklist_mixed_legacy_and_tagged() {
        let json = r#"{
            "wadBlocklist": [
                "Legacy.wad.client",
                { "kind": "regex", "value": "^tft" }
            ]
        }"#;
        let config: Config = serde_json::from_str(json).unwrap();
        assert_eq!(config.wad_blocklist.len(), 2);
        assert_eq!(
            config.wad_blocklist[0],
            WadBlocklistEntry::Exact {
                value: "Legacy.wad.client".to_string()
            }
        );
        assert_eq!(
            config.wad_blocklist[1],
            WadBlocklistEntry::Regex {
                value: "^tft".to_string()
            }
        );
    }

    #[test]
    fn wad_blocklist_serializes_as_tagged() {
        let entries = vec![
            WadBlocklistEntry::Exact {
                value: "foo.wad.client".to_string(),
            },
            WadBlocklistEntry::Regex {
                value: "bar".to_string(),
            },
        ];
        let json = serde_json::to_value(&entries).unwrap();
        assert_eq!(json[0]["kind"], "exact");
        assert_eq!(json[0]["value"], "foo.wad.client");
        assert_eq!(json[1]["kind"], "regex");
        assert_eq!(json[1]["value"], "bar");
    }
}
