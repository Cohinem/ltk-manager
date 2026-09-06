//! The launch shapes that cross the IPC boundary, owned by the manager.
//!
//! Each type here mirrors one from [`ritoclient`] - same fields, same wire
//! spellings - and converts from it. Mirroring rather than re-exporting is what
//! makes an upstream rename a compile error in this file instead of a frontend
//! union that quietly disagrees with the backend: `ts_rs` exports by generating
//! a `#[test]` that writes the file, and Cargo never compiles a dependency's
//! tests, so a re-exported type produces no binding at all.
//!
//! Every enum upstream is `#[non_exhaustive]`, so every mirror carries a
//! catch-all. It says the value is unknown rather than guessing at its nearest
//! neighbour: a variant landing there means this file needs a real one, and
//! wearing another variant's name would hide that.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// How the launch request was delivered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LaunchRoute {
    /// Handed to an already-running Riot Client over its remoting API.
    ExistingClient,
    /// Cold-started the Riot Client, then launched through it once it was up.
    ColdStart,
    /// The game was already up and the client already had a session for it, so
    /// no request was sent.
    AlreadyRunning,
    /// The game was already up and the client did **not** know about it, so it
    /// was handed the pid and opened a session.
    ///
    /// Nothing was launched. What it buys is a session id for a game the
    /// manager did not start, which is what makes a client restarted under a
    /// live game followable rather than a dead end.
    Adopted,
    /// A route this build of the manager does not know, from a newer
    /// [`ritoclient`].
    Unknown,
}

impl From<ritoclient::LaunchRoute> for LaunchRoute {
    fn from(route: ritoclient::LaunchRoute) -> Self {
        match route {
            ritoclient::LaunchRoute::ExistingClient => Self::ExistingClient,
            ritoclient::LaunchRoute::ColdStart => Self::ColdStart,
            ritoclient::LaunchRoute::AlreadyRunning => Self::AlreadyRunning,
            ritoclient::LaunchRoute::Adopted => Self::Adopted,
            _ => Self::Unknown,
        }
    }
}

impl LaunchRoute {
    /// Whether the game was already up, so nothing was actually launched.
    ///
    /// The test both routes that end that way must share: hiding a window out
    /// from under a session the manager merely found is the same lie as hiding
    /// one it never asked for.
    pub fn found_a_running_game(self) -> bool {
        matches!(self, Self::AlreadyRunning | Self::Adopted)
    }
}

/// The result of a successful launch request.
///
/// "Successful" means the Riot Client took the request, not that the game is
/// up: the client may still be updating itself, or waiting for a login.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct LaunchOutcome {
    pub route: LaunchRoute,
    /// Pid of the Riot Client - the one spawned on a cold start, the one from
    /// the lockfile otherwise.
    pub riot_client_pid: Option<u32>,
    /// The session id the client minted, when it told us one.
    ///
    /// Present on every route that had one to give, [`LaunchRoute::AlreadyRunning`]
    /// included. It is what answers "did the game actually start?", and the
    /// manager follows it rather than scanning for a process name.
    pub session_id: Option<String>,
}

impl From<ritoclient::LaunchOutcome> for LaunchOutcome {
    fn from(outcome: ritoclient::LaunchOutcome) -> Self {
        Self {
            route: outcome.route.into(),
            riot_client_pid: outcome.riot_client_pid,
            session_id: outcome.session_id,
        }
    }
}

/// Stage of a League launch request.
///
/// A launch is one blocking call that can spend a minute inside a single step,
/// waking a tray-idle client. Without these the frontend cannot tell that wait
/// apart from a hang.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub enum LaunchStage {
    /// Locating `RiotClientServices.exe` and checking what is already running.
    Resolving,
    /// Asking a running client to launch the product.
    HandingOff,
    /// Starting a Riot Client because none was running.
    ColdStart,
    /// Nudging a client that is idling in the tray.
    WakingClient,
    /// Waiting for that client to finish booting.
    WaitingForClient,
    /// The client accepted the request. Terminal.
    Launched,
    /// The game was already up, so nothing was launched. Terminal.
    AlreadyRunning,
    /// The user called the launch off. Terminal, and **not** a failure - a
    /// listener must not put an error dialog behind its own Cancel button.
    Stopped,
    /// The request failed. Terminal, and the error is reported separately.
    Error,
    /// A stage this build of the manager does not know, from a newer
    /// [`ritoclient`]. Not terminal, because there is no way to tell whether it
    /// should be.
    Unknown,
}

impl From<ritoclient::LaunchStage> for LaunchStage {
    fn from(stage: ritoclient::LaunchStage) -> Self {
        match stage {
            ritoclient::LaunchStage::Resolving => Self::Resolving,
            ritoclient::LaunchStage::HandingOff => Self::HandingOff,
            ritoclient::LaunchStage::ColdStart => Self::ColdStart,
            ritoclient::LaunchStage::WakingClient => Self::WakingClient,
            ritoclient::LaunchStage::WaitingForClient => Self::WaitingForClient,
            ritoclient::LaunchStage::Launched => Self::Launched,
            ritoclient::LaunchStage::AlreadyRunning => Self::AlreadyRunning,
            ritoclient::LaunchStage::Stopped => Self::Stopped,
            ritoclient::LaunchStage::Error => Self::Error,
            _ => Self::Unknown,
        }
    }
}

/// Progress of a League launch request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct LaunchProgress {
    pub stage: LaunchStage,
    /// Seconds spent waiting for the client so far. Only meaningful during
    /// [`LaunchStage::WaitingForClient`], zero everywhere else.
    pub waited_secs: u32,
    /// How long that wait may run before it gives up. Zero outside the wait.
    pub timeout_secs: u32,
}

impl LaunchProgress {
    /// A stage that involves no waiting.
    pub fn at(stage: LaunchStage) -> Self {
        Self {
            stage,
            waited_secs: 0,
            timeout_secs: 0,
        }
    }
}

impl From<ritoclient::LaunchProgress> for LaunchProgress {
    fn from(progress: ritoclient::LaunchProgress) -> Self {
        Self {
            stage: progress.stage.into(),
            waited_secs: progress.waited_secs,
            timeout_secs: progress.timeout_secs,
        }
    }
}

/// Why a launch request could not be delivered.
///
/// Each variant has a different remedy ("set your game path", "open the Riot
/// Client"), so each gets its own `ErrorCode` in the shell rather than sharing
/// one with a discriminating field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Error)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(
    tag = "kind",
    rename_all = "SCREAMING_SNAKE_CASE",
    rename_all_fields = "camelCase"
)]
pub enum LauncherError {
    /// No `RiotClientInstalls.json`, or nothing in it resolves to an exe on
    /// disk.
    #[error("Could not find the Riot Client that owns this game installation")]
    RiotClientNotFound { installs_path: String },

    /// A client is alive and holding the lockfile, but never answered that it
    /// took the launch args. Cold-starting over it would terminate the user's
    /// session, so this is terminal.
    #[error("The Riot Client did not accept the launch request: {reason}")]
    RiotClientUnreachable { reason: String },

    /// The client understood the request and refused it - the Terms of Service
    /// are unaccepted, the game is out of date, the patchline is locked. The
    /// remedy is always something the player does in the Riot Client itself,
    /// and `riot_error_code` is Riot's own machine-readable tag for which one.
    #[error("The Riot Client refused the request: {message}")]
    Refused {
        riot_error_code: String,
        message: String,
    },

    /// The user called the launch off while it was waiting.
    ///
    /// Nothing failed, so nothing may be shown as a failure - a toast saying
    /// the launch broke, behind a Cancel button the user just pressed, is the
    /// one outcome this variant exists to prevent. Stopping abandons the wait
    /// and not the launch: a request the client already accepted still starts
    /// a game.
    #[error("The launch was cancelled")]
    Stopped,

    /// The launcher was built with something it cannot use. A bug here rather
    /// than a condition the user can clear.
    #[error("The launcher is misconfigured: {reason}")]
    Misconfigured { reason: String },

    /// `RiotClientServices.exe` could not be spawned.
    #[error("Could not start the Riot Client: {reason}")]
    SpawnFailed { reason: String },

    #[error("Launching is only supported on Windows")]
    UnsupportedPlatform,

    /// A failure this build of the manager does not know, from a newer
    /// [`ritoclient`], carrying that error's own prose.
    #[error("{message}")]
    Other { message: String },
}

impl From<ritoclient::LauncherError> for LauncherError {
    fn from(error: ritoclient::LauncherError) -> Self {
        match error {
            ritoclient::LauncherError::RiotClientNotFound { installs_path } => {
                Self::RiotClientNotFound { installs_path }
            }
            ritoclient::LauncherError::RiotClientUnreachable { reason } => {
                Self::RiotClientUnreachable { reason }
            }
            ritoclient::LauncherError::Refused {
                riot_error_code,
                message,
            } => Self::Refused {
                riot_error_code,
                message,
            },
            ritoclient::LauncherError::Stopped => Self::Stopped,
            ritoclient::LauncherError::Misconfigured { reason } => Self::Misconfigured { reason },
            ritoclient::LauncherError::SpawnFailed { reason } => Self::SpawnFailed { reason },
            ritoclient::LauncherError::UnsupportedPlatform => Self::UnsupportedPlatform,
            other => Self::Other {
                message: other.to_string(),
            },
        }
    }
}

/// The Riot Client opened a session, at the phase it opened in.
///
/// The first thing a watched session reports, and the point at which the
/// manager knows a launch produced something rather than merely being accepted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SessionStarted {
    /// The Riot Client's own spelling, e.g. `Pending` or `Gameplay`. Passed
    /// through rather than mapped: a phase this build does not know is still
    /// worth showing, and a label invented for it would not be.
    ///
    /// Read it as what the *match* is doing. It is not the test for whether
    /// League is up - see [`SessionStarted::running`].
    pub phase: String,
    /// Whether `LeagueClient.exe` is up.
    ///
    /// The fact the manager acts on, because it is when mods reach a game. The
    /// phase does not answer it: a player sitting in the client reports phase
    /// `None` with the process very much alive.
    ///
    /// False for the ordinary launch, where the client mints the session a few
    /// seconds before the process appears, and true for a session adopted or
    /// recovered under a game that was already running.
    pub running: bool,
    /// The content release the session is running, e.g. `24C2E5A086AFFB82` -
    /// the client's own `version` field, which is a release id rather than the
    /// patch number a player would recognise.
    pub version: String,
}

/// A watched session's phase moved.
///
/// What the match is doing, and nothing about whether League is up - that
/// arrives as [`SessionGameRunning`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SessionChanged {
    /// The Riot Client's own spelling for the phase it moved to.
    pub phase: String,
}

/// The game appeared, or went away, during a live session.
///
/// The event the status bar and the patcher care about. It arrives on a change
/// only - the reading at the moment the session opened rides on
/// [`SessionStarted::running`] instead.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SessionGameRunning {
    /// Whether `LeagueClient.exe` is up.
    pub running: bool,
}

/// A watched session ended.
///
/// Both fields are absent when the Riot Client exited and took the session
/// record with it while the game also stopped. That is a real ending with
/// nothing to say about why, and the frontend must not word it as a crash.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct SessionEnded {
    /// The game's exit code, as the client recorded it.
    pub exit_code: Option<i64>,
    /// The client's own termination reason, e.g. `Exit` or `Timeout`.
    pub exit_reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The frontend switches on these strings, so a mirror that drifts from the
    /// spelling upstream sends is worse than no mirror at all.
    #[test]
    fn routes_serialize_to_their_wire_names() {
        for (route, expected) in [
            (LaunchRoute::ExistingClient, "\"EXISTING_CLIENT\""),
            (LaunchRoute::ColdStart, "\"COLD_START\""),
            (LaunchRoute::AlreadyRunning, "\"ALREADY_RUNNING\""),
            (LaunchRoute::Adopted, "\"ADOPTED\""),
            (LaunchRoute::Unknown, "\"UNKNOWN\""),
        ] {
            assert_eq!(serde_json::to_string(&route).unwrap(), expected);
        }
    }

    #[test]
    fn stages_serialize_to_their_wire_names() {
        for (stage, expected) in [
            (LaunchStage::Resolving, "\"resolving\""),
            (LaunchStage::HandingOff, "\"handingOff\""),
            (LaunchStage::ColdStart, "\"coldStart\""),
            (LaunchStage::WakingClient, "\"wakingClient\""),
            (LaunchStage::WaitingForClient, "\"waitingForClient\""),
            (LaunchStage::Launched, "\"launched\""),
            (LaunchStage::AlreadyRunning, "\"alreadyRunning\""),
            (LaunchStage::Stopped, "\"stopped\""),
            (LaunchStage::Error, "\"error\""),
            (LaunchStage::Unknown, "\"unknown\""),
        ] {
            assert_eq!(serde_json::to_string(&stage).unwrap(), expected);
        }
    }

    /// The `kind` tag is what the toast reads to tell a refusal apart from a
    /// failure, and `riotErrorCode` is what it reads to explain one.
    #[test]
    fn launcher_errors_serialize_with_a_kind_tag() {
        let json = serde_json::to_value(LauncherError::UnsupportedPlatform).unwrap();
        assert_eq!(json["kind"], "UNSUPPORTED_PLATFORM");

        let json = serde_json::to_value(LauncherError::Stopped).unwrap();
        assert_eq!(json["kind"], "STOPPED");

        let json = serde_json::to_value(LauncherError::Refused {
            riot_error_code: "eula_not_accepted".to_string(),
            message: "Accept the Terms of Service".to_string(),
        })
        .unwrap();
        assert_eq!(json["kind"], "REFUSED");
        assert_eq!(json["riotErrorCode"], "eula_not_accepted");

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

    /// The mirrors exist to catch an upstream rename here rather than in the
    /// frontend, which only works if every variant is actually converted.
    #[test]
    fn every_upstream_variant_is_mirrored() {
        for (upstream, expected) in [
            (
                ritoclient::LaunchRoute::ExistingClient,
                LaunchRoute::ExistingClient,
            ),
            (ritoclient::LaunchRoute::ColdStart, LaunchRoute::ColdStart),
            (
                ritoclient::LaunchRoute::AlreadyRunning,
                LaunchRoute::AlreadyRunning,
            ),
            (ritoclient::LaunchRoute::Adopted, LaunchRoute::Adopted),
        ] {
            assert_eq!(LaunchRoute::from(upstream), expected);
        }

        for (upstream, expected) in [
            (ritoclient::LaunchStage::Resolving, LaunchStage::Resolving),
            (ritoclient::LaunchStage::HandingOff, LaunchStage::HandingOff),
            (ritoclient::LaunchStage::ColdStart, LaunchStage::ColdStart),
            (
                ritoclient::LaunchStage::WakingClient,
                LaunchStage::WakingClient,
            ),
            (
                ritoclient::LaunchStage::WaitingForClient,
                LaunchStage::WaitingForClient,
            ),
            (ritoclient::LaunchStage::Launched, LaunchStage::Launched),
            (
                ritoclient::LaunchStage::AlreadyRunning,
                LaunchStage::AlreadyRunning,
            ),
            (ritoclient::LaunchStage::Stopped, LaunchStage::Stopped),
            (ritoclient::LaunchStage::Error, LaunchStage::Error),
        ] {
            assert_eq!(LaunchStage::from(upstream), expected);
        }

        for (upstream, expected) in [
            (ritoclient::LauncherError::Stopped, LauncherError::Stopped),
            (
                ritoclient::LauncherError::UnsupportedPlatform,
                LauncherError::UnsupportedPlatform,
            ),
            (
                ritoclient::LauncherError::Refused {
                    riot_error_code: "eula_not_accepted".to_string(),
                    message: "nope".to_string(),
                },
                LauncherError::Refused {
                    riot_error_code: "eula_not_accepted".to_string(),
                    message: "nope".to_string(),
                },
            ),
            (
                ritoclient::LauncherError::Misconfigured {
                    reason: "empty".to_string(),
                },
                LauncherError::Misconfigured {
                    reason: "empty".to_string(),
                },
            ),
        ] {
            assert_eq!(LauncherError::from(upstream), expected);
        }
    }

    /// Neither route launched anything, and the hider keys off exactly this.
    #[test]
    fn only_the_two_already_up_routes_found_a_running_game() {
        assert!(LaunchRoute::AlreadyRunning.found_a_running_game());
        assert!(LaunchRoute::Adopted.found_a_running_game());
        assert!(!LaunchRoute::ColdStart.found_a_running_game());
        assert!(!LaunchRoute::ExistingClient.found_a_running_game());
        assert!(!LaunchRoute::Unknown.found_a_running_game());
    }

    /// The wait is the only determinate part of a launch, so both numbers have
    /// to survive the mirror or its progress bar turns back into a spinner.
    #[test]
    fn waiting_progress_keeps_both_numbers() {
        let progress = LaunchProgress::from(ritoclient::LaunchProgress::waiting(12, 60));
        let json = serde_json::to_value(&progress).unwrap();

        assert_eq!(json["stage"], "waitingForClient");
        assert_eq!(json["waitedSecs"], 12);
        assert_eq!(json["timeoutSecs"], 60);
    }

    #[test]
    fn session_payloads_serialize_as_camel_case() {
        let json = serde_json::to_value(SessionStarted {
            phase: "None".to_string(),
            running: true,
            version: "24C2E5A086AFFB82".to_string(),
        })
        .unwrap();
        assert_eq!(json["phase"], "None");
        assert_eq!(json["running"], true);
        assert_eq!(json["version"], "24C2E5A086AFFB82");

        let json = serde_json::to_value(SessionGameRunning { running: false }).unwrap();
        assert_eq!(json["running"], false);

        let json = serde_json::to_value(SessionEnded {
            exit_code: Some(1),
            exit_reason: Some("Exit".to_string()),
        })
        .unwrap();
        assert_eq!(json["exitCode"], 1);
        assert_eq!(json["exitReason"], "Exit");
    }

    /// A session the client stopped answering for ends with nothing to say
    /// about why, and the payload has to be able to say that.
    #[test]
    fn a_lost_session_carries_neither_number() {
        let json = serde_json::to_value(SessionEnded {
            exit_code: None,
            exit_reason: None,
        })
        .unwrap();

        assert!(json["exitCode"].is_null());
        assert!(json["exitReason"].is_null());
    }
}
