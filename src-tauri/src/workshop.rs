//! Tauri's view of the workshop service.
//!
//! The service itself lives in core. All that belongs here is the managed-state
//! newtype Tauri needs for `.manage()` / `State<T>` extraction, the watches on the
//! open projects' layers and Atlas sources, and a re-export so command handlers keep addressing
//! everything as `crate::workshop::*`.

mod sheet_sources;
mod watcher;

pub use ltk_manager_core::workshop::*;
pub use sheet_sources::source_rebuild;
pub use watcher::LayerWatches;

/// Tauri managed state wrapper for [`Workshop`].
pub struct WorkshopState(pub Workshop);
