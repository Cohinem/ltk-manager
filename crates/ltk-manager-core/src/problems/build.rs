//! The build of the installed game, in one small file read.
//!
//! `Game/content-metadata.json` names the content build the install is on. A
//! rule whose table is keyed by build compares the two directly, because the
//! table's filename carries the same `<major>.<minor>.<build>` shape.

use std::fmt;
use std::path::Path;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::utils::game::GameDir;

/// The file the game states its content build in, under the `Game` directory.
const METADATA_FILE: &str = "content-metadata.json";

/// A game content build, as `<major>.<minor>.<build>`.
///
/// Ordered by the three numbers in that order, which is the order Riot ships
/// them in, so comparing an install against a table is one comparison.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GameBuild {
    major: u32,
    minor: u32,
    build: u32,
}

impl GameBuild {
    /// A build from its three numbers.
    #[must_use]
    pub const fn new(major: u32, minor: u32, build: u32) -> Self {
        Self {
            major,
            minor,
            build,
        }
    }

    /// The patch a player names, as `<major>.<minor>`.
    ///
    /// A build is `16.17.8087655` and the patch notes call it 16.17, so this is
    /// the half of a build a modder recognises.
    #[must_use]
    pub fn patch(&self) -> String {
        format!("{}.{}", self.major, self.minor)
    }

    /// Read the installed game's content build.
    ///
    /// Returns `None` where no League path is configured, the file is absent,
    /// or the version it holds is not a shape this understands. Every caller
    /// has a fallback, and "the install did not say" is not a failure worth
    /// showing a user.
    #[must_use]
    pub fn installed(config: &Config) -> Option<Self> {
        let game_dir = GameDir::resolve(config).ok()?;
        Self::read(game_dir.path())
    }

    /// Read the content build out of a `Game` directory.
    #[must_use]
    pub fn read(game_dir: &Path) -> Option<Self> {
        let text = std::fs::read_to_string(game_dir.join(METADATA_FILE))
            .inspect_err(|e| tracing::debug!("No {METADATA_FILE} under {game_dir:?}: {e}"))
            .ok()?;
        let metadata: ContentMetadata = serde_json::from_str(&text)
            .inspect_err(|e| tracing::debug!("Could not read {METADATA_FILE}: {e}"))
            .ok()?;
        metadata.version.parse().ok()
    }
}

/// The one field of `content-metadata.json` this reads.
#[derive(Debug, Deserialize)]
struct ContentMetadata {
    /// Such as `16.16.8049184+branch.releases-16-16.content.release`.
    version: String,
}

impl FromStr for GameBuild {
    type Err = ParseBuildError;

    /// Parse a build, ignoring anything after a `+`.
    ///
    /// The game writes `16.16.8049184+branch.releases-16-16.content.release`
    /// and a table filename writes `16.17.8087655`, so both land here.
    fn from_str(text: &str) -> Result<Self, Self::Err> {
        let numbers = text.split('+').next().unwrap_or(text);
        let mut parts = numbers.split('.');
        let mut next = || {
            parts
                .next()
                .and_then(|part| part.parse().ok())
                .ok_or_else(|| ParseBuildError(text.to_owned()))
        };
        Ok(Self {
            major: next()?,
            minor: next()?,
            build: next()?,
        })
    }
}

impl fmt::Display for GameBuild {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.build)
    }
}

impl Serialize for GameBuild {
    fn serialize<S: serde::Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        ser.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for GameBuild {
    fn deserialize<D: serde::Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        let text = String::deserialize(de)?;
        text.parse().map_err(serde::de::Error::custom)
    }
}

/// A version string that is not `<major>.<minor>.<build>`.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("not a game build: {0}")]
pub struct ParseBuildError(String);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_build_parses_out_of_the_games_own_version_string() {
        let build: GameBuild = "16.16.8049184+branch.releases-16-16.content.release"
            .parse()
            .unwrap();
        assert_eq!(build, GameBuild::new(16, 16, 8_049_184));
        assert_eq!(build.to_string(), "16.16.8049184");
    }

    #[test]
    fn a_build_parses_out_of_a_table_filename_stem() {
        assert_eq!(
            "16.17.8087655".parse::<GameBuild>().unwrap(),
            GameBuild::new(16, 17, 8_087_655)
        );
    }

    #[test]
    fn a_version_that_is_not_three_numbers_is_an_error() {
        assert!("16.17".parse::<GameBuild>().is_err());
        assert!("".parse::<GameBuild>().is_err());
        assert!("live".parse::<GameBuild>().is_err());
    }

    /// The install this was measured against is 16.16.8049184 and the first
    /// table is 16.17.8087655, so an install that has not taken the change
    /// yet has to compare as older.
    #[test]
    fn builds_order_by_major_then_minor_then_build() {
        assert!(GameBuild::new(16, 16, 8_049_184) < GameBuild::new(16, 17, 8_087_655));
        assert!(GameBuild::new(16, 17, 8_087_655) < GameBuild::new(17, 1, 1));
        assert!(GameBuild::new(16, 17, 8_087_654) < GameBuild::new(16, 17, 8_087_655));
    }

    #[test]
    fn reading_a_game_directory_takes_the_version_field() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(
            tmp.path().join(METADATA_FILE),
            r#"{ "version": "16.16.8049184+branch.releases-16-16.content.release" }"#,
        )
        .unwrap();

        assert_eq!(
            GameBuild::read(tmp.path()),
            Some(GameBuild::new(16, 16, 8_049_184))
        );
    }

    #[test]
    fn a_missing_or_unreadable_metadata_file_names_no_build() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(GameBuild::read(tmp.path()), None);

        std::fs::write(tmp.path().join(METADATA_FILE), "{ not json").unwrap();
        assert_eq!(GameBuild::read(tmp.path()), None);

        std::fs::write(tmp.path().join(METADATA_FILE), r#"{ "version": "live" }"#).unwrap();
        assert_eq!(GameBuild::read(tmp.path()), None);
    }

    #[test]
    fn a_patch_is_the_two_numbers_a_player_reads() {
        assert_eq!(GameBuild::new(16, 17, 8_087_655).patch(), "16.17");
    }

    #[test]
    fn a_build_crosses_ipc_as_its_own_string() {
        let json = serde_json::to_value(GameBuild::new(16, 17, 8_087_655)).unwrap();
        assert_eq!(json, serde_json::json!("16.17.8087655"));
        assert_eq!(
            serde_json::from_value::<GameBuild>(json).unwrap(),
            GameBuild::new(16, 17, 8_087_655)
        );
    }
}
