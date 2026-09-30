//! The workshop service: the projects, their layers, folders and text files, and their problems.
//!
//! Its state is managed in `setup`, beside the settings and the registry it is built from.

mod problems;
mod projects;

pub use problems::*;
pub use projects::*;

use tauri::plugin::TauriPlugin;
use tauri::Wry;

/// The workshop's row of `services/table.rs`.
pub struct Table;

/// The plugin answering the workshop's commands.
pub fn plugin() -> TauriPlugin<Wry> {
    super::plugin::<Table>().build()
}
