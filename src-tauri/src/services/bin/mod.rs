//! The bin service: the bin editor's open documents and the meta schema they are read with.
//!
//! Its state is managed in `setup`, beside the sandboxes and the tables it reads through.

mod documents;
mod meta_docs;

pub use documents::*;
pub use meta_docs::*;

use tauri::plugin::TauriPlugin;
use tauri::Wry;

/// The bin service's row of `services/table.rs`.
pub struct Table;

/// The plugin answering the bin editor's commands.
pub fn plugin() -> TauriPlugin<Wry> {
    super::plugin::<Table>().build()
}
