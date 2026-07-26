//! Authoring-side mod projects.
//!
//! Only the domain error lives here so far — [`crate::error::AppError`] wraps it
//! and so cannot be lifted without it. The rest of the workshop service follows.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Domain errors specific to workshop operations.
///
/// Sent over IPC as the `context` payload of an `AppError` with code `WORKSHOP`.
/// Frontend code can switch on `kind` to handle each variant.
#[derive(Debug, Clone, Serialize, Deserialize, Error)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WorkshopError {
    /// One or more files already exist in the target layer directory.
    #[error("File(s) already exist in target layer: {conflicts:?}")]
    LayerFileConflict { conflicts: Vec<String> },
}
