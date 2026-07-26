//! UI-agnostic core for LTK Manager.
//!
//! Hosts the parts of the backend that don't depend on Tauri so they can be
//! shared with non-GUI frontends (e.g. a future CLI). UI-facing conditions are
//! reported through listener traits (see [`patcher::session::PatcherEvents`]);
//! the Tauri shell in `src-tauri` supplies the adapters.

pub mod config;
pub mod events;
pub mod patcher;
