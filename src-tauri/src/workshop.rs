//! Tauri's view of the workshop service.
//!
//! The service itself lives in core. All that belongs here is the managed-state
//! newtype Tauri needs for `.manage()` / `State<T>` extraction, plus a re-export
//! so command handlers keep addressing everything as `crate::workshop::*`.

pub use ltk_manager_core::workshop::*;

/// Tauri managed state wrapper for [`Workshop`].
pub struct WorkshopState(pub Workshop);
