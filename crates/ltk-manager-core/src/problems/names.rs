//! Turning the hashes a bin addresses things by back into names.
//!
//! A bin stores hashes, and two sources turn them back. Four mimir tables -
//! `binentries` names an object's path, `bintypes` a class, `binfields` a
//! property and `binhashes` the string behind a `Hash` value - and the tables
//! the mod itself declares under `hashes/`, for the names only it holds.
//!
//! **Each kind is looked up in its own table.** All four are `FNV1a32`, and 32
//! bits over that many rows collide freely, so asking one shared lookup would
//! answer a property with an object's path. A wrong name is worse than a
//! number, so a miss is a number.
//!
//! A name is mostly for reading, and one repair also turns on it: a `Hash`
//! value the game now wants as `File` can only be rewritten from the path
//! behind it. [`path_value`](BinNames::path_value) is that repair's lookup,
//! and it reaches further than the reading ones: past `binhashes` it asks the
//! game hashtables - whose names are paths keyed by `XXH64` - by hashing
//! their names under `FNV1a32`, built as an index once and only on the first
//! ask. A [`Site`](super::Site) still addresses a property by hash, so a
//! cache that arrives or leaves between a run and a fix cannot change what a
//! repair matches - only what a row draws, and whether that one conversion
//! applies.

use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;

use ltk_hash::{BinHash, Hash as _};
use ltk_hashdb::LayeredHashDb;
use ltk_hashtable::{Category, HashtableSet};
use ltk_mod_project::ModProject;

use crate::hashtables::{BinHashTables, HashtableCache};

/// The names a bin's hashes can be given, out of the shared mimir cache and
/// the mod's own declared tables.
pub struct BinNames {
    cache: BinHashTables,
    /// What the mod's own `hashes/` tables resolve, empty where it declares
    /// none. The same `FNV1a32` universe as the cache, consulted per category
    /// for the same reason the cache is.
    declared: HashtableSet,
    /// The names of the mod's own game-category tables, for the FNV index.
    declared_game: Vec<String>,
    /// The mimir WAD tables, whose names feed the FNV index.
    wad: LayeredHashDb,
    /// `FNV1a32` over every game-table name, keyed to where the name can be
    /// read back. `None` marks a hash two different names collide on, which a
    /// repair must refuse rather than guess about.
    ///
    /// Built on the first [`path_value`](Self::path_value) miss: the game
    /// tables hold millions of names, and most runs never ask.
    fnv_index: OnceLock<HashMap<u32, Option<GamePath>>>,
}

/// One game-table name, addressed the way its source reads it back.
///
/// The index stores this rather than the name so millions of entries cost a
/// key each instead of a string each.
enum GamePath {
    /// A mimir WAD table name, under its `XXH64` key.
    Wad(u64),
    /// A name of the mod's own game tables, by position.
    Declared(u32),
}

impl BinNames {
    /// Open the bin tables of the shared cache, and `project_root`'s own.
    ///
    /// A cache that is not there names nothing, which reads the same way a hash
    /// no table holds does: the row prints the number. A project declaring no
    /// tables, or one whose tables cannot be read, contributes nothing the same
    /// way.
    #[must_use]
    pub fn open(project_root: &Path) -> Self {
        let (cache, wad) = match HashtableCache::shared() {
            Ok(cache) => (cache.bin_tables(), cache.wad_tables()),
            Err(e) => {
                tracing::debug!("No hashtable cache to name bin hashes with: {e}");
                (BinHashTables::default(), LayeredHashDb::new())
            }
        };

        let tables = camino::Utf8Path::from_path(project_root)
            .and_then(|root| ModProject::load(root).ok())
            .map_or_else(Vec::new, |project| {
                super::preserve::read_tables(project_root, &project.hashtables)
            });
        let declared_game = tables
            .iter()
            .filter(|(entry, _)| *entry.category() == Category::Game)
            .flat_map(|(_, table)| table.names().map(str::to_owned))
            .collect();

        Self {
            cache,
            declared: HashtableSet::build(tables),
            declared_game,
            wad,
            fnv_index: OnceLock::new(),
        }
    }

    /// Name nothing, which is what a run with no cache does.
    #[must_use]
    pub fn none() -> Self {
        Self::default()
    }

    /// The name of a property, for a segment of a property path.
    #[must_use]
    pub fn field(&self, hash: BinHash) -> Option<String> {
        self.cache.field(hash)
    }

    /// The string behind a `Hash` value, for a map key or a `Hash` property.
    ///
    /// The cache answers first and the mod's own tables fill what it misses,
    /// which is the same order the repair embeds names in: a mod's table holds
    /// what the community's do not.
    #[must_use]
    pub fn value(&self, hash: BinHash) -> Option<String> {
        self.cache
            .value(hash)
            .or_else(|| self.resolve_declared(&Category::BinHashes, hash))
    }

    /// The path behind a `Hash` value, for the repair that rewrites it as
    /// `File`.
    ///
    /// Everything [`value`](Self::value) reads, and then the game hashtables -
    /// mimir's and the mod's own - whose names are the paths themselves,
    /// checked under `FNV1a32`. The first ask that reaches them pays for the
    /// index once, and a hash two game-table names collide on stays
    /// unresolved: a repair writing the wrong path is worse than no repair.
    #[must_use]
    pub fn path_value(&self, hash: BinHash) -> Option<String> {
        if let Some(name) = self.value(hash) {
            return Some(name);
        }
        self.fnv_index()
            .get(&hash.0)?
            .as_ref()
            .and_then(|key| self.game_path(key))
    }

    /// The path of an object, for the entry a site names.
    #[must_use]
    pub fn entry(&self, hash: BinHash) -> Option<String> {
        self.cache
            .entry(hash)
            .or_else(|| self.resolve_declared(&Category::BinEntries, hash))
    }

    /// The name of a class.
    #[must_use]
    pub fn class(&self, hash: BinHash) -> Option<String> {
        self.cache.class(hash)
    }

    fn resolve_declared(&self, category: &Category, hash: BinHash) -> Option<String> {
        self.declared
            .resolve_value(category, u64::from(hash.0))
            .map(str::to_owned)
    }

    /// Read one indexed name back out of its source.
    fn game_path(&self, key: &GamePath) -> Option<String> {
        match key {
            GamePath::Wad(hash) => Some(self.wad.get(*hash)?.into_owned()),
            GamePath::Declared(at) => self.declared_game.get(*at as usize).cloned(),
        }
    }

    /// The FNV index over the game-table names, built on the first ask.
    fn fnv_index(&self) -> &HashMap<u32, Option<GamePath>> {
        self.fnv_index.get_or_init(|| {
            let started = std::time::Instant::now();
            let mut index = HashMap::new();

            let wad = self
                .wad
                .iter()
                .map(|(hash, path)| (GamePath::Wad(hash), path.into_owned()));
            let declared = self
                .declared_game
                .iter()
                .enumerate()
                .map(|(at, name)| (GamePath::Declared(at as u32), name.clone()));

            for (key, name) in wad.chain(declared) {
                let fnv = BinHash::hash_str(&name).0;
                match index.entry(fnv) {
                    std::collections::hash_map::Entry::Vacant(slot) => {
                        slot.insert(Some(key));
                    }
                    std::collections::hash_map::Entry::Occupied(mut held) => {
                        /* Two names on one FNV hash. Where they are the same
                        path from two sources the first stays. Different paths
                        poison the hash for good, because a repair must not
                        pick one. */
                        let kept = held
                            .get()
                            .as_ref()
                            .and_then(|kept| self.game_path(kept))
                            .is_some_and(|kept| kept.eq_ignore_ascii_case(&name));
                        if !kept {
                            held.insert(None);
                        }
                    }
                }
            }

            tracing::debug!(
                "Indexed {} game-table names under FNV1a32 in {:?}",
                index.len(),
                started.elapsed()
            );
            index
        })
    }
}

impl Default for BinNames {
    fn default() -> Self {
        Self {
            cache: BinHashTables::default(),
            declared: HashtableSet::build(std::iter::empty()),
            declared_game: Vec::new(),
            wad: LayeredHashDb::new(),
            fnv_index: OnceLock::new(),
        }
    }
}

impl std::fmt::Debug for BinNames {
    /// The sources hold no `Debug` of their own, so the cache stands in.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BinNames")
            .field("cache", &self.cache)
            .finish_non_exhaustive()
    }
}

/// A hash as a row prints one, which is `0x` and eight digits.
#[must_use]
pub fn hex(hash: BinHash) -> String {
    format!("0x{:08x}", hash.0)
}

#[cfg(test)]
mod tests;
