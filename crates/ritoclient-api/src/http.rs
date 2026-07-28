//! The HTTP client used to talk to the Riot Client's remoting server.

use std::time::Duration;

use serde::de::DeserializeOwned;

use crate::LauncherError;
use crate::lockfile::Lockfile;

/// A launch has to survive a client that is mid-startup, so it waits.
///
/// Generous because the client runs its own gates before it spawns anything -
/// a patch-state refresh, a player-affinity token, an up-to-date check - and
/// each is a round trip to Riot's servers. Five seconds covered none of that on
/// a slow link, and a timeout here does **not** cancel the work: the client went
/// on to launch minutes later while we had already reported a failure.
pub const LAUNCH_TIMEOUT: Duration = Duration::from_secs(20);

/// Waking a tray-idle client is a cheap 204, so it does not get the launch
/// budget - it is retried, and three attempts of [`LAUNCH_TIMEOUT`] would spend
/// a minute before the wait for the client even starts.
pub const WAKE_TIMEOUT: Duration = Duration::from_secs(5);

/// Read-only queries answer instantly or not at all - they run on paths where a
/// user is waiting (first-run detection), so they fail fast instead.
pub const QUERY_TIMEOUT: Duration = Duration::from_secs(2);

/// Build a client for the remoting server.
///
/// It accepts Riot's self-signed remoting certificate, which is only acceptable
/// because this is a loopback connection to a port and password read from a
/// file only the current user can read. Extracting Riot's root certificate
/// instead would break every time they rotate it.
///
/// **Never reuse this client for anything that leaves the machine.** That is why
/// it is built per call rather than shared: there is no handle to smuggle into
/// unrelated code.
pub fn client(timeout: Duration) -> Result<reqwest::blocking::Client, LauncherError> {
    reqwest::blocking::Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(timeout)
        .build()
        .map_err(|e| LauncherError::RiotClientUnreachable {
            reason: format!("could not build the HTTP client: {e}"),
        })
}

/// Render a request failure with its cause, and name the two that matter.
///
/// `reqwest::Error`'s own `Display` stops at *"error sending request for url
/// (...)"* and never walks its source, so a 20-second timeout and an instantly
/// refused connection print the same line. Those two say opposite things about
/// what the client is doing - one is busy, the other is gone - and telling them
/// apart in a bug report is the whole point of this function.
pub fn describe(error: &reqwest::Error) -> String {
    let mut out = if error.is_timeout() {
        "the client accepted the connection but did not answer in time".to_string()
    } else if error.is_connect() {
        "nothing was listening on the port the lockfile named".to_string()
    } else {
        error.to_string()
    };

    let mut source = std::error::Error::source(error);
    while let Some(cause) = source {
        out.push_str(&format!(": {cause}"));
        source = cause.source();
    }
    out
}

/// `GET <path>` on the remoting server, deserialized.
///
/// Best-effort by design: every failure - no client, refused connection, a 404
/// because the plugin isn't registered, a body whose shape moved - collapses to
/// `None`. Callers use this to *enrich* what they already know, so "the client
/// couldn't tell us" must never become an error the user sees.
pub fn get_json<T: DeserializeOwned>(lockfile: &Lockfile, path: &str) -> Option<T> {
    let url = format!("{}{}", lockfile.base_url(), path);
    let response = client(QUERY_TIMEOUT)
        .ok()?
        .get(&url)
        .basic_auth("riot", Some(&lockfile.password))
        .send()
        .inspect_err(|e| tracing::debug!("GET {path} failed: {e}"))
        .ok()?;

    if !response.status().is_success() {
        tracing::debug!("GET {path} answered HTTP {}", response.status());
        return None;
    }

    let body = response.text().ok()?;
    serde_json::from_str(&body)
        .inspect_err(|e| tracing::warn!("GET {path} returned an unexpected shape: {e}"))
        .ok()
}
