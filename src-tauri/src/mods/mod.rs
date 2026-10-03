//! Tauri-facing surface over [`ltk_manager_library::mods`].
//!
//! The library itself is UI-agnostic and lives in that crate. What stays here is what
//! needs Tauri: the managed-state wrapper and the filesystem watcher, which
//! reconciles the index off an `AppHandle` and emits to the frontend.

pub use ltk_manager_library::mods::*;

pub(crate) mod watcher;

/// Tauri managed state wrapper for [`ModLibrary`].
pub struct ModLibraryState(pub ModLibrary);
