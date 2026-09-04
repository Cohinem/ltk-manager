//! Directory names for installed mods.
//!
//! A mod's identity is its UUID. [`ModSlug`] is only what its directory is
//! called, derived from the project `name` so that browsing `mods/` and
//! revealing a mod in the file manager both land somewhere legible. It is
//! assigned once at install and never re-derived, so renaming a mod in the app
//! leaves the directory where every other tool already found it.

use crate::mods::index::LibraryIndex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

/// Fallback when a name slugifies to nothing (symbols, CJK, whitespace).
const FALLBACK_SLUG: &str = "mod";

/// Names Windows refuses to use for a directory, whatever the extension.
///
/// Checked against the base slug before a numeric suffix is added, so a mod
/// called "Con" becomes `con-2` rather than failing to create its directory.
const RESERVED_DEVICE_NAMES: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// The directory name a mod is stored under, inside `<storage>/mods/`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub(crate) struct ModSlug(String);

impl ModSlug {
    /// Derive a free slug for `name`, suffixing `-2`, `-3`… past collisions.
    ///
    /// `taken` is not updated — the caller records the assignment with
    /// [`TakenSlugs::insert`] once the directory is theirs, so a batch install
    /// can assign several before any of them exist on disk.
    pub(crate) fn assign(name: &str, taken: &TakenSlugs) -> Self {
        let base = slug::slugify(name);
        let base = if base.is_empty() {
            FALLBACK_SLUG.to_string()
        } else {
            base
        };

        if !RESERVED_DEVICE_NAMES.contains(&base.as_str()) && !taken.contains(&base) {
            return Self(base);
        }

        let mut suffix = 2u32;
        loop {
            let candidate = format!("{}-{}", base, suffix);
            if !taken.contains(&candidate) {
                return Self(candidate);
            }
            suffix += 1;
        }
    }

    /// Wrap a directory name that already exists on disk.
    ///
    /// Discovery registers a foreign project directory under the name it
    /// already has, which must not move: paths outside the index point at it.
    pub(crate) fn from_dir_name(name: impl Into<String>) -> Self {
        Self(name.into())
    }

    pub(crate) fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for ModSlug {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// Every name under `mods/` that a new slug must avoid.
///
/// Both halves matter: the index knows slugs whose directory a failed install
/// never created, and `mods/` holds names no entry claims.
#[derive(Debug, Default)]
pub(crate) struct TakenSlugs(HashSet<String>);

impl TakenSlugs {
    /// Collect the slugs in `index` and every name under `mods_dir`.
    ///
    /// A mod's directory and the archive beside it share a name, so an archive
    /// whose directory is gone still holds it — otherwise the next mod to
    /// slugify the same way would inherit the stale file as its own.
    pub(crate) fn collect(index: &LibraryIndex, mods_dir: &Path) -> Self {
        let mut taken: HashSet<String> = index
            .mods
            .iter()
            .filter_map(|entry| entry.slug.as_ref())
            .map(|slug| slug.as_str().to_ascii_lowercase())
            .collect();

        if let Ok(entries) = std::fs::read_dir(mods_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = if path.is_dir() {
                    path.file_name()
                } else {
                    path.file_stem()
                };
                if let Some(name) = name.and_then(|name| name.to_str()) {
                    taken.insert(name.to_ascii_lowercase());
                }
            }
        }

        Self(taken)
    }

    pub(crate) fn insert(&mut self, slug: &ModSlug) {
        self.0.insert(slug.as_str().to_ascii_lowercase());
    }

    fn contains(&self, candidate: &str) -> bool {
        self.0.contains(&candidate.to_ascii_lowercase())
    }
}

#[cfg(test)]
mod tests;
