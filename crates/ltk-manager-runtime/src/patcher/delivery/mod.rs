//! Downloads the patcher DLL from the delivery service and selects the build that a
//! session runs.
//!
//! The service offers one minisign-signed manifest per channel and manager version
//! range. A sync verifies the manifest, downloads its DLL into a directory named by
//! the digest, and caches the manifest. A selection reads only the cache, so starting
//! the patcher never waits for the network. An elevated session runs the bundled build,
//! per `docs/adr/0067-a-delivered-patcher-dll-runs-only-unelevated.md`.

mod manifest;
mod service;

use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use fs_err as fs;
use semver::Version;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use super::host::{HOOK_DLL_NAME, HOST_EXE_NAME};
use ltk_manager_base::hashing::sha256_file;
use ltk_manager_base::utils::fs::atomic_write;
use service::{Offer, Service};

pub use manifest::{Envelope, MAX_DLL_BYTES, Manifest, Release};

/// File in the delivery root that holds the install registration and cached manifests.
const STATE_FILE: &str = "delivery.json";

/// A delivery channel.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Hash,
    Serialize,
    Deserialize,
    strum::Display,
    strum::IntoStaticStr,
)]
#[serde(rename_all = "lowercase")]
#[strum(serialize_all = "lowercase")]
pub enum Channel {
    /// The channel that a manager reads by default.
    Stable,
    /// The channel that receives a build before it is promoted to stable.
    Beta,
}

impl Channel {
    /// Returns the channel name that the service uses.
    pub fn as_str(self) -> &'static str {
        self.into()
    }
}

/// Errors of a delivery sync or selection.
#[derive(Debug, Error)]
pub enum DeliveryError {
    /// A request failed, or its response body did not decode.
    #[error("the delivery request failed: {0}")]
    Network(#[from] reqwest::Error),
    /// The service answered with an error status.
    #[error("the delivery service refused the request with status {status} {reason}")]
    Refused {
        /// HTTP status of the response.
        status: u16,
        /// The `reason` or `error` field of the response body, empty if it has neither.
        reason: String,
    },
    /// The service answered `401` to the install token.
    #[error("the delivery service refused the install token")]
    Unauthorized,
    /// The registration challenge difficulty is above the maximum that the client attempts.
    #[error("the registration challenge difficulty {0} is above the supported maximum")]
    Difficulty(u32),
    /// The manifest signature or its trusted comment does not verify.
    #[error("the manifest signature does not verify")]
    Signature,
    /// A manifest field is outside the schema 1 contract.
    #[error("the manifest field `{field}` is invalid")]
    Invalid {
        /// Path of the invalid field in the manifest body.
        field: &'static str,
    },
    /// The offered manifest has a lower sequence than the cached manifest of its channel.
    #[error(
        "the {channel} manifest has sequence {offered}, older than the cached sequence {cached}"
    )]
    Stale {
        /// Channel of both manifests.
        channel: Channel,
        /// Sequence of the offered manifest.
        offered: u64,
        /// Sequence of the cached manifest.
        cached: u64,
    },
    /// The downloaded DLL differs from the size or the digest of its release.
    #[error("the downloaded DLL does not match the size and digest of its release")]
    Integrity,
    /// A cached manifest revokes the bundled DLL, and no delivered DLL is usable.
    #[error(
        "the bundled patcher DLL was revoked and no replacement has been downloaded, so \
         connect to the internet, wait a minute and start the patcher again"
    )]
    Withdrawn,
    /// A read or write of the delivery state, a staged file or the download body failed.
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// The patcher build that a session runs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Selection {
    /// A delivered DLL, staged in `dir` beside a copy of the bundled host.
    Delivered {
        /// Staging directory that holds the DLL and the host copy.
        dir: PathBuf,
        /// Release name of the DLL.
        version: String,
        /// SHA-256 of the DLL, lowercase hex.
        digest: String,
    },
    /// The host and the DLL that the manager bundles.
    Bundled,
}

/// The delivery client of one manager build.
#[derive(Debug, Clone)]
pub struct PatcherDelivery {
    /// Directory that holds the delivery state and one directory per staged DLL.
    pub root: PathBuf,
    /// Base URL of the public delivery service.
    pub url: String,
    /// Base64 minisign public key that every manifest must verify against.
    pub public_key: String,
    /// Build attestation that this manager build registers with, signed by the release
    /// workflow over the release version and the commit.
    pub attestation: String,
    /// Release version of this manager, without a pre-release suffix. A release range of a
    /// manifest never matches a pre-release version, on this side or on the service.
    pub manager: Version,
    /// Host protocol of the bundled host. A release for another protocol is not used.
    pub protocol: u32,
}

/// The registration and the cached manifests, as stored in [`STATE_FILE`].
#[derive(Debug, Default, Serialize, Deserialize)]
struct State {
    install: Option<String>,
    token: Option<String>,
    #[serde(default)]
    channels: BTreeMap<Channel, Cached>,
}

/// The cached manifest of one channel and the ETag that the service sent with it.
#[derive(Debug, Serialize, Deserialize)]
struct Cached {
    etag: Option<String>,
    envelope: Envelope,
}

impl PatcherDelivery {
    /// Fetches the manifest of `channel` and downloads its DLL if it is usable.
    ///
    /// Registers the install first if no token is stored. Registers it again if the
    /// service refuses the stored token. Fails if the manifest does not verify or is
    /// older than the cached manifest of the channel. A manifest that fails is not cached.
    pub fn sync(&self, channel: Channel) -> Result<(), DeliveryError> {
        let service = Service::new(&self.url, &format!("ltk-manager/{}", self.manager))?;
        let mut state = self.load();
        let cached = self.cached(&state, channel);

        // If the cached manifest no longer verifies, its ETag is not sent, because the
        // service would answer `304` without a manifest.
        let etag = cached
            .as_ref()
            .and(state.channels.get(&channel))
            .and_then(|entry| entry.etag.clone());
        let manager = self.manager.to_string();
        let offer = self.authorized(&service, &mut state, |token| {
            service.offer(token, channel, &manager, etag.as_deref())
        })?;

        let manifest = match offer {
            Offer::Incompatible => {
                tracing::info!(%channel, manager = %self.manager, "No patcher release serves this manager version");
                return Ok(());
            }
            Offer::Unchanged => match cached {
                Some(manifest) => manifest,
                None => return Ok(()),
            },
            Offer::Changed { envelope, etag } => {
                let manifest = Manifest::verify(&envelope, &self.public_key)?;
                if manifest.channel != channel {
                    return Err(DeliveryError::Invalid { field: "channel" });
                }
                if let Some(cached) = &cached
                    && manifest.sequence < cached.sequence
                {
                    return Err(DeliveryError::Stale {
                        channel,
                        offered: manifest.sequence,
                        cached: cached.sequence,
                    });
                }

                state.channels.insert(channel, Cached { etag, envelope });
                self.save(&state)?;
                manifest
            }
        };

        let revoked = self.revoked(&state);
        if self.usable(&manifest, &revoked) && self.staged_dll(&manifest.release).is_none() {
            self.authorized(&service, &mut state, |token| {
                self.download(&service, token, &manifest.release)
            })?;
            tracing::info!(%channel, version = %manifest.release.version, "Downloaded patcher DLL");
        }

        Ok(())
    }

    /// Selects the build that a session on `channel` runs.
    ///
    /// Returns [`Selection::Delivered`] if the cached manifest of `channel` is usable by
    /// this manager, its DLL is staged, and the session is not `elevated`. Returns
    /// [`Selection::Bundled`] if no cached manifest of `channel` is usable, if its DLL is
    /// not staged, if the session is `elevated`, or if the host cannot be copied beside
    /// the DLL. Fails with [`DeliveryError::Withdrawn`] if a cached manifest revokes
    /// `bundled_dll` and no delivered DLL replaces it.
    pub fn select(
        &self,
        channel: Channel,
        bundled_host: &Path,
        bundled_dll: &Path,
        elevated: bool,
    ) -> Result<Selection, DeliveryError> {
        let state = self.load();
        let revoked = self.revoked(&state);

        let delivered = self
            .cached(&state, channel)
            .filter(|manifest| !elevated && self.usable(manifest, &revoked))
            .and_then(|manifest| {
                let dir = self.staged_dll(&manifest.release)?;
                match stage_host(&dir, bundled_host) {
                    Ok(()) => Some(Selection::Delivered {
                        dir,
                        version: manifest.release.version,
                        digest: manifest.release.digest,
                    }),
                    Err(error) => {
                        tracing::warn!(
                            %error,
                            "Could not copy the host beside the delivered DLL. Using the bundled patcher"
                        );
                        None
                    }
                }
            });
        if let Some(selection) = delivered {
            return Ok(selection);
        }

        if !revoked.is_empty() && sha256_file(bundled_dll).is_ok_and(|d| revoked.contains(&d)) {
            return Err(DeliveryError::Withdrawn);
        }

        Ok(Selection::Bundled)
    }

    /// Sends `request` with the install token.
    ///
    /// Registers the install first if no token is stored. If the service refuses a
    /// stored token, registers the install again and sends `request` once more.
    fn authorized<T>(
        &self,
        service: &Service,
        state: &mut State,
        request: impl Fn(&str) -> Result<T, DeliveryError>,
    ) -> Result<T, DeliveryError> {
        let stored = state.token.is_some();
        let token = self.token(service, state)?;

        match request(&token) {
            Err(DeliveryError::Unauthorized) if stored => {
                state.token = None;
                let token = self.token(service, state)?;
                request(&token)
            }
            other => other,
        }
    }

    /// Returns the stored token.
    ///
    /// Registers the install and stores its token if no token is stored.
    fn token(&self, service: &Service, state: &mut State) -> Result<String, DeliveryError> {
        if let Some(token) = &state.token {
            return Ok(token.clone());
        }

        let install = state
            .install
            .get_or_insert_with(|| Uuid::new_v4().to_string())
            .clone();
        let token = service.register(&install, &self.manager.to_string(), &self.attestation)?;

        state.token = Some(token.clone());
        self.save(state)?;
        Ok(token)
    }

    /// Returns the cached manifest of `channel` if it still verifies.
    fn cached(&self, state: &State, channel: Channel) -> Option<Manifest> {
        let entry = state.channels.get(&channel)?;
        match Manifest::verify(&entry.envelope, &self.public_key) {
            Ok(manifest) if manifest.channel == channel => Some(manifest),
            Ok(_) => None,
            Err(error) => {
                tracing::warn!(%channel, %error, "Ignoring the cached patcher manifest");
                None
            }
        }
    }

    /// Returns the union of the revocations of every cached manifest.
    fn revoked(&self, state: &State) -> HashSet<String> {
        state
            .channels
            .keys()
            .filter_map(|channel| self.cached(state, *channel))
            .flat_map(|manifest| manifest.revoked)
            .collect()
    }

    /// Returns `true` if this manager can run the release of `manifest`.
    fn usable(&self, manifest: &Manifest, revoked: &HashSet<String>) -> bool {
        manifest.serves(&self.manager)
            && manifest.release.protocol == self.protocol
            && !revoked.contains(&manifest.release.digest)
    }

    /// Returns the staging directory of `release` if it holds a DLL with its digest.
    fn staged_dll(&self, release: &Release) -> Option<PathBuf> {
        let dir = self.root.join(&release.digest);
        let digest = sha256_file(&dir.join(HOOK_DLL_NAME)).ok()?;
        (digest == release.digest).then_some(dir)
    }

    fn download(
        &self,
        service: &Service,
        token: &str,
        release: &Release,
    ) -> Result<(), DeliveryError> {
        let dir = self.root.join(&release.digest);
        fs::create_dir_all(&dir)?;

        let mut file = tempfile::NamedTempFile::new_in(&dir)?;
        service.download(token, release, file.as_file_mut())?;
        file.as_file().sync_all()?;
        file.persist(dir.join(HOOK_DLL_NAME))
            .map_err(|error| error.error)?;
        Ok(())
    }

    /// Removes staging directories that no cached manifest offers.
    ///
    /// Must run before any session selects a build, because a sync can replace the cached
    /// manifest of a selection whose host is not spawned yet. Skips a directory that
    /// cannot be removed, such as one that a running host uses.
    pub fn remove_unused(&self) {
        let state = self.load();
        let offered: HashSet<String> = state
            .channels
            .keys()
            .filter_map(|channel| self.cached(&state, *channel))
            .map(|manifest| manifest.release.digest)
            .collect();
        let Ok(entries) = fs::read_dir(&self.root) else {
            return;
        };

        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if manifest::is_digest(&name)
                && !offered.contains(&name)
                && let Err(error) = fs::remove_dir_all(entry.path())
            {
                tracing::debug!(
                    %error,
                    path = %entry.path().display(),
                    "Could not remove an unused patcher staging directory"
                );
            }
        }
    }

    fn load(&self) -> State {
        let path = self.root.join(STATE_FILE);
        let Ok(text) = fs::read_to_string(&path) else {
            return State::default();
        };

        serde_json::from_str(&text).unwrap_or_else(|error| {
            tracing::warn!(%error, "Discarding the unreadable patcher delivery state");
            State::default()
        })
    }

    fn save(&self, state: &State) -> Result<(), DeliveryError> {
        fs::create_dir_all(&self.root)?;
        let json = serde_json::to_vec_pretty(state).expect("the delivery state serializes");
        atomic_write(&self.root.join(STATE_FILE), &json)?;
        Ok(())
    }
}

/// Copies `bundled_host` into `dir` unless an identical copy is already there.
///
/// The host loads the DLL from its own directory, so a delivered DLL needs a host
/// beside it.
fn stage_host(dir: &Path, bundled_host: &Path) -> std::io::Result<()> {
    let staged = dir.join(HOST_EXE_NAME);
    if staged.exists() && sha256_file(&staged)? == sha256_file(bundled_host)? {
        return Ok(());
    }

    fs::copy(bundled_host, &staged)?;
    Ok(())
}

/// Returns the manager version that the statement of `attestation` names.
///
/// Returns `None` if the statement is not base64url JSON with a `manager` field. The
/// signature is not checked, because only the service holds the key to do so.
pub fn attested_manager(attestation: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct Statement {
        manager: String,
    }

    let statement = attestation.split('.').next()?;
    let bytes = URL_SAFE_NO_PAD.decode(statement).ok()?;
    serde_json::from_slice::<Statement>(&bytes)
        .ok()
        .map(|statement| statement.manager)
}

#[cfg(test)]
mod tests;
