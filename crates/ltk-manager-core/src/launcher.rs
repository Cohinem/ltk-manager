//! Launching League, adapted to the manager's own types.
//!
//! The work lives in [`ritoclient_api`], which knows nothing about this crate -
//! no [`Config`], no [`EventSink`], no error enum of ours. This module is the
//! seam: it unpacks the config, wraps the sink, and re-exports the types that
//! cross the IPC boundary so callers have one place to import from.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::events::{BackendEvent, EventSink};

pub use ritoclient_api::{LaunchOutcome, LaunchRoute, LaunchTarget, LauncherError};

use ritoclient_api::ids::{patchlines, products};

/// Lowercase basename of the League client.
///
/// [`ritoclient_api`] names no products, so the executable to watch for is
/// supplied from here - this crate is the one that knows the manager is a League
/// tool. `riotclientservices.exe` running is *normal* and must never block a
/// launch; only this one does.
pub const LEAGUE_CLIENT_EXE: &str = "leagueclient.exe";

/// The product and patchline the manager launches by default.
///
/// Deliberately not a `Default` impl on [`LaunchTarget`]: which product to
/// launch is not the API crate's to assume, and a PBE picker will want to pass
/// something else here.
pub fn league_target() -> LaunchTarget {
    LaunchTarget {
        product_id: products::LEAGUE_OF_LEGENDS.to_string(),
        patchline_id: patchlines::LIVE.to_string(),
    }
}

/// Whether a launch is possible right now, and why not if it isn't.
///
/// The manager's own view of [`ritoclient_api::Availability`]: same answers,
/// but named for the one game this application is about, which is what the UI
/// renders against.
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

impl From<ritoclient_api::Availability> for LaunchAvailability {
    fn from(availability: ritoclient_api::Availability) -> Self {
        Self {
            can_launch: availability.can_launch,
            riot_client_path: availability.riot_client_path,
            riot_client_running: availability.riot_client_running,
            league_running: availability.game_running,
        }
    }
}

/// Bridges the crate's launch observer to the manager's event registry.
struct SinkObserver<'a>(&'a dyn EventSink);

impl ritoclient_api::LaunchObserver for SinkObserver<'_> {
    fn on_progress(&self, progress: ritoclient_api::LaunchProgress) {
        self.0.emit(BackendEvent::LaunchProgress(progress));
    }
}

/// Ask the Riot Client to launch League.
///
/// Blocks until the request is delivered, which is most of a minute when the
/// client has to boot from the tray; progress arrives on `events` meanwhile.
pub fn launch_league(
    config: &Config,
    target: &LaunchTarget,
    events: &dyn EventSink,
) -> Result<LaunchOutcome, LauncherError> {
    let outcome = ritoclient_api::launch(
        config.league_path.as_deref(),
        target,
        LEAGUE_CLIENT_EXE,
        &SinkObserver(events),
    )?;

    // Only after the client accepted the request, and only in the background:
    // the game is not up yet, and on a cold start it is minutes away.
    //
    // Nothing was launched on the already-running route, so nothing gets hidden
    // either - the user is told their open client was left alone, and hiding it
    // out from under them would make that a lie.
    if config.hide_riot_client_on_launch && outcome.route != LaunchRoute::AlreadyRunning {
        ritoclient_api::hide_for_play_session(LEAGUE_CLIENT_EXE);
    }

    Ok(outcome)
}

/// Whether a launch is possible right now. Never fails.
pub fn launch_availability(config: &Config) -> LaunchAvailability {
    ritoclient_api::availability(config.league_path.as_deref(), LEAGUE_CLIENT_EXE).into()
}

/// The install root of an installed League patchline, from a client that is
/// running right now.
///
/// Prefers `live`, then any other installed patchline, so a machine with only
/// PBE still detects something. `None` when no client is up or nothing is
/// installed - the caller falls back to scanning disk.
pub fn detect_league_install_root() -> Option<PathBuf> {
    let league = ritoclient_api::Client::new()
        .ok()?
        .product_registry()
        .product(products::LEAGUE_OF_LEGENDS)?;

    league
        .patchline(patchlines::LIVE)
        .filter(|p| p.is_installed())
        .or_else(|| league.installed_patchlines().next())
        .and_then(ritoclient_api::Patchline::install_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::Mutex;

    #[derive(Default)]
    struct RecordingSink(Mutex<Vec<String>>);

    impl EventSink for RecordingSink {
        fn emit(&self, event: BackendEvent) {
            self.0.lock().unwrap().push(event.name().to_string());
        }
    }

    /// The adapter's whole job is that launch progress reaches the sink under
    /// the name the frontend listens for. Nothing else here can prove that.
    #[test]
    fn progress_reaches_the_sink_as_a_launch_event() {
        use ritoclient_api::{LaunchObserver, LaunchProgress, LaunchStage};

        let sink = RecordingSink::default();
        SinkObserver(&sink).on_progress(LaunchProgress::at(LaunchStage::Resolving));

        assert_eq!(*sink.0.lock().unwrap(), vec!["launch-progress"]);
    }

    /// Availability must answer on any machine, configured or not - the button
    /// state depends on it, so it reports rather than fails. Whatever this
    /// machine happens to have installed, offering a launch without a resolved
    /// client would be offering one that cannot run.
    #[test]
    fn availability_never_offers_a_launch_without_a_client() {
        let availability = launch_availability(&Config::default());
        assert_eq!(
            availability.can_launch,
            availability.riot_client_path.is_some()
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn launching_off_windows_is_refused_through_the_adapter() {
        use crate::events::NullEventSink;

        let error =
            launch_league(&Config::default(), &league_target(), &NullEventSink).unwrap_err();
        assert!(matches!(error, LauncherError::UnsupportedPlatform));
    }
}
