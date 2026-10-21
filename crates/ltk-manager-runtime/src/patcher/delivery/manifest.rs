//! Reads and verifies the signed manifests of the delivery service.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use minisign_verify::{PublicKey, Signature};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};

use super::{Channel, DeliveryError};

/// Largest DLL that the delivery service stores, in bytes.
pub const MAX_DLL_BYTES: u64 = 32 * 1024 * 1024;

/// A manifest as the service serves it: the signed bytes and their minisign signature.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Envelope {
    /// Base64 of the manifest bytes.
    pub manifest: String,
    /// Minisign signature text over the decoded manifest bytes.
    pub signature: String,
}

/// The patcher build that a manifest offers.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Release {
    /// Release name, `ltk_patcher-<run>`.
    pub version: String,
    /// SHA-256 of the DLL, lowercase hex.
    pub digest: String,
    /// Size of the DLL in bytes.
    pub size: u64,
    /// Host protocol that the DLL uses.
    pub protocol: u32,
    /// Manager versions that the release serves, as an explicit `>=` range.
    pub managers: String,
    /// Newest game build timestamp that the DLL patches.
    pub eol: u32,
}

/// A verified schema 1 manifest.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Manifest {
    /// Manifest format version. Only `1` is read.
    pub schema: u32,
    /// Channel that the manifest belongs to.
    pub channel: Channel,
    /// Publication number of the channel. It only grows.
    pub sequence: u64,
    /// The build that the manifest offers.
    pub release: Release,
    /// Digests that no manager may run, on any channel.
    pub revoked: Vec<String>,
}

impl Manifest {
    /// Verifies `envelope` against the base64 minisign `public_key` and reads its body.
    ///
    /// Fails if the signature or its trusted comment does not verify, or if a field is
    /// outside the schema 1 contract.
    pub fn verify(envelope: &Envelope, public_key: &str) -> Result<Self, DeliveryError> {
        let bytes = STANDARD
            .decode(&envelope.manifest)
            .map_err(|_| invalid("manifest encoding"))?;
        let key = PublicKey::from_base64(public_key).map_err(|_| invalid("public key"))?;
        let signature = Signature::decode(&envelope.signature).map_err(|_| invalid("signature"))?;
        key.verify(&bytes, &signature, false)
            .map_err(|_| DeliveryError::Signature)?;

        let manifest: Manifest =
            serde_json::from_slice(&bytes).map_err(|_| invalid("manifest body"))?;
        manifest.validate()?;

        // The global signature covers the trusted comment, which holds the channel,
        // sequence and release version of the signed manifest.
        let comment = format!(
            "{} {} {}",
            manifest.channel, manifest.sequence, manifest.release.version
        );
        if signature.trusted_comment() != comment {
            return Err(DeliveryError::Signature);
        }

        Ok(manifest)
    }

    /// Returns `true` if the release serves `manager`.
    pub fn serves(&self, manager: &Version) -> bool {
        VersionReq::parse(&self.release.managers).is_ok_and(|range| range.matches(manager))
    }

    fn validate(&self) -> Result<(), DeliveryError> {
        let release = &self.release;

        if self.schema != 1 {
            return Err(invalid("schema"));
        }
        if self.sequence == 0 {
            return Err(invalid("sequence"));
        }
        if !is_release_name(&release.version) {
            return Err(invalid("release.version"));
        }
        if !is_digest(&release.digest) {
            return Err(invalid("release.digest"));
        }
        if release.size == 0 || release.size > MAX_DLL_BYTES {
            return Err(invalid("release.size"));
        }
        if !release.managers.trim_start().starts_with(">=")
            || VersionReq::parse(&release.managers).is_err()
        {
            return Err(invalid("release.managers"));
        }
        if !self.revoked.iter().all(|digest| is_digest(digest)) {
            return Err(invalid("revoked"));
        }

        Ok(())
    }
}

/// Returns `true` if `value` is a lowercase hex SHA-256 digest.
pub fn is_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn is_release_name(value: &str) -> bool {
    value.strip_prefix("ltk_patcher-").is_some_and(|run| {
        !run.is_empty() && !run.starts_with('0') && run.bytes().all(|b| b.is_ascii_digit())
    })
}

fn invalid(field: &'static str) -> DeliveryError {
    DeliveryError::Invalid { field }
}
