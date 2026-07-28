//! `/riot-client-lifecycle/v1` - the Riot Client's own window state.
//!
//! Only the two window calls are wrapped, and the omissions are deliberate:
//!
//! - **`/quit` is not here.** League holds a live remoting session with the
//!   client for its whole run (that is what `--riotclient-auth-token` and
//!   `--riotclient-app-port` are for), so quitting the client out from under a
//!   running game is not a tidier version of hiding it.
//! - **`/quit/switch-background-mode` is not here** either, though it looks like
//!   the honest answer to "put the client in the tray": background mode really
//!   does keep working, and even handles launches (`launchGameRequested` →
//!   *"Launch event handled in Background mode, modified the parameter to include
//!   direct launch args"*). Three things rule it out anyway. Its own description
//!   says it shows the games-running exit dialog when a game is up, which is
//!   exactly when we would be calling it. It sheds the plugin surface League
//!   talks to for its whole session. And it leaves the client in the state whose
//!   only route is the argv handoff, so every later launch pays the wake-and-wait
//!   path. Hiding the window costs none of that.
//! - **There is no `/minimize`.** Probed and 404s; `hide` is the only thing the
//!   client offers. The window goes to the tray, not the taskbar.
//!
//! Hiding is reversible from the tray icon, and by [`show`].

use std::time::{Duration, Instant};

use crate::LauncherError;
use crate::http;
use crate::lockfile::{Lockfile, live_lockfile};

/// How long to keep watching for the game before giving up.
///
/// Generous because a cold start has to boot the client, possibly patch, and
/// wait for a login before the game appears. Giving up only costs the user a
/// window they can minimise themselves.
const GAME_WAIT_TIMEOUT: Duration = Duration::from_secs(300);

/// Polled rather than pushed. `OnJsonApiEvent` would do this without polling,
/// but a WebSocket for one boolean is not worth the connection.
const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// Once the game is up there is nothing to do but wait it out, and a session
/// runs for hours - so the walk of the process table slows down.
const SESSION_POLL_INTERVAL: Duration = Duration::from_secs(5);

/// How long the hide is re-asserted after the game exits.
///
/// Short on purpose. It has to outlast the teardown of the game's process tree,
/// which is where the client's own un-hide lands, and it has to stop well
/// before it starts fighting a player who opened the client from the tray.
const REHIDE_WINDOW: Duration = Duration::from_secs(10);

fn post(lockfile: &Lockfile, path: &str) -> Result<(), LauncherError> {
    let response = http::client(http::QUERY_TIMEOUT)?
        .post(format!("{}{path}", lockfile.base_url()))
        .basic_auth("riot", Some(&lockfile.password))
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body("")
        .send()
        .map_err(|e| LauncherError::RiotClientUnreachable {
            reason: e.to_string(),
        })?;

    let status = response.status();
    if !status.is_success() {
        return Err(LauncherError::RiotClientUnreachable {
            reason: format!("HTTP {status}"),
        });
    }
    Ok(())
}

const HIDE_PATH: &str = "/riot-client-lifecycle/v1/hide";

/// `POST /riot-client-lifecycle/v1/hide` - "Hide the UX."
///
/// Hides the window to the tray. The client keeps running, which is required:
/// the game talks to it for the whole session.
///
/// Idempotent: hiding an already-hidden window answers 204 like any other, which
/// is what lets [`hide_for_play_session`] re-assert it blind.
pub fn hide(lockfile: &Lockfile) -> Result<(), LauncherError> {
    post(lockfile, HIDE_PATH)?;
    tracing::info!("Hid the Riot Client window");
    Ok(())
}

/// `POST /riot-client-lifecycle/v1/show` - "Show the UX."
pub fn show(lockfile: &Lockfile) -> Result<(), LauncherError> {
    post(lockfile, "/riot-client-lifecycle/v1/show")?;
    tracing::info!("Restored the Riot Client window");
    Ok(())
}

/// Keep the Riot Client hidden for one play session, on a background thread.
///
/// Returns immediately. The hide has to be deferred rather than done inline:
/// hiding the moment the launch request is accepted would hide the window while
/// the client is still working - mid-patch, or showing a login the user has to
/// complete - and on a cold start that gap is minutes, not seconds.
///
/// **Two hides, not one.** The first is the obvious one. The second exists
/// because the client un-hides *itself* when the game exits: Foundation's UX
/// command bus carries a `showUxIfHidden` flag, so the window we put away comes
/// back on its own the moment the session ends. One hide therefore lasts exactly
/// as long as the game does, which is not what "hide the Riot Client" means to
/// anyone who asked for it.
///
/// The second hide is re-asserted over a short window rather than fired once,
/// because the client's show lands somewhere inside the teardown of the game's
/// process tree and hiding an already-hidden window is a no-op. Then it stops:
/// past that point the only thing showing the window is the player, and a
/// watcher that kept re-hiding would be taking the tray icon away from them.
///
/// Entirely best-effort. Every failure is a log line, because the cost of
/// getting this wrong is a window that stayed visible.
pub fn hide_for_play_session() {
    std::thread::spawn(move || {
        if !wait_for_game() {
            tracing::debug!(
                "Game did not start within the hide window; leaving the client visible"
            );
            return;
        }
        tracing::info!("Game is up; hiding the Riot Client for this session");
        hide_now();

        // No deadline: a session is as long as the player makes it.
        while crate::processes::league_client_running() {
            std::thread::sleep(SESSION_POLL_INTERVAL);
        }

        tracing::debug!("Game exited; keeping the Riot Client hidden through its own un-hide");
        let until = Instant::now() + REHIDE_WINDOW;
        while Instant::now() < until {
            std::thread::sleep(POLL_INTERVAL);
            hide_now();
        }
    });
}

/// Wait for `LeagueClient.exe`, reporting whether it turned up in time.
fn wait_for_game() -> bool {
    let deadline = Instant::now() + GAME_WAIT_TIMEOUT;
    while Instant::now() < deadline {
        std::thread::sleep(POLL_INTERVAL);
        if crate::processes::league_client_running() {
            return true;
        }
    }
    false
}

/// Hide the client, reading the lockfile fresh, without announcing it.
///
/// Re-read rather than captured from the launch: waking a client moves its
/// remoting port under the same pid, and this thread outlives that sequence by
/// a whole game.
///
/// Quiet because the re-assert loop calls this several times for one user-
/// visible event; [`hide_for_play_session`] logs the moments that mean
/// something instead.
fn hide_now() {
    let Some(lockfile) = live_lockfile() else {
        tracing::debug!("Riot Client went away before it could be hidden");
        return;
    };
    if let Err(e) = post(&lockfile, HIDE_PATH) {
        tracing::debug!("Could not hide the Riot Client: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lockfile::live_lockfile;

    /// Manual probe: what the lifecycle plugin actually exposes on this client.
    ///
    /// `/help` gives names and descriptions but no paths, so the route has to be
    /// derived and then confirmed. A `GET` on a POST-only route answers 405,
    /// which is the cheap way to prove a spelling without firing the call.
    ///
    /// ```text
    /// cargo test -p ritoclient-api lifecycle_probe -- --ignored --nocapture
    /// ```
    #[test]
    #[ignore = "requires a running Riot Client"]
    fn lifecycle_probe() {
        let Some(lockfile) = live_lockfile() else {
            println!("no live Riot Client; nothing to probe");
            return;
        };

        let client = http::client(http::QUERY_TIMEOUT).unwrap();
        for path in [
            "/riot-client-lifecycle/v1/hide",
            "/riot-client-lifecycle/v1/show",
            "/riot-client-lifecycle/v1/minimize",
            "/riot-client-lifecycle/v1/quit",
        ] {
            let status = client
                .get(format!("{}{path}", lockfile.base_url()))
                .basic_auth("riot", Some(&lockfile.password))
                .send()
                .map(|r| r.status().as_u16());
            println!("GET {path} -> {status:?}   (405 = exists, POST-only)");
        }
    }

    /// Manual check that actually hides the window, then puts it back.
    ///
    /// ```text
    /// cargo test -p ritoclient-api hide_and_show_for_real -- --ignored --nocapture
    /// ```
    #[test]
    #[ignore = "hides the Riot Client window"]
    fn hide_and_show_for_real() {
        let lockfile = live_lockfile().expect("the Riot Client must be running");

        println!("hide: {:?}", hide(&lockfile));
        std::thread::sleep(Duration::from_secs(3));
        println!("show: {:?}", show(&lockfile));
    }
}
