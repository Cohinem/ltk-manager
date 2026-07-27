//! `/riot-client-lifecycle/v1` - the Riot Client's own window state.
//!
//! Only the two window calls are wrapped, and the omissions are deliberate:
//!
//! - **`/quit` is not here.** League holds a live remoting session with the
//!   client for its whole run (that is what `--riotclient-auth-token` and
//!   `--riotclient-app-port` are for), so quitting the client out from under a
//!   running game is not a tidier version of hiding it.
//! - **`/quit/switch-background-mode` is not here** either, though it is the
//!   call that produces the tray-idle state. Its own description says it shows
//!   the games-running exit dialog when a game is up, which is exactly when we
//!   would be calling it: a modal in the user's face instead of a hidden window.
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

/// `POST /riot-client-lifecycle/v1/hide` - "Hide the UX."
///
/// Hides the window to the tray. The client keeps running, which is required:
/// the game talks to it for the whole session.
pub fn hide(lockfile: &Lockfile) -> Result<(), LauncherError> {
    post(lockfile, "/riot-client-lifecycle/v1/hide")?;
    tracing::info!("Hid the Riot Client window");
    Ok(())
}

/// `POST /riot-client-lifecycle/v1/show` - "Show the UX."
pub fn show(lockfile: &Lockfile) -> Result<(), LauncherError> {
    post(lockfile, "/riot-client-lifecycle/v1/show")?;
    tracing::info!("Restored the Riot Client window");
    Ok(())
}

/// Hide the Riot Client once the game process appears, on a background thread.
///
/// Returns immediately. It has to be deferred rather than done inline: hiding
/// the moment the launch request is accepted would hide the window while the
/// client is still working - mid-patch, or showing a login the user has to
/// complete - and on a cold start that gap is minutes, not seconds.
///
/// Entirely best-effort. Every failure is a log line, because the cost of
/// getting this wrong is a window that stayed visible.
pub fn hide_when_game_starts() {
    std::thread::spawn(move || {
        let deadline = Instant::now() + GAME_WAIT_TIMEOUT;

        while Instant::now() < deadline {
            std::thread::sleep(POLL_INTERVAL);

            if !crate::processes::league_client_running() {
                continue;
            }

            // Re-read rather than capturing a lockfile from the launch: waking a
            // client moves its remoting port under the same pid, and this thread
            // outlives that whole sequence.
            match live_lockfile() {
                Some(lockfile) => {
                    if let Err(e) = hide(&lockfile) {
                        tracing::warn!("Could not hide the Riot Client: {e}");
                    }
                }
                None => tracing::debug!("Riot Client went away before it could be hidden"),
            }
            return;
        }

        tracing::debug!("Game did not start within the hide window; leaving the client visible");
    });
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
