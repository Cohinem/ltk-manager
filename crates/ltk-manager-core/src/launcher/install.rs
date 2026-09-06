//! The League installs the Riot Client's product registry lists, and whether
//! the one the manager is set up for is the one a session runs from.
//!
//! Per "The install mismatch dialog" in docs/ux/LEAGUE_DIAGNOSTICS.md. Every
//! call against the client returns `Option`, and a client that does not answer
//! is a silence rather than a failure.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use ritoclient::ids::products;
use ritoclient::prelude::*;

use crate::utils::path::slashed;

/// One installed League patchline, as the product registry lists it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstalledPatchline {
    /// `live`, `pbe`, and the rest.
    pub id: String,
    /// The install root, the folder that holds `Game`.
    pub root: PathBuf,
}

/// The install the manager is set up for, against the one the client's League
/// session runs from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct InstallMismatch {
    /// The install root the manager is set up for.
    pub configured_path: String,
    /// The patchline the registry lists that root under.
    pub configured_patchline: String,
    /// The patchline of the League session the client has open.
    pub session_patchline: String,
    /// That patchline's install root.
    pub session_path: String,
}

/// Every installed League patchline, from a client that is running. Empty
/// when no client answers.
pub fn installed_patchlines() -> Vec<InstalledPatchline> {
    ritoclient::Client::new()
        .ok()
        .map(|client| patchlines_of(&client))
        .unwrap_or_default()
}

fn patchlines_of(client: &ritoclient::Client) -> Vec<InstalledPatchline> {
    let Some(products) = client.product_registry().products() else {
        return Vec::new();
    };
    products
        .iter()
        .filter(|product| product.id == products::LEAGUE_OF_LEGENDS)
        .flat_map(ProductExt::installed_patchlines)
        .filter_map(|patchline| {
            Some(InstalledPatchline {
                id: patchline.id.clone(),
                root: patchline.install_root()?,
            })
        })
        .collect()
}

/// The patchline of the League session the client has open, whichever
/// patchline that is. `None` without a session.
fn open_session_patchline(client: &ritoclient::Client) -> Option<String> {
    client
        .product_session()
        .external_sessions()?
        .into_values()
        .find(|session| session.product_id == products::LEAGUE_OF_LEGENDS && !session.has_ended())
        .map(|session| session.patchline_id)
}

/// The mismatch between `configured` and the install the client's open League
/// session runs from, read from the client. `None` when they agree, when no
/// client or session answers, or when the registry does not know `configured`.
pub fn detect_install_mismatch(configured: &Path) -> Option<InstallMismatch> {
    let client = ritoclient::Client::new().ok()?;
    let session_patchline = open_session_patchline(&client)?;
    install_mismatch(configured, &patchlines_of(&client), &session_patchline)
}

/// The mismatch between `configured` and the install `session_patchline` runs
/// from, over the patchlines the registry lists.
///
/// `None` when the registry lists `configured` under `session_patchline`, does
/// not list `configured` at all, or does not list `session_patchline`.
pub fn install_mismatch(
    configured: &Path,
    installed: &[InstalledPatchline],
    session_patchline: &str,
) -> Option<InstallMismatch> {
    let configured_patchline = installed
        .iter()
        .find(|patchline| same_install(&patchline.root, configured))?;
    if configured_patchline.id == session_patchline {
        return None;
    }
    let session = installed
        .iter()
        .find(|patchline| patchline.id == session_patchline)?;
    Some(InstallMismatch {
        configured_path: slashed(configured),
        configured_patchline: configured_patchline.id.clone(),
        session_patchline: session.id.clone(),
        session_path: slashed(&session.root),
    })
}

/// Whether two paths name one install.
///
/// The `\\?\` prefix, the slash kind, a trailing separator and the case are
/// set aside. The registry writes forward slashes, and a setting holds whatever
/// the picker gave it.
pub fn same_install(a: &Path, b: &Path) -> bool {
    install_key(a) == install_key(b)
}

fn install_key(path: &Path) -> String {
    slashed(path).trim_end_matches('/').to_ascii_lowercase()
}

#[cfg(test)]
mod tests;
