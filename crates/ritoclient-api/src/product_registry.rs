//! `/rnet-product-registry/v4` - what is installed, and where.
//!
//! One call answers questions the manager currently guesses at: where League
//! lives, which subdirectory holds the game data, whether PBE is installed, and
//! which content release is on disk.
//!
//! It is worth knowing *why* these answers are authoritative rather than merely
//! convenient. Foundation reads this same registry to build League's command
//! line - `executable = PathJoin(install_full_path, primary_executable)`,
//! `workingDir = install_full_path`. So `install_full_path` is not a path Riot
//! happens to know about; it is by construction the directory the client will
//! launch the game from.
//!
//! # Caveats
//!
//! - **The namespace is absent from swagger and split across `v1`/`v4`.** It
//!   will churn. Everything here deserializes tolerantly: unknown keys are
//!   ignored, missing keys default, and any failure is `None` rather than an
//!   error. Callers use this to enrich what they already know.
//! - **It is plugin-gated.** A tray-idle client's entire API surface collapses
//!   to the argv handoff (see [`crate::app_args`]), so this 404s in that state
//!   and does not exist at all when the client is closed.

use std::path::PathBuf;

use serde::Deserialize;

use crate::http;
use crate::lockfile::{Lockfile, live_lockfile};

/// Riot's product id for League of Legends.
pub const LEAGUE_PRODUCT_ID: &str = "league_of_legends";

/// The patchline id of the live game.
pub const LIVE_PATCHLINE_ID: &str = "live";

/// The secondary patchline that holds the game data - the `Game` subdirectory.
const GAME_PATCH_ID: &str = "game_patch";

/// A product and every patchline it declares, installed or not.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Product {
    pub id: String,
    pub patchlines: Vec<Patchline>,
}

impl Product {
    pub fn patchline(&self, id: &str) -> Option<&Patchline> {
        self.patchlines.iter().find(|p| p.id == id)
    }

    /// Only the patchlines that are actually on disk.
    pub fn installed_patchlines(&self) -> impl Iterator<Item = &Patchline> {
        self.patchlines.iter().filter(|p| p.is_installed())
    }
}

/// One patchline of a product - `live`, `pbe`, and so on.
///
/// A record exists for every patchline the account is *entitled* to, which is
/// not the same as installed; see [`Patchline::is_installed`].
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Patchline {
    pub id: String,
    /// `league_of_legends.live` - joins onto `/patch/v1/installs` and the
    /// ProgramData metadata directory.
    pub install_id: String,
    /// Already localized and already disambiguated ("League of Legends PBE"),
    /// so there is no need to synthesize a display name.
    pub full_name: String,
    /// The install root. Empty when the patchline is not installed.
    pub install_full_path: String,
    pub install_dir: String,
    pub primary_executable: String,
    /// The content release on disk, e.g. `ED5FB7B738681EE8`. This is the key
    /// that changes when League patches.
    pub release_id: String,
    /// Informative only - reports `unsupported_region` for a patchline the
    /// account's region has no configuration for, which says nothing about
    /// whether it is installed.
    pub configuration_status: String,
    pub vanguard_dependency: bool,
    pub launch_disabled: bool,
    pub secondary_patchlines: Vec<SecondaryPatchline>,
}

impl Patchline {
    /// Whether this patchline is on disk.
    ///
    /// **This is the install test.** `/product-launcher/…/eligibility` is not:
    /// it answers `true` for `pbe` on a machine with no PBE install, because it
    /// asks whether the account *may* launch it.
    pub fn is_installed(&self) -> bool {
        !self.install_full_path.is_empty()
    }

    /// The install root, when installed.
    pub fn install_root(&self) -> Option<PathBuf> {
        self.is_installed()
            .then(|| PathBuf::from(&self.install_full_path))
    }

    /// The directory holding the game data - what the overlay builder wants.
    ///
    /// The `Game` subdirectory is a **declared relative path**, not a constant,
    /// so it is derived rather than assumed. A patchline that declares no
    /// `game_patch` gets `None`: guessing here would defeat the point of asking.
    pub fn game_dir(&self) -> Option<PathBuf> {
        let root = self.install_root()?;
        let relative = self
            .secondary_patchlines
            .iter()
            .find(|s| s.id == GAME_PATCH_ID)?;
        if relative.relative_path.is_empty() {
            return None;
        }
        Some(root.join(&relative.relative_path))
    }
}

/// A nested install under a patchline - for League, the `Game` directory.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct SecondaryPatchline {
    pub id: String,
    /// Relative to the parent's `install_full_path`.
    ///
    /// Spelled camelCase in the response while its siblings are snake_case; the
    /// alias covers the day that stops being true.
    #[serde(rename = "relativePath", alias = "relative_path")]
    pub relative_path: String,
}

/// `GET /rnet-product-registry/v4/products`.
///
/// `None` means the client could not answer - closed, tray-idle, or a shape we
/// no longer recognise. Never an error: every caller has a fallback.
pub fn products(lockfile: &Lockfile) -> Option<Vec<Product>> {
    let products: Vec<Product> = http::get_json(lockfile, "/rnet-product-registry/v4/products")?;
    tracing::debug!("Product registry returned {} product(s)", products.len());
    Some(products)
}

/// The League record from the registry.
pub fn league(lockfile: &Lockfile) -> Option<Product> {
    products(lockfile)?
        .into_iter()
        .find(|p| p.id == LEAGUE_PRODUCT_ID)
}

/// The install root of an installed League patchline, from a client that is
/// running right now.
///
/// Prefers `live`, then any other installed patchline, so a machine with only
/// PBE still detects something. `None` when no client is up or nothing is
/// installed - the caller falls back to scanning disk.
pub fn detect_league_install_root() -> Option<PathBuf> {
    let league = league(&live_lockfile()?)?;

    league
        .patchline(LIVE_PATCHLINE_ID)
        .filter(|p| p.is_installed())
        .or_else(|| league.installed_patchlines().next())
        .and_then(Patchline::install_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Recorded from a live client (EUW, 2026-07-27), trimmed to the fields we
    /// read. `pbe` is entitled but not installed on that machine, which is what
    /// makes it the useful half of the fixture.
    const RECORDED: &str = r#"[
      {
        "id": "league_of_legends",
        "patchlines": [
          {
            "id": "live",
            "install_id": "league_of_legends.live",
            "full_name": "League of Legends",
            "install_full_path": "C:/Riot Games/League of Legends",
            "install_dir": "League of Legends",
            "primary_executable": "LeagueClient.exe",
            "release_id": "ED5FB7B738681EE8",
            "configuration_status": "has_configuration",
            "vanguard_dependency": true,
            "launch_disabled": false,
            "secondary_patchlines": [{ "id": "game_patch", "relativePath": "Game" }]
          },
          {
            "id": "pbe",
            "install_id": "league_of_legends.pbe",
            "full_name": "League of Legends PBE",
            "install_full_path": "",
            "install_dir": "League of Legends (PBE)",
            "primary_executable": "",
            "release_id": "",
            "configuration_status": "unsupported_region",
            "vanguard_dependency": false,
            "launch_disabled": false,
            "secondary_patchlines": []
          }
        ]
      },
      { "id": "bacon", "patchlines": [] }
    ]"#;

    fn league_fixture() -> Product {
        serde_json::from_str::<Vec<Product>>(RECORDED)
            .unwrap()
            .into_iter()
            .find(|p| p.id == LEAGUE_PRODUCT_ID)
            .unwrap()
    }

    #[test]
    fn parses_the_recorded_response() {
        let league = league_fixture();
        assert_eq!(league.patchlines.len(), 2);

        let live = league.patchline("live").unwrap();
        assert_eq!(live.full_name, "League of Legends");
        assert_eq!(live.release_id, "ED5FB7B738681EE8");
        assert_eq!(live.primary_executable, "LeagueClient.exe");
        assert!(live.vanguard_dependency);
    }

    /// The whole reason to prefer this over `…/eligibility`, which answers
    /// `true` for a patchline that is not on the machine at all.
    #[test]
    fn an_empty_install_path_means_not_installed() {
        let league = league_fixture();
        assert!(league.patchline("live").unwrap().is_installed());
        assert!(!league.patchline("pbe").unwrap().is_installed());

        let installed: Vec<&str> = league
            .installed_patchlines()
            .map(|p| p.id.as_str())
            .collect();
        assert_eq!(installed, vec!["live"]);
    }

    /// `Game` is a declared relative path. Deriving it is the point.
    #[test]
    fn game_dir_comes_from_the_declared_secondary_patchline() {
        let league = league_fixture();
        let live = league.patchline("live").unwrap();

        assert_eq!(
            live.game_dir().unwrap(),
            PathBuf::from("C:/Riot Games/League of Legends").join("Game")
        );
        assert_eq!(
            live.install_root().unwrap(),
            PathBuf::from("C:/Riot Games/League of Legends")
        );
    }

    /// An installed patchline that declares no `game_patch` must not silently
    /// fall back to a hardcoded `Game` - that guess is exactly what this
    /// endpoint exists to remove.
    #[test]
    fn a_missing_game_patch_yields_no_game_dir() {
        let patchline: Patchline = serde_json::from_str(
            r#"{ "id": "live", "install_full_path": "C:/Games/LoL", "secondary_patchlines": [] }"#,
        )
        .unwrap();

        assert!(patchline.is_installed());
        assert!(patchline.game_dir().is_none());
    }

    #[test]
    fn an_uninstalled_patchline_has_neither_path() {
        let league = league_fixture();
        let pbe = league.patchline("pbe").unwrap();
        assert!(pbe.install_root().is_none());
        assert!(pbe.game_dir().is_none());
    }

    /// The namespace is absent from swagger and already split across `v1`/`v4`,
    /// so it *will* grow and rename fields. Neither may break parsing.
    #[test]
    fn tolerates_unknown_keys_and_missing_ones() {
        let products: Vec<Product> = serde_json::from_str(
            r#"[{ "id": "league_of_legends", "brand_new_key": { "nested": 1 },
                  "patchlines": [{ "id": "live", "another_new_one": true }] }]"#,
        )
        .unwrap();

        let live = products[0].patchline("live").unwrap();
        assert!(!live.is_installed());
        assert_eq!(live.release_id, "");
        assert!(live.secondary_patchlines.is_empty());
    }

    /// Insurance for the day the odd camelCase spelling is normalised.
    #[test]
    fn accepts_either_spelling_of_the_relative_path() {
        for body in [
            r#"{ "id": "game_patch", "relativePath": "Game" }"#,
            r#"{ "id": "game_patch", "relative_path": "Game" }"#,
        ] {
            let secondary: SecondaryPatchline = serde_json::from_str(body).unwrap();
            assert_eq!(secondary.relative_path, "Game");
        }
    }

    #[test]
    fn no_league_product_yields_nothing() {
        let products: Vec<Product> = serde_json::from_str(r#"[{ "id": "valorant" }]"#).unwrap();
        assert!(!products.iter().any(|p| p.id == LEAGUE_PRODUCT_ID));
    }

    /// Manual probe: dumps what *this* machine's Riot Client actually returns.
    ///
    /// The recorded fixture above is a trimmed copy of a real response, so this
    /// is how to check that the real one still parses after a client update -
    /// and the only way to see fields we don't model yet.
    ///
    /// ```text
    /// cargo test -p ltk-riot-client product_registry_probe -- --ignored --nocapture
    /// ```
    #[test]
    #[ignore = "requires a running Riot Client"]
    fn product_registry_probe() {
        let Some(lockfile) = live_lockfile() else {
            println!("no live Riot Client; nothing to probe");
            return;
        };

        let raw: Option<serde_json::Value> =
            http::get_json(&lockfile, "/rnet-product-registry/v4/products");
        match raw {
            Some(value) => println!("raw:\n{}", serde_json::to_string_pretty(&value).unwrap()),
            None => println!("the client did not answer (tray-idle?)"),
        }

        println!("parsed league: {:#?}", league(&lockfile));
        println!("detected root: {:?}", detect_league_install_root());
    }
}
