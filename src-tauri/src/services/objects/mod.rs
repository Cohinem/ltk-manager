//! The objects service: the index of every object the installed game declares, and the reads
//! and walks over it.
//!
//! Its state is managed in `setup`, beside the game index it is built from.

pub(crate) mod index;

pub use index::*;

use tauri::plugin::TauriPlugin;
use tauri::Wry;

/// The objects service's row of `services/table.rs`.
pub struct Table;

/// The plugin answering the object index's commands.
pub fn plugin() -> TauriPlugin<Wry> {
    super::plugin::<Table>().build()
}
