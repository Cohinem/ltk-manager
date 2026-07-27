//! `/riotclientapp/v1/new-args` - the duplicate-instance argv handoff.
//!
//! This is what a *second* `RiotClientServices.exe` calls to hand its argv to
//! the first one before exiting. Its **204 means "arguments queued"**, nothing
//! more: against a fully booted client the documented launch body returns 204
//! and launches nothing at all. Against a tray-idle client it wakes the window
//! and then does nothing else - the half-working symptom that makes it look
//! almost right.
//!
//! So it has exactly one use here: **waking a tray-idle client**. In that state
//! it is the only route that exists - the client's whole API surface collapses
//! to this single function until it finishes booting. To launch, use
//! [`crate::product_launcher`].

use std::time::Duration;

use crate::LauncherError;
use crate::http;
use crate::launch::LaunchTarget;
use crate::lockfile::Lockfile;
use crate::window::allow_foreground;

/// The client may be mid-startup when we ask, so a refusal is worth a couple of
/// retries before it counts as unreachable.
const ATTEMPTS: u32 = 3;
const RETRY_DELAY: Duration = Duration::from_millis(250);

/// Wake a tray-idle client by handing it launch arguments.
///
/// Do not mistake its 204 for a launch. See the module docs.
pub fn wake_with_launch_args(
    lockfile: &Lockfile,
    target: &LaunchTarget,
) -> Result<(), LauncherError> {
    let client = http::client(http::LAUNCH_TIMEOUT)?;
    let url = format!("{}/riotclientapp/v1/new-args", lockfile.base_url());

    // Both elements are required: the client only takes its launch branch when
    // `--launch-product` and `--launch-patchline` are both present.
    let body = serde_json::to_string(&[
        format!("--launch-product={}", target.product_id),
        format!("--launch-patchline={}", target.patchline_id),
    ])
    .map_err(|e| LauncherError::RiotClientUnreachable {
        reason: format!("could not encode the launch args: {e}"),
    })?;

    let mut last_reason = String::from("no attempt was made");

    for attempt in 1..=ATTEMPTS {
        allow_foreground();

        let response = client
            .post(&url)
            .basic_auth("riot", Some(&lockfile.password))
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body.clone())
            .send();

        match response {
            Ok(r) if r.status() == reqwest::StatusCode::NO_CONTENT => {
                tracing::debug!("Woke the Riot Client with new-args");
                return Ok(());
            }
            Ok(r) => last_reason = format!("HTTP {}", r.status()),
            Err(e) => last_reason = e.to_string(),
        }

        tracing::debug!("new-args attempt {attempt}/{ATTEMPTS} failed: {last_reason}");
        if attempt < ATTEMPTS {
            std::thread::sleep(RETRY_DELAY);
        }
    }

    Err(LauncherError::RiotClientUnreachable {
        reason: last_reason,
    })
}
