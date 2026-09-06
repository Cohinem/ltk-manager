//! Detection of the League client's configured locale.

use fs_err as fs;
use std::path::Path;

use crate::utils::client_settings::LeagueClientSettings;
use crate::utils::game::GameDir;

/// Detect the locale the League client is configured to use, lowercased
/// (e.g. `"en_us"`).
///
/// Reads `install.globals.locale` from `<league root>/Config/LeagueClientSettings.yaml`,
/// where the league root is the parent of `game_dir`. When the file or key is
/// unavailable, falls back to the game's installed localized WADs
/// (`DATA/FINAL/Localized/Global.{locale}.wad.client`) if exactly one locale is
/// installed. Returns `None` when neither source is conclusive.
pub fn detect_league_locale(game_dir: &Path) -> Option<String> {
    if let Some(locale) = locale_from_client_settings(game_dir) {
        return Some(locale);
    }

    match installed_locales(game_dir).as_slice() {
        [single] => {
            tracing::info!(
                "Locale not found in LeagueClientSettings.yaml; using sole installed locale '{}'",
                single
            );
            Some(single.clone())
        }
        [] => {
            tracing::warn!("Could not detect League locale: no localized Global WADs found");
            None
        }
        multiple => {
            tracing::warn!(
                "Could not detect League locale: multiple locales installed ({:?})",
                multiple
            );
            None
        }
    }
}

fn locale_from_client_settings(game_dir: &Path) -> Option<String> {
    let settings = LeagueClientSettings::read(&GameDir::from_path(game_dir))
        .inspect_err(|e| tracing::debug!("Could not read the League client settings: {e}"))
        .ok()?;
    let locale = settings.locale()?;
    tracing::info!("Detected League locale '{}' from client settings", locale);

    Some(locale)
}

/// Locales with a `Global.{locale}.wad.client` under `DATA/FINAL/Localized`,
/// lowercased and sorted.
fn installed_locales(game_dir: &Path) -> Vec<String> {
    let localized_dir = game_dir.join("DATA").join("FINAL").join("Localized");
    let Ok(entries) = fs::read_dir(&localized_dir) else {
        return Vec::new();
    };

    let mut locales: Vec<String> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_ascii_lowercase();
            let locale = name
                .strip_prefix("global.")?
                .strip_suffix(".wad.client")?
                .to_string();
            if locale.is_empty() || locale.contains('.') {
                return None;
            }
            Some(locale)
        })
        .collect();
    locales.sort();
    locales.dedup();
    locales
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mirrors the real file's structure, including unrelated keys.
    const CLIENT_SETTINGS_YAML: &str = r#"
install:
    crash_reporting:
        enabled: true
        type: "crashpad"
    gameflow-patcher-lock: null
    globals:
        locale: "en_US"
        region: "EUW"
    patcher:
        locales:
        - "en_US"
"#;

    fn league_root_with(yaml: Option<&str>, locales: &[&str]) -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        if let Some(yaml) = yaml {
            let config_dir = tmp.path().join("Config");
            fs::create_dir_all(&config_dir).unwrap();
            fs::write(config_dir.join("LeagueClientSettings.yaml"), yaml).unwrap();
        }
        let localized = tmp.path().join("Game/DATA/FINAL/Localized");
        fs::create_dir_all(&localized).unwrap();
        for locale in locales {
            fs::write(localized.join(format!("Global.{locale}.wad.client")), b"").unwrap();
        }
        tmp
    }

    #[test]
    fn reads_locale_from_client_settings() {
        let root = league_root_with(Some(CLIENT_SETTINGS_YAML), &["en_US", "ko_KR"]);
        let locale = detect_league_locale(&root.path().join("Game"));
        assert_eq!(locale.as_deref(), Some("en_us"));
    }

    #[test]
    fn falls_back_to_sole_installed_locale() {
        let root = league_root_with(None, &["ko_KR"]);
        let locale = detect_league_locale(&root.path().join("Game"));
        assert_eq!(locale.as_deref(), Some("ko_kr"));
    }

    #[test]
    fn ambiguous_install_without_settings_returns_none() {
        let root = league_root_with(None, &["en_US", "ko_KR"]);
        assert_eq!(detect_league_locale(&root.path().join("Game")), None);
    }

    #[test]
    fn malformed_yaml_falls_back_to_scan() {
        let root = league_root_with(Some(":: not yaml ["), &["en_US"]);
        let locale = detect_league_locale(&root.path().join("Game"));
        assert_eq!(locale.as_deref(), Some("en_us"));
    }

    #[test]
    fn missing_locale_key_falls_back_to_scan() {
        let root = league_root_with(
            Some("install:\n    globals:\n        region: \"EUW\"\n"),
            &["en_US"],
        );
        let locale = detect_league_locale(&root.path().join("Game"));
        assert_eq!(locale.as_deref(), Some("en_us"));
    }
}
