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
    /// The client is alive but has not registered the product-launcher plugin.
    /// It is still booting, or idling in the tray with a minimal API surface.
    LauncherNotRegistered,
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

/// Ask the client to launch the product.
pub fn launch_product(
    lockfile: &Lockfile,
    target: &LaunchTarget,
) -> Result<LaunchAttempt, LauncherError> {
    let client = http::client(http::LAUNCH_TIMEOUT)?;
    let url = product_url(lockfile, target);

    let response = client
        .post(&url)
        .basic_auth("riot", Some(&lockfile.password))
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body("{}")
        .send()
        .map_err(|e| LauncherError::RiotClientUnreachable {
            reason: e.to_string(),
        })?;

    let status = response.status();

    // A client that has not loaded the launcher plugin answers 404 for the
    // whole namespace. That is a "not yet", not a failure.
    if status == reqwest::StatusCode::NOT_FOUND {
        tracing::debug!("product-launcher not registered yet");
        return Ok(LaunchAttempt::LauncherNotRegistered);
    }

    if !status.is_success() {
        return Err(LauncherError::RiotClientUnreachable {
            reason: format!("HTTP {status}"),
        });
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
