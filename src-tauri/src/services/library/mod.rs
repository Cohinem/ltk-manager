//! The library service: the installed mods, their folders and profiles, their health, and the
//! migration into the library.
//!
//! Its state is managed in `setup`, beside the patcher and the settings it is built from.

mod folders;
mod health;
mod migration;
mod mods;
mod native;
mod profiles;

pub use folders::*;
pub use health::*;
pub use migration::*;
pub use mods::*;
pub use native::*;
pub use profiles::*;

use tauri::plugin::TauriPlugin;
use tauri::Wry;

/// The library's row of `services/table.rs`.
pub struct Table;

/// The plugin answering the library's commands.
pub fn plugin() -> TauriPlugin<Wry> {
    super::plugin::<Table>().build()
}
