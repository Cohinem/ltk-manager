//! What a launch and the session it opens announce.

use serde::Serialize;

/// Stage of a League launch request.
///
/// A launch is one blocking call that can spend a minute inside a single step,
/// waking a tray-idle client. Without these the frontend cannot tell that wait
/// apart from a hang.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
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

/// Progress of a League launch request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
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

/// The Riot Client opened a session, at the phase it opened in.
///
/// The first thing a watched session reports, and the point at which the
/// manager knows a launch produced something rather than merely being accepted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
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
#[cfg_attr(feature = "ts", derive(specta::Type))]
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
#[cfg_attr(feature = "ts", derive(specta::Type))]
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
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct SessionEnded {
    /// The game's exit code, as the client recorded it.
    pub exit_code: Option<i64>,
    /// The client's own termination reason, e.g. `Exit` or `Timeout`.
    pub exit_reason: Option<String>,
}
