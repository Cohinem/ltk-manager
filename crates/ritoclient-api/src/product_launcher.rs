//! `/product-launcher/v1` - the route that actually starts a product.
//!
//! This is what the Riot Client's own Play button calls. The distinction from
//! [`crate::app_args`] cost a debugging session and is worth stating plainly:
//! that one *queues arguments* and answers 204 without launching anything.
//!
//! A tray-idle client registers only the argv handoff; this plugin appears once
//! it finishes booting, which is why [`crate::launch`] needs a two-step.

use crate::LauncherError;
use crate::http;
use crate::launch::LaunchTarget;
use crate::lockfile::Lockfile;

/// What a launch request found at the other end.
#[derive(Debug)]
pub enum LaunchAttempt {
    /// The client launched the product. Carries the session id it minted, which
    /// is the key into `/product-session/v1/external-sessions`.
    Launched { session_id: Option<String> },
    /// The client is alive but cannot take the request *yet*. Three shapes, one
    /// meaning:
    ///
    /// - **404** - the product-launcher plugin is not registered. The client is
    ///   still booting, or idling in the tray with a minimal API surface.
    /// - **5xx** - registered, but not far enough along to serve the call.
    /// - **the connection failed** - its remoting listener is restarting, which
    ///   is exactly what waking it does, on a *new port* under the same pid.
    ///
    /// That last one used to be a hard error, which is why a launch would fail
    /// while the client it was aimed at was merely mid-restart. Every one of
    /// these is a "not yet" that the wait in [`crate::launch`] recovers from.
    NotReady { reason: String },
}

/// The client's error payload, as returned by a refused launch.
///
/// ```json
/// {"errorCode":"eula_not_accepted","httpStatus":464,"implementationDetails":{},
///  "message":"eula_not_accepted: Cannot run product 'league_of_legends' ..."}
/// ```
///
/// Only the two fields worth showing are taken. The status is not among them:
/// Riot answers refusals with codes outside the standard set (464 for an
/// unaccepted ToS), so it classifies nothing on its own - which is exactly why
/// the body has to be read rather than reported as `HTTP 464`.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientError {
    error_code: String,
    message: String,
}

/// Turn a refused launch into an error that names its cause.
///
/// Falls back to [`LauncherError::RiotClientUnreachable`] with the raw body when
/// the payload is not the shape above - a refusal we cannot explain is still
/// better reported verbatim than swallowed.
fn refusal(status: reqwest::StatusCode, body: &str) -> LauncherError {
    let Ok(error) = serde_json::from_str::<ClientError>(body) else {
        return LauncherError::RiotClientUnreachable {
            reason: format!("HTTP {status}: {}", body.trim()),
        };
    };

    // The message repeats its own code as a prefix. The host gets the code as a
    // field, so the prose does not need to carry it too.
    let message = error
        .message
        .strip_prefix(&format!("{}: ", error.error_code))
        .unwrap_or(&error.message)
        .to_string();

    tracing::warn!(
        "Riot Client refused the launch: {} ({})",
        message,
        error.error_code
    );
    LauncherError::LaunchRefused {
        riot_error_code: error.error_code,
        message,
    }
}

fn product_url(lockfile: &Lockfile, target: &LaunchTarget) -> String {
    format!(
        "{}/product-launcher/v1/products/{}/patchlines/{}",
        lockfile.base_url(),
        target.product_id,
        target.patchline_id
    )
}

/// Whether the client considers this product/patchline launchable.
///
/// Advisory: a `false` is worth surfacing, but an unreachable eligibility check
/// must never block a launch attempt - the endpoint is absent on older builds.
///
/// **This is an entitlement check, not an install check.** It answers `true` for
/// `pbe` on a machine with no PBE install, so it cannot gate a patchline picker;
/// [`crate::product_registry::Patchline::is_installed`] is that question.
pub fn is_eligible(lockfile: &Lockfile, target: &LaunchTarget) -> Option<bool> {
    let client = http::client(http::QUERY_TIMEOUT).ok()?;
    let response = client
        .get(format!("{}/eligibility", product_url(lockfile, target)))
        .basic_auth("riot", Some(&lockfile.password))
        .send()
        .ok()?;

    if !response.status().is_success() {
        return None;
    }
    serde_json::from_str::<bool>(&response.text().ok()?).ok()
}

/// Whether the client already has a launch in flight.
///
/// The guard against launching twice. Our POST can time out while the client is
/// still working through its gates, and the timeout cancels nothing at the far
/// end - so a retry that did not ask this first would queue a second launch for
/// a request that was already accepted.
pub fn is_launch_request_pending(lockfile: &Lockfile) -> Option<bool> {
    http::get_json(lockfile, "/product-launcher/v1/is-launch-request-pending")
}

/// Ask the client to launch the product.
pub fn launch_product(
    lockfile: &Lockfile,
    target: &LaunchTarget,
) -> Result<LaunchAttempt, LauncherError> {
    let client = http::client(http::LAUNCH_TIMEOUT)?;
    let url = product_url(lockfile, target);

    let response = match client
        .post(&url)
        .basic_auth("riot", Some(&lockfile.password))
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body("{}")
        .send()
    {
        Ok(response) => response,
        Err(e) => {
            return Ok(LaunchAttempt::NotReady {
                reason: http::describe(&e),
            });
        }
    };

    let status = response.status();

    // A client that has not loaded the launcher plugin answers 404 for the
    // whole namespace; a 5xx is one that loaded it but cannot serve it yet.
    if status == reqwest::StatusCode::NOT_FOUND || status.is_server_error() {
        return Ok(LaunchAttempt::NotReady {
            reason: format!("HTTP {status}"),
        });
    }

    // Anything else is the client answering, not stalling: an unaccepted ToS, an
    // ineligible product, a locked patchline. Retrying cannot change those, and
    // the status alone cannot describe them - see [`refusal`].
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(refusal(status, &body));
    }

    // The body is a bare JSON string holding the session id. Losing it costs
    // us session tracking, not the launch, so a shape we don't recognise is
    // dropped rather than raised.
    let session_id = response
        .text()
        .ok()
        .and_then(|body| serde_json::from_str::<String>(&body).ok());
    tracing::info!(
        "Riot Client launched {}/{} (session {:?})",
        target.product_id,
        target.patchline_id,
        session_id
    );
    Ok(LaunchAttempt::Launched { session_id })
}

#[cfg(test)]
mod tests {
    use super::*;

    use assert_matches::assert_matches;

    /// Verbatim from a live refusal, non-standard status and all. The status is
    /// the part that carries no information: 464 is not in the standard set, so
    /// a user shown "HTTP 464" learns nothing about what to do.
    const EULA_REFUSAL: &str = r#"{"errorCode":"eula_not_accepted","httpStatus":464,"implementationDetails":{},"message":"eula_not_accepted: Cannot run product 'league_of_legends' patchline 'live' because the player didn't accept EULA Terms of Service"}"#;

    #[test]
    fn a_refusal_keeps_riots_code_and_drops_its_prefix_from_the_prose() {
        let status = reqwest::StatusCode::from_u16(464).unwrap();

        assert_matches!(
            refusal(status, EULA_REFUSAL),
            LauncherError::LaunchRefused { riot_error_code, message } => {
                assert_eq!(riot_error_code, "eula_not_accepted");
                assert!(
                    message.starts_with("Cannot run product"),
                    "the code is a field, so the prose must not repeat it: {message}"
                );
            }
        );
    }

    /// A refusal we cannot parse still has to reach the user - reporting it
    /// verbatim is worse than a tailored message and far better than nothing.
    #[test]
    fn an_unrecognised_body_falls_back_to_the_raw_text() {
        assert_matches!(
            refusal(reqwest::StatusCode::CONFLICT, "patchline is locked"),
            LauncherError::RiotClientUnreachable { reason } => {
                assert!(reason.contains("409"));
                assert!(reason.contains("patchline is locked"));
            }
        );
    }
}
