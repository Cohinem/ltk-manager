//! How a domain error reaches the frontend.
//!
//! [`AppError`] itself lives in core and says only what went wrong. This module
//! owns the IPC representation of it: a stable [`ErrorCode`] the frontend can
//! match on, the [`AppErrorResponse`] payload, and the [`IpcResult`] envelope
//! every command returns. The `From<AppError>` mapping below is the single place
//! that decides which variants collapse to the same code and which carry context.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub use ltk_manager_core::error::{AppError, AppResult, MutexResultExt, Utf8PathExt};

/// Error codes that can be communicated across the IPC boundary.
/// These are serialized as SCREAMING_SNAKE_CASE for TypeScript consumption.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    /// File system I/O error
    Io,
    /// JSON serialization/deserialization error
    Serialization,
    /// Error processing a .modpkg file
    Modpkg,
    /// League of Legends installation not found
    LeagueNotFound,
    /// Invalid file or directory path
    InvalidPath,
    /// Requested mod was not found
    ModNotFound,
    /// Validation failed (e.g., invalid settings)
    ValidationFailed,
    /// Internal state error (e.g., mutex poisoned)
    InternalState,
    /// Mutex lock failed (poisoned)
    MutexLockFailed,
    /// Unknown/unclassified error
    Unknown,
    /// Workshop directory not configured
    WorkshopNotConfigured,
    /// Workshop project not found
    ProjectNotFound,
    /// Workshop project already exists
    ProjectAlreadyExists,
    /// Failed to pack workshop project
    PackFailed,
    /// Error processing a .fantome file
    Fantome,
    /// WAD file error
    Wad,
    /// Patcher domain error. The specific variant is in `context.kind`.
    Patcher,
    /// ZIP error
    Zip,
    /// Library index was written by a newer app version
    SchemaVersionTooNew,
    /// Workshop domain error. The specific variant is in `context.kind`.
    Workshop,
    /// A launch failed. The specific variant is in `context.kind`.
    ///
    /// One code, not one per [`LauncherError`] variant. The whole error is
    /// already serialized into the context, so a code per variant put the same
    /// discriminant on the wire twice, and lossily: `SpawnFailed` and
    /// `UnsupportedPlatform` shared one code that the context tells apart.
    Launcher,
    /// A hashtable cache operation failed. The message says which and why.
    ///
    /// One code, not one per `HashtableError` variant. Unlike the launcher's,
    /// this error is not `Serialize`, so there is no context to carry the
    /// variant and the message is where the detail rides.
    Hashtable,
    /// An asset could not be previewed. The message says why.
    Preview,
}

/// Structured error response sent over IPC.
/// This provides rich error information to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, rename = "AppError")]
#[serde(rename_all = "camelCase")]
pub struct AppErrorResponse {
    /// Machine-readable error code for pattern matching
    pub code: ErrorCode,
    /// Human-readable error message
    pub message: String,
    /// Optional contextual data (e.g., the invalid path, missing mod ID)
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "unknown")]
    pub context: Option<serde_json::Value>,
}

impl AppErrorResponse {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            context: None,
        }
    }

    pub fn with_context(mut self, context: impl Serialize) -> Self {
        self.context = serde_json::to_value(context).ok();
        self
    }
}

/// Result type for IPC commands.
///
/// ```rust
/// #[tauri::command]
/// pub fn my_command() -> IpcResult<String> {
///     my_command_inner().into()
/// }
///
/// fn my_command_inner() -> AppResult<String> {
///     Ok("value".to_string())
/// }
/// ```
///
/// Serializes to: `{ "ok": true, "value": T }` or `{ "ok": false, "error": ... }`
#[derive(Debug, Clone)]
pub enum IpcResult<T> {
    Ok { value: T },
    Err { error: AppErrorResponse },
}

// Custom serialization to use actual boolean values for the `ok` field
impl<T: Serialize> Serialize for IpcResult<T> {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        match self {
            IpcResult::Ok { value } => {
                let mut state = serializer.serialize_struct("IpcResult", 2)?;
                state.serialize_field("ok", &true)?;
                state.serialize_field("value", value)?;
                state.end()
            }
            IpcResult::Err { error } => {
                let mut state = serializer.serialize_struct("IpcResult", 2)?;
                state.serialize_field("ok", &false)?;
                state.serialize_field("error", error)?;
                state.end()
            }
        }
    }
}

impl<T> IpcResult<T> {
    pub fn ok(value: T) -> Self {
        IpcResult::Ok { value }
    }

    #[allow(dead_code)]
    pub fn err(error: impl Into<AppErrorResponse>) -> Self {
        IpcResult::Err {
            error: error.into(),
        }
    }
}

impl<T, E: Into<AppErrorResponse>> From<Result<T, E>> for IpcResult<T> {
    fn from(result: Result<T, E>) -> Self {
        match result {
            Ok(value) => IpcResult::Ok { value },
            Err(e) => IpcResult::Err { error: e.into() },
        }
    }
}

impl From<AppError> for AppErrorResponse {
    fn from(error: AppError) -> Self {
        match error {
            AppError::Io(e) => AppErrorResponse::new(ErrorCode::Io, e.to_string()),

            AppError::Serialization(e) => {
                AppErrorResponse::new(ErrorCode::Serialization, e.to_string())
            }

            AppError::Modpkg(e) => AppErrorResponse::new(ErrorCode::Modpkg, e.to_string()),

            AppError::LeagueNotFound => {
                AppErrorResponse::new(ErrorCode::LeagueNotFound, "League installation not found")
            }

            AppError::InvalidPath(path) => {
                AppErrorResponse::new(ErrorCode::InvalidPath, format!("Invalid path: {}", path))
                    .with_context(serde_json::json!({ "path": path }))
            }

            AppError::ModNotFound(id) => {
                AppErrorResponse::new(ErrorCode::ModNotFound, format!("Mod not found: {}", id))
                    .with_context(serde_json::json!({ "modId": id }))
            }

            AppError::ValidationFailed(msg) => {
                AppErrorResponse::new(ErrorCode::ValidationFailed, msg)
            }

            AppError::InternalState(msg) => AppErrorResponse::new(ErrorCode::InternalState, msg),

            AppError::MutexLockFailed => {
                AppErrorResponse::new(ErrorCode::MutexLockFailed, "Failed to acquire mutex lock")
            }

            AppError::Other(msg) => AppErrorResponse::new(ErrorCode::Unknown, msg),

            AppError::WorkshopNotConfigured => AppErrorResponse::new(
                ErrorCode::WorkshopNotConfigured,
                "Workshop directory not configured",
            ),

            AppError::ProjectNotFound(name) => AppErrorResponse::new(
                ErrorCode::ProjectNotFound,
                format!("Project not found: {}", name),
            )
            .with_context(serde_json::json!({ "projectName": name })),

            AppError::ProjectAlreadyExists(name) => AppErrorResponse::new(
                ErrorCode::ProjectAlreadyExists,
                format!("Project already exists: {}", name),
            )
            .with_context(serde_json::json!({ "projectName": name })),

            AppError::PackFailed(msg) => AppErrorResponse::new(ErrorCode::PackFailed, msg),

            AppError::Fantome(msg) => AppErrorResponse::new(ErrorCode::Fantome, msg),

            AppError::WadError(e) => AppErrorResponse::new(ErrorCode::Wad, e.to_string()),

            AppError::WadBuilderError(e) => AppErrorResponse::new(ErrorCode::Wad, e.to_string()),

            AppError::Patcher(patcher_err) => {
                let mut response =
                    AppErrorResponse::new(ErrorCode::Patcher, patcher_err.to_string());
                response.context = serde_json::to_value(&patcher_err).ok();
                response
            }

            // Unlike the patcher, each launcher failure gets its own code: the
            // frontend offers a different remedy for each, so collapsing them
            // into one code plus a `kind` would just move the switch.
            AppError::Launcher(launcher_err) => {
                let mut response =
                    AppErrorResponse::new(ErrorCode::Launcher, launcher_err.to_string());
                response.context = serde_json::to_value(&launcher_err).ok();
                response
            }

            AppError::ZipError(e) => AppErrorResponse::new(ErrorCode::Zip, e.to_string()),

            AppError::SchemaVersionTooNew { file_version, max_supported } => AppErrorResponse::new(
                ErrorCode::SchemaVersionTooNew,
                format!(
                    "Your mod library was created by a newer version of the app (schema v{}). This version only supports up to v{}.",
                    file_version, max_supported
                ),
            )
            .with_context(serde_json::json!({ "fileVersion": file_version, "maxSupported": max_supported })),

            AppError::Workshop(workshop_err) => {
                let mut response = AppErrorResponse::new(ErrorCode::Workshop, workshop_err.to_string());
                response.context = serde_json::to_value(&workshop_err).ok();
                response
            }

            AppError::Hashtable(hashtable_err) => {
                AppErrorResponse::new(ErrorCode::Hashtable, hashtable_err.to_string())
            }

            AppError::Preview(preview_err) => {
                AppErrorResponse::new(ErrorCode::Preview, preview_err.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests;
