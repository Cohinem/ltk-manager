//! Launching League, adapted to the manager's own types.
//!
//! The work lives in [`ritoclient_api`], which knows nothing about this crate -
//! no [`Config`], no [`EventSink`], no error enum of ours. This module is the
//! seam: it unpacks the config, wraps the sink, and re-exports the types that
//! cross the IPC boundary so callers have one place to import from.

use crate::config::Config;
use crate::events::{BackendEvent, EventSink};

pub use ritoclient_api::{
    LaunchAvailability, LaunchOutcome, LaunchRoute, LaunchTarget, LauncherError,
};

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
    let outcome = ritoclient_api::launch_league(
        config.league_path.as_deref(),
        target,
        &SinkObserver(events),
    )?;

    // Only after the client accepted the request, and only in the background:
    // the game is not up yet, and on a cold start it is minutes away.
    //
    // Nothing was launched on the already-running route, so nothing gets hidden
    // either - the user is told their open client was left alone, and hiding it
    // out from under them would make that a lie.
    if config.hide_riot_client_on_launch && outcome.route != LaunchRoute::AlreadyRunning {
        ritoclient_api::lifecycle::hide_for_play_session();
    }

    Ok(outcome)
}

/// Whether a launch is possible right now. Never fails.
pub fn launch_availability(config: &Config) -> LaunchAvailability {
    ritoclient_api::launch_availability(config.league_path.as_deref())
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

        let error = launch_league(&Config::default(), &LaunchTarget::default(), &NullEventSink)
            .unwrap_err();
        assert!(matches!(error, LauncherError::UnsupportedPlatform));
    }
}
