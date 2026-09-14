use serde::{Deserialize, Serialize};

/// A supported external tool.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, strum::Display)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "kebab-case")]
pub enum Tool {
    /// WAD extraction and hashtable tools.
    Wadtools,
    /// Texture conversion and Explorer tools.
    TexToolz,
}

impl Tool {
    pub(super) fn id(self) -> &'static str {
        match self {
            Self::Wadtools => "wadtools",
            Self::TexToolz => "tex-toolz",
        }
    }
    pub(super) fn repo(self) -> &'static str {
        match self {
            Self::Wadtools => "wadtools",
            Self::TexToolz => "ltk-tex-utils",
        }
    }
    pub(super) fn executable(self) -> &'static str {
        match self {
            Self::Wadtools => "wadtools.exe",
            Self::TexToolz => "ltk-tex-utils.exe",
        }
    }
}

/// The requested installation change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum IntegrationAction {
    /// Install or update to a verified stable release.
    Install,
    /// Install the executable without adding context menus.
    InstallOnly,
    /// Restore the installed release's files.
    Repair,
    /// Remove owned registrations and executable files.
    Uninstall,
    /// Register classic context menus.
    EnableMenu,
    /// Restore the registrations replaced by Manager.
    DisableMenu,
}

/// An explicit replacement decision for existing context menus.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum MenuConflictPolicy {
    /// Preserve another installation's registrations.
    Preserve,
    /// Replace observed registrations, keeping their backup.
    Replace,
}

/// An observed classic context-menu state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum MenuStatus {
    /// No menus are registered.
    Absent,
    /// All menus match the Manager receipt.
    Enabled,
    /// Existing menus are not owned by this installation.
    External,
    /// Registrations changed or an operation was interrupted.
    Changed,
}

/// A stage of an installation operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum IntegrationStage {
    /// Resolving release metadata.
    Checking,
    /// Downloading and verifying release files.
    Downloading,
    /// Applying the executable installation.
    Installing,
    /// Changing Explorer registrations.
    Registering,
    /// Removing owned files.
    Removing,
    /// The requested operation completed.
    Complete,
    /// The operation failed and can be inspected.
    Failed,
    /// The download was cancelled before registration.
    Cancelled,
}

/// A retryable integration failure.
#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum IntegrationError {
    /// No supported Windows architecture is available.
    #[error("unsupported integration platform")]
    Unsupported,
    /// Another mutation holds the installation lock.
    #[error("another integration operation is running")]
    Busy,
    /// Explorer registrations changed outside Manager.
    #[error("context menus belong to another installation or changed")]
    Conflict,
    /// No managed installation is available.
    #[error("no managed installation exists")]
    NotInstalled,
    /// A receipt is invalid or newer than this reader.
    #[error("invalid installation receipt")]
    InvalidReceipt,
    /// A release cannot be used by this adapter.
    #[error("unsupported release contract: {detail}")]
    Release { detail: String },
    /// Downloaded bytes do not match the release digest.
    #[error("release integrity verification failed")]
    Integrity,
    /// The user cancelled before registration.
    #[error("download cancelled")]
    Cancelled,
    /// An operating system or transport operation failed.
    #[error("{detail}")]
    Operation { detail: String },
}

impl From<std::io::Error> for IntegrationError {
    fn from(error: std::io::Error) -> Self {
        Self::Operation {
            detail: error.to_string(),
        }
    }
}
impl From<reqwest::Error> for IntegrationError {
    fn from(error: reqwest::Error) -> Self {
        Self::Operation {
            detail: error.to_string(),
        }
    }
}
impl From<serde_json::Error> for IntegrationError {
    fn from(error: serde_json::Error) -> Self {
        Self::Operation {
            detail: error.to_string(),
        }
    }
}

/// The operation snapshot retained when the settings panel unmounts.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct IntegrationOperation {
    /// Unique operation identity.
    pub id: String,
    /// The tool being changed.
    pub tool: Tool,
    /// Current lifecycle stage.
    pub stage: IntegrationStage,
    /// Bytes received during the current download.
    pub downloaded: u64,
    /// Expected bytes for the current download.
    pub total: Option<u64>,
    /// The terminal failure, if any.
    pub error: Option<IntegrationError>,
}

/// A stable release available for installation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct IntegrationRelease {
    /// Release tag from the tool repository.
    pub tag: String,
    /// Human-readable release page.
    pub url: String,
}

/// Local files and Explorer registrations observed independently of release availability.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS, specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct IntegrationStatus {
    /// The external tool.
    pub tool: Tool,
    /// Whether mutations are supported on this machine.
    pub supported: bool,
    /// Installed release from the ownership receipt.
    pub version: Option<String>,
    /// The managed executable directory.
    pub directory: Option<String>,
    /// Managed files are missing or an operation was interrupted.
    pub needs_repair: bool,
    /// Old executable files could not yet be removed.
    pub pending_cleanup: bool,
    /// Classic context-menu health.
    pub menu: MenuStatus,
    /// Whether the managed installation requests classic menus.
    pub menu_requested: bool,
    /// Unmanaged executable candidates, never run during discovery.
    pub external_paths: Vec<String>,
    /// The registered machine-wide texture handler path, if present.
    pub handler_path: Option<String>,
    /// Last operation observed in this application process.
    pub operation: Option<IntegrationOperation>,
}
