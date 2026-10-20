//! Builds the patcher delivery client of this manager build and runs its background syncs.

use std::path::Path;
use std::sync::Arc;

use ltk_manager_base::config::Config;
use ltk_manager_runtime::patcher::delivery::{Channel, PatcherDelivery};
use parking_lot::Mutex;
use semver::{Prerelease, Version};

// shortcut: the staging service and its key, switch both when the production service exists.
/// Base URL of the public delivery service.
const DELIVERY_URL: &str = "https://patcher-staging.leaguetoolkit.dev";
/// Base64 minisign public key of the delivery manifests.
const MANIFEST_PUBLIC_KEY: &str = "RWRHh5bl7JOIscd3lf1Sw2xqd5qcoSeau1GmXjBm7C4KA4YSB0DOf+Kx";

/// Client key that the delivery service allowlists for this manager release.
///
/// Read by `option_env!` at compile time. A build without it runs the bundled DLL only.
const CLIENT_KEY: Option<&str> = option_env!("LTK_PATCHER_CLIENT_KEY");

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
    /// build has no [`CLIENT_KEY`], or if `app_data_dir` is `None`.
    pub fn new(app_data_dir: Option<&Path>) -> Self {
        let delivery = match (cfg!(windows), CLIENT_KEY, app_data_dir) {
            (true, Some(client_key), Some(dir)) => Some(Arc::new(PatcherDelivery {
                root: dir.join("patcher"),
                url: DELIVERY_URL.to_string(),
                public_key: MANIFEST_PUBLIC_KEY.to_string(),
                client_key: client_key.to_string(),
                manager: Version {
                    pre: Prerelease::EMPTY,
                    ..Version::parse(env!("CARGO_PKG_VERSION"))
                        .expect("CARGO_PKG_VERSION is semver")
                },
                protocol: BUNDLED_HOST_PROTOCOL,
            })),
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
