//! `library.json` — its shape, its versioning, and keeping it true to disk.
//!
//! One document holds every mod entry, profile, and folder, which is why
//! [`document`] serializes all access through a lock: each write rewrites the
//! whole file, so two concurrent commands would clobber each other. The other
//! two modules exist because that document outlives the code that wrote it —
//! [`schema_migration`] carries old files forward, and [`reconcile`] repairs the
//! drift that accumulates when the filesystem changes behind the app's back.

pub(super) mod document;
pub(super) mod reconcile;
pub(super) mod schema_migration;

pub(crate) use document::{
    LibraryIndex, LibraryModEntry, ModArchiveFormat, atomic_write_json, get_active_profile,
    get_profile_by_id, library_index_path, resolve_profile_dirs,
};
