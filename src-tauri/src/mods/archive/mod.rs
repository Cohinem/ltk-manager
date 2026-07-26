//! Mod archives: getting them in, reading what's inside, taking them out.
//!
//! A mod arrives as a single `.modpkg` or `.fantome` file. [`install`] copies it
//! into storage and has [`metadata`] extract a `mod.config.json` beside it, so
//! the library view never has to mount every archive just to render a list.
//! [`inspect`] reads an archive the user hasn't installed yet, and [`migration`]
//! brings in a whole cslol-manager directory at once.

pub(super) mod inspect;
pub(super) mod install;
pub(super) mod metadata;
pub(super) mod migration;
