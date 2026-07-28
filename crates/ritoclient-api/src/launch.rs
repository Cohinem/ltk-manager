//! Starting League of Legends through the Riot Client.
//!
//! We only *ask* for a launch - never spawning `LeagueClient.exe` ourselves.
//! That executable's argv carries an `rso_auth.authorization-key` blob only an
//! authenticated Riot Client can mint, so any design that starts the game
//! directly is wrong regardless of how tempting the process tree makes it look.
//!
//! Two routes deliver the request, and picking the right one matters more than
//! it looks: Riot's process singleton is an exclusive lock on the lockfile, and
//! a second `RiotClientServices.exe` that fails to hand off its argv within
//! five seconds **terminates the running client** and takes the lock. So we
//! always probe the lockfile first and only cold-start when nothing is alive.
//!
//! Windows only. Everything else gets [`LauncherError::UnsupportedPlatform`].

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::LauncherError;
use crate::progress::{LaunchObserver, LaunchProgress, LaunchStage};

/// Which product and patchline to launch.
///
/// These are data, not an enum to invent: `league_of_legends` / `live` is what
/// the client's own product registry uses, `pbe` exists as a patchline, and
/// anything else should come from configuration rather than a guess.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct LaunchTarget {
    pub product_id: String,
    pub patchline_id: String,
}

impl Default for LaunchTarget {
    fn default() -> Self {
        Self {
            product_id: crate::product_registry::LEAGUE_PRODUCT_ID.to_string(),
            patchline_id: crate::product_registry::LIVE_PATCHLINE_ID.to_string(),
        }
    }
}

/// How the launch request was delivered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LaunchRoute {
    /// Handed to an already-running Riot Client over its remoting API.
    ExistingClient,
    /// Cold-started `RiotClientServices.exe`.
    ColdStart,
    /// `LeagueClient.exe` was already up, so no request was sent. An outcome
    /// rather than an error - what to do about it is the caller's business.
    AlreadyRunning,
}

/// The result of a successful launch request.
///
/// "Successful" means the Riot Client took the request, not that League is up:
/// the client may still be updating itself, or waiting for the user to log in.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct LaunchOutcome {
    pub route: LaunchRoute,
    /// Pid of the Riot Client - the one we spawned on a cold start, the one
    /// from the lockfile otherwise.
    pub riot_client_pid: Option<u32>,
    /// The session id the client minted, when it told us one. This is the key
    /// into `/product-session/v1/external-sessions`, so it is what a future
    /// "did League actually start?" check should follow rather than scanning
    /// for a process name.
    pub session_id: Option<String>,
}

/// Whether a launch is possible right now, and why not if it isn't.
///
/// Drives the button's disabled state, so it never fails: an unanswerable
/// question resolves to "can't launch" rather than an error the UI has to
/// render.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct LaunchAvailability {
    /// Whether the platform supports launching and a Riot Client was resolved.
    pub can_launch: bool,
    /// The resolved `RiotClientServices.exe`, when one was found.
    pub riot_client_path: Option<String>,
    /// Whether a Riot Client is alive, i.e. whether a launch would take the
    /// handoff route rather than cold-starting.
    pub riot_client_running: bool,
    /// Whether `LeagueClient.exe` is already up.
    pub league_running: bool,
}

/// Ask the Riot Client to launch League.
///
/// `league_path` is the game's install root, used only to pick the Riot Client
/// that owns *this* install; `None` falls back to the machine's default client.
///
/// Returns as soon as the request is delivered. Callers that need to know the
/// game actually started must observe that separately.
///
/// Progress arrives on `observer` as [`LaunchStage`]s. They matter more here
/// than in most operations: a client booting from the tray can hold this call
/// for most of a minute, and silence for that long is indistinguishable from a
/// crash.
pub fn launch_league(
    league_path: Option<&Path>,
    target: &LaunchTarget,
    observer: &dyn LaunchObserver,
) -> Result<LaunchOutcome, LauncherError> {
    let result = launch_league_inner(league_path, target, observer);

    // One terminal event per launch, on every exit path, so a listener always
    // gets told the request is over.
    let stage = match &result {
        Ok(outcome) if outcome.route == LaunchRoute::AlreadyRunning => LaunchStage::AlreadyRunning,
        Ok(_) => LaunchStage::Launched,
        Err(_) => LaunchStage::Error,
    };
    observer.on_progress(LaunchProgress::at(stage));

    result
}

fn launch_league_inner(
    league_path: Option<&Path>,
    target: &LaunchTarget,
    observer: &dyn LaunchObserver,
) -> Result<LaunchOutcome, LauncherError> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (league_path, target, observer);
        Err(LauncherError::UnsupportedPlatform)
    }

    #[cfg(target_os = "windows")]
    {
        observer.on_progress(LaunchProgress::at(LaunchStage::Resolving));

        if crate::processes::league_client_running() {
            tracing::info!("League is already running; there is nothing to launch");
            return Ok(LaunchOutcome {
                route: LaunchRoute::AlreadyRunning,
                riot_client_pid: crate::lockfile::live_lockfile().map(|l| l.pid),
                session_id: None,
            });
        }

        let installs_path = crate::installs::default_installs_path();
        let riot_client_exe = crate::installs::resolve_riot_client(&installs_path, league_path)?;
        tracing::debug!("Resolved Riot Client: {}", riot_client_exe.display());

        match crate::lockfile::live_lockfile() {
            Some(lockfile) => hand_off(&lockfile, target, observer),
            None => {
                observer.on_progress(LaunchProgress::at(LaunchStage::ColdStart));
                let pid = crate::spawn::cold_start(&riot_client_exe, target)?;
                Ok(LaunchOutcome {
                    route: LaunchRoute::ColdStart,
                    riot_client_pid: Some(pid),
                    session_id: None,
                })
            }
        }
    }
}

/// Deliver a launch to a Riot Client that is already up.
///
/// The happy path is one POST to the product-launcher. Anything short of that -
/// a tray-idle client that has not loaded the plugin, one still booting, one
/// whose remoting listener is restarting - is a "not yet": we nudge it and wait,
/// rather than reporting a failure for a client that is merely busy.
#[cfg(target_os = "windows")]
fn hand_off(
    lockfile: &crate::Lockfile,
    target: &LaunchTarget,
    observer: &dyn LaunchObserver,
) -> Result<LaunchOutcome, LauncherError> {
    use crate::product_launcher::{self, LaunchAttempt};

    if product_launcher::is_eligible(lockfile, target) == Some(false) {
        tracing::warn!(
            "Riot Client reports {}/{} is not eligible to launch",
            target.product_id,
            target.patchline_id
        );
    }

    observer.on_progress(LaunchProgress::at(LaunchStage::HandingOff));

    crate::window::allow_foreground();
    match product_launcher::launch_product(lockfile, target) {
        Ok(LaunchAttempt::Launched { session_id }) => Ok(LaunchOutcome {
            route: LaunchRoute::ExistingClient,
            riot_client_pid: Some(lockfile.pid),
            session_id,
        }),
        Ok(LaunchAttempt::NotReady { reason }) => {
            tracing::info!("Riot Client cannot take the request yet ({reason}); waking it");
            observer.on_progress(LaunchProgress::at(LaunchStage::WakingClient));

            // Best-effort. A client whose listener is restarting refuses the
            // wake for the same reason it refused the launch, and the wait below
            // is what recovers from that - failing here would report the client
            // unreachable while it was busy becoming reachable.
            if let Err(e) = crate::app_args::wake_with_launch_args(target) {
                tracing::debug!("Could not wake the Riot Client: {e}");
            }
            wait_for_launcher(lockfile.pid, target, observer)
        }
        // A refusal is not necessarily the client's final answer - see the
        // grace period in [`wait_for_launcher`]. No wake: a client that can
        // refuse is awake enough, it just is not caught up yet.
        Err(refused @ LauncherError::LaunchRefused { .. }) => {
            tracing::info!("{refused}; giving the client a chance to catch up");
            wait_for_launcher(lockfile.pid, target, observer)
        }
        Err(e) => Err(e),
    }
}

/// Poll a waking client until its product-launcher answers.
///
/// **The lockfile is re-read every iteration on purpose.** Waking the client
/// restarts its remoting server on a *new port* under the same pid, so a cached
/// port is dead within a second of the wake - caching it here would produce an
/// intermittent failure that only reproduces on tray-idle clients.
#[cfg(target_os = "windows")]
fn wait_for_launcher(
    riot_client_pid: u32,
    target: &LaunchTarget,
    observer: &dyn LaunchObserver,
) -> Result<LaunchOutcome, LauncherError> {
    use std::time::{Duration, Instant};

    use crate::product_launcher::{self, LaunchAttempt};

    /// Booting from the tray is tens of seconds on a cold disk, and the client
    /// may self-update on the way up. Overshooting costs a spinner the user can
    /// watch; undershooting reports a failure for a launch that then happens
    /// anyway, which is worse - the client turns up minutes later with no
    /// explanation attached to it.
    const BOOT_TIMEOUT: Duration = Duration::from_secs(120);
    const POLL_INTERVAL: Duration = Duration::from_secs(1);

    /// How long a refusal is treated as the client not having caught up yet.
    ///
    /// A client that has just woken from the tray answers `eula_not_accepted`
    /// for a few seconds - its gates run against player state it has not
    /// fetched. That is indistinguishable from a player who genuinely has not
    /// accepted the terms, so a refusal is retried for a while and then
    /// reported *as itself*: waiting out the full boot budget would replace a
    /// message the player can act on with "the client never became ready".
    const REFUSAL_GRACE: Duration = Duration::from_secs(30);

    let started = Instant::now();
    let mut last_reason = String::from("the Riot Client did not finish starting up in time");
    let mut refused_since: Option<Instant> = None;

    loop {
        if started.elapsed() >= BOOT_TIMEOUT {
            return Err(LauncherError::RiotClientUnreachable {
                reason: last_reason,
            });
        }

        std::thread::sleep(POLL_INTERVAL);

        observer.on_progress(LaunchProgress::waiting(
            started.elapsed().as_secs() as u32,
            BOOT_TIMEOUT.as_secs() as u32,
        ));

        // The wake args are honoured on some builds, which starts the game
        // without us ever reaching the launcher. That is still a success.
        if crate::processes::league_client_running() {
            tracing::info!("League started from the wake arguments");
            return Ok(LaunchOutcome {
                route: LaunchRoute::ExistingClient,
                riot_client_pid: Some(riot_client_pid),
                session_id: None,
            });
        }

        let Some(lockfile) = crate::lockfile::live_lockfile() else {
            continue;
        };

        // An earlier POST can be accepted and still time out on our side - the
        // client works through gates that outlast our patience. Asking again
        // then would queue a *second* launch for a request already in flight.
        if product_launcher::is_launch_request_pending(&lockfile) == Some(true) {
            tracing::debug!("A launch is already in flight; waiting rather than asking again");
            continue;
        }

        // Transient failures are expected while the client reinitialises, so
        // only the deadline ends this loop - but the last one is kept, because
        // it is the only description of *why* the wait ran out.
        match product_launcher::launch_product(&lockfile, target) {
            Ok(LaunchAttempt::Launched { session_id }) => {
                return Ok(LaunchOutcome {
                    route: LaunchRoute::ExistingClient,
                    riot_client_pid: Some(lockfile.pid),
                    session_id,
                });
            }
            Ok(LaunchAttempt::NotReady { reason }) => {
                tracing::debug!("Riot Client still not ready: {reason}");
                last_reason = format!("the Riot Client never became ready to launch: {reason}");
            }
            Err(refused @ LauncherError::LaunchRefused { .. }) => {
                let since = *refused_since.get_or_insert_with(Instant::now);
                if since.elapsed() >= REFUSAL_GRACE {
                    return Err(refused);
                }
                tracing::debug!("{refused}; still within the grace period");
            }
            Err(e) => return Err(e),
        }
    }
}

/// Whether a launch is possible right now. Never fails.
pub fn launch_availability(league_path: Option<&Path>) -> LaunchAvailability {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = league_path;
        LaunchAvailability::default()
    }

    #[cfg(target_os = "windows")]
    {
        let riot_client_path = crate::installs::resolve_riot_client(
            &crate::installs::default_installs_path(),
            league_path,
        )
        .ok();

        LaunchAvailability {
            can_launch: riot_client_path.is_some(),
            riot_client_path: riot_client_path.map(|p| p.display().to_string()),
            riot_client_running: crate::lockfile::live_lockfile().is_some(),
            league_running: crate::processes::league_client_running(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::path::PathBuf;
    use std::sync::Mutex;

    /// Captures the stages a launch reported, in order.
    #[derive(Default)]
    struct RecordingObserver(Mutex<Vec<LaunchStage>>);

    impl RecordingObserver {
        fn stages(&self) -> Vec<LaunchStage> {
            self.0.lock().unwrap().clone()
        }
    }

    impl LaunchObserver for RecordingObserver {
        fn on_progress(&self, progress: LaunchProgress) {
            self.0.lock().unwrap().push(progress.stage);
        }
    }

    fn configured_league_path() -> Option<PathBuf> {
        std::env::var("LTK_LEAGUE_PATH").ok().map(PathBuf::from)
    }

    #[test]
    fn default_target_is_live_league() {
        let target = LaunchTarget::default();
        assert_eq!(target.product_id, "league_of_legends");
        assert_eq!(target.patchline_id, "live");
    }

    #[test]
    fn route_serializes_for_the_frontend() {
        let json = serde_json::to_value(LaunchRoute::ExistingClient).unwrap();
        assert_eq!(json, "EXISTING_CLIENT");

        let json = serde_json::to_value(LaunchRoute::AlreadyRunning).unwrap();
        assert_eq!(json, "ALREADY_RUNNING");
    }

    #[test]
    fn outcome_serializes_camel_case() {
        let json = serde_json::to_value(LaunchOutcome {
            route: LaunchRoute::ColdStart,
            riot_client_pid: Some(4242),
            session_id: Some("irnZWC1kOMt".to_string()),
        })
        .unwrap();
        assert_eq!(json["route"], "COLD_START");
        assert_eq!(json["riotClientPid"], 4242);
        assert_eq!(json["sessionId"], "irnZWC1kOMt");
    }

    /// Nothing is launchable without a Riot Client, and the query must answer
    /// rather than fail - the button state depends on it.
    #[test]
    fn availability_defaults_to_not_launchable() {
        let availability = LaunchAvailability::default();
        assert!(!availability.can_launch);
        assert!(!availability.league_running);
    }

    /// Manual smoke check: prints what the launcher sees on *this* machine.
    ///
    /// Ignored because it depends on a real Riot install and on whether the
    /// client happens to be running. It is the cheap first step of the manual
    /// QA pass - it exercises discovery, lockfile parsing and the liveness
    /// probe against real state without launching anything:
    ///
    /// ```text
    /// cargo test -p ritoclient-api launcher_smoke -- --ignored --nocapture
    /// ```
    ///
    /// Set `LTK_LEAGUE_PATH` to exercise the `associated_client` lookup too;
    /// without it only the `rc_default` / `rc_live` fallbacks are covered.
    #[test]
    #[ignore = "requires a real Riot Games install"]
    fn launcher_smoke() {
        let league_path = configured_league_path();

        println!(
            "installs file: {}",
            crate::installs::default_installs_path().display()
        );
        println!("league path:   {league_path:?}");
        println!("{:#?}", launch_availability(league_path.as_deref()));
    }

    /// Manual check that actually launches League through the real code path.
    ///
    /// The counterpart to [`launcher_smoke`]: that one proves we can *see* the
    /// client, this one proves we can drive it, without a UI in the way.
    ///
    /// It also prints the stage sequence, which is the only way to see the
    /// tray-idle path (`wakingClient` → `waitingForClient` × n) actually
    /// happen - no unit test can reach it.
    ///
    /// ```text
    /// cargo test -p ritoclient-api launch_league_for_real -- --ignored --nocapture
    /// ```
    #[test]
    #[ignore = "starts League of Legends"]
    fn launch_league_for_real() {
        let observer = RecordingObserver::default();
        let result = launch_league(
            configured_league_path().as_deref(),
            &LaunchTarget::default(),
            &observer,
        );

        println!("stages: {:?}", observer.stages());
        match result {
            Ok(outcome) => println!("{outcome:#?}"),
            Err(e) => panic!("launch failed: {e}"),
        }
    }

    /// Doubles as the coverage for the wrapper's terminal-event guarantee: a
    /// launch must announce that it is over on *every* exit path, or a listener
    /// leaves its spinner up forever.
    ///
    /// Only the unsupported-platform path can be exercised as a unit test. Any
    /// call on Windows would resolve a real Riot Client and start the game, so
    /// the Windows paths belong to [`launch_league_for_real`] instead.
    #[cfg(not(target_os = "windows"))]
    #[test]
    fn launching_is_windows_only() {
        let observer = RecordingObserver::default();
        let error = launch_league(None, &LaunchTarget::default(), &observer).unwrap_err();

        assert!(matches!(error, LauncherError::UnsupportedPlatform));
        assert_eq!(observer.stages(), vec![LaunchStage::Error]);
    }
}
