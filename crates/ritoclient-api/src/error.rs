//! Why a request to the Riot Client failed.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Why a launch request could not be delivered.
///
/// These deliberately do not share one code: each variant has a different
/// remedy ("set your League path", "open the Riot Client", "close League"), so a
/// host can map each to its own error code and branch on that.
///
/// Read-only queries do not use this type - they answer `Option`, because the
/// caller always has a fallback and "the client didn't tell us" is not a failure
/// worth surfacing.
#[derive(Debug, Clone, Serialize, Deserialize, Error)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(
    tag = "kind",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
pub enum LauncherError {
    /// No `RiotClientInstalls.json`, or nothing in it resolves to an exe that
    /// exists on disk.
    #[error("Could not find the Riot Client that owns this League installation")]
    RiotClientNotFound { installs_path: String },

    /// A client is alive and holding the lockfile, but it never answered with
    /// the 204 that means it took the launch args. Cold-starting over it would
    /// terminate the user's session, so this is terminal.
    #[error("The Riot Client did not accept the launch request: {reason}")]
    RiotClientUnreachable { reason: String },

    /// `LeagueClient.exe` is already up. Mods only apply to a fresh launch, so
    /// handing more args to the client would silently do nothing useful.
    #[error("League of Legends is already running")]
    LeagueAlreadyRunning,

    /// `RiotClientServices.exe` could not be spawned.
    #[error("Could not start the Riot Client: {reason}")]
    SpawnFailed { reason: String },

    #[error("Launching League is only supported on Windows")]
    UnsupportedPlatform,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The `kind` tag is what the shell matches on to pick an `ErrorCode`.
    #[test]
    fn variants_serialize_with_a_kind_tag() {
        let json = serde_json::to_value(LauncherError::LeagueAlreadyRunning).unwrap();
        assert_eq!(json["kind"], "LEAGUE_ALREADY_RUNNING");

        let json = serde_json::to_value(LauncherError::RiotClientNotFound {
            installs_path: "C:/ProgramData/Riot Games/RiotClientInstalls.json".to_string(),
        })
        .unwrap();
        assert_eq!(json["kind"], "RIOT_CLIENT_NOT_FOUND");
        assert_eq!(
            json["installsPath"],
            "C:/ProgramData/Riot Games/RiotClientInstalls.json"
        );
    }
}
