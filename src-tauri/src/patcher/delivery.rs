//! Builds the patcher delivery client of this manager build and runs its background syncs.

use std::path::Path;
use std::sync::Arc;

use ltk_manager_base::config::Config;
use ltk_manager_runtime::patcher::delivery::{attested_manager, Channel, PatcherDelivery};
use parking_lot::Mutex;
use semver::{Prerelease, Version};

// shortcut: the staging service and its key, switch both when the production service exists.
/// Base URL of the public delivery service.
const DELIVERY_URL: &str = "https://patcher-staging.leaguetoolkit.dev";
/// Base64 minisign public key of the delivery manifests.
const MANIFEST_PUBLIC_KEY: &str = "RWRHh5bl7JOIscd3lf1Sw2xqd5qcoSeau1GmXjBm7C4KA4YSB0DOf+Kx";

/// Build attestation that the release workflow signed for this manager version.
///
/// Read by `option_env!` at compile time. A build without it runs the bundled DLL only.
const ATTESTATION: Option<&str> = option_env!("LTK_PATCHER_ATTESTATION");

/// Host protocol of `resources/ltk_patcher_host.exe`. It must change together with the binary.
const BUNDLED_HOST_PROTOCOL: u32 = 2;

/// Tauri-managed delivery client, and the lock that allows one sync at a time.
pub struct PatcherDeliveryState {
    delivery: Option<Arc<PatcherDelivery>>,
    syncing: Arc<Mutex<()>>,
}

impl PatcherDeliveryState {
    /// Builds the client with its state under `app_data_dir`.
    ///
    /// Removes the staged builds that no cached manifest offers, before any session can
    /// select one. Returns a state without a client if the target is not Windows, if the
    /// build has no [`ATTESTATION`] or its attestation names another manager version, or
    /// if `app_data_dir` is `None`.
    pub fn new(app_data_dir: Option<&Path>) -> Self {
        let manager = Version {
            pre: Prerelease::EMPTY,
            ..Version::parse(env!("CARGO_PKG_VERSION")).expect("CARGO_PKG_VERSION is semver")
        };
        let release = manager.to_string();

        let delivery = match (cfg!(windows), ATTESTATION, app_data_dir) {
            (true, Some(attestation), Some(dir))
                if attested_manager(attestation).as_deref() == Some(release.as_str()) =>
            {
                Some(Arc::new(PatcherDelivery {
                    root: dir.join("patcher"),
                    url: DELIVERY_URL.to_string(),
                    public_key: MANIFEST_PUBLIC_KEY.to_string(),
                    attestation: attestation.to_string(),
                    manager,
                    protocol: BUNDLED_HOST_PROTOCOL,
                }))
            }
            (true, Some(_), Some(_)) => {
                tracing::warn!(
                    %release,
                    "The build attestation does not name this manager version. Running the bundled patcher DLL only"
                );
                None
            }
            _ => None,
        };
        if let Some(delivery) = &delivery {
            delivery.remove_unused();
        }

        Self {
            delivery,
            syncing: Arc::new(Mutex::new(())),
        }
    }

    /// Returns the client, or `None` if this build does not use delivery.
    pub fn delivery(&self) -> Option<&PatcherDelivery> {
        self.delivery.as_deref()
    }

    /// Syncs the channel of `config` on a background thread, after any running sync.
    pub fn sync_in_background(&self, config: &Config) {
        let Some(delivery) = self.delivery.clone() else {
            return;
        };

        let syncing = Arc::clone(&self.syncing);
        let channel = channel(config);
        std::thread::spawn(move || {
            let _guard = syncing.lock();
            sync(&delivery, channel);
        });
    }
}

/// Returns the delivery channel that `config` selects.
pub fn channel(config: &Config) -> Channel {
    if config.beta_patcher {
        Channel::Beta
    } else {
        Channel::Stable
    }
}

/// Syncs `channel` and logs a failure.
fn sync(delivery: &PatcherDelivery, channel: Channel) {
    if let Err(error) = delivery.sync(channel) {
        tracing::warn!(%channel, %error, "Patcher delivery sync failed");
    }
}
