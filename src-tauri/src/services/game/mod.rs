//! The game service: the installed game's archives folded into one index, its WADs, the
//! extraction to disk, the hashtables that name them, the string keys and the champions.
//!
//! Its state is managed in `setup`, beside the library that keeps the hashtables current.

mod champions;
pub(crate) mod extract;
pub(crate) mod hashtables;
pub(crate) mod index;
mod strings;
mod wads;

pub use champions::*;
pub use extract::*;
pub use hashtables::*;
pub use index::*;
pub use strings::*;
pub use wads::*;

use tauri::plugin::TauriPlugin;
use tauri::Wry;

/// The game service's row of `services/table.rs`.
pub struct Table;

/// The plugin answering the game service's commands.
pub fn plugin() -> TauriPlugin<Wry> {
    super::plugin::<Table>().build()
}
