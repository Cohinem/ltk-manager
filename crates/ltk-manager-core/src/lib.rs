//! UI-agnostic core for LTK Manager.
//!
//! Hosts the parts of the backend that don't depend on Tauri so they can be
//! shared with non-GUI frontends (e.g. a future CLI). UI-facing conditions are
//! reported through listener traits (see [`patcher::session::PatcherEvents`]);
//! the Tauri shell in `src-tauri` supplies the adapters.

pub mod bin_document;
pub mod bin_walk;
pub mod deep_link;
pub mod github;
pub mod meta_docs;
pub mod meta_schema;
pub mod mods;
pub mod news;
pub mod object_index;
pub mod overlay;
pub mod patching;
pub mod problems;
pub mod releases;
pub mod sandbox;
pub mod vfx;
pub mod workshop;
