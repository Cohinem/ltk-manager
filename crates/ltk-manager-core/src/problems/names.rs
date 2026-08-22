//! Turning the hashes a bin addresses things by back into names.
//!
//! A bin stores hashes, and four mimir tables turn them back: `binentries`
//! names an object's path, `bintypes` a class, `binfields` a property and
//! `binhashes` the string behind a `Hash` value.
//!
//! **Each kind is looked up in its own table.** All four are `FNV1a32`, and 32
//! bits over that many rows collide freely, so asking one shared lookup would
//! answer a property with an object's path. A wrong name is worse than a
//! number, so a miss is a number.
//!
//! What a name is for is reading. A [`Site`](super::Site) still addresses a
//! property by hash, so a cache that arrives or leaves between a run and a fix
//! cannot change what a repair matches - only what a row draws.

use std::borrow::Cow;

use ltk_hash::BinHash;

use crate::hashtables::{BinHashTables, HashtableCache};

/// The names a bin's hashes can be given, out of the shared mimir cache.
#[derive(Debug, Default)]
pub struct BinNames(BinHashTables);

impl BinNames {
    /// Open the four bin tables of the shared cache.
    ///
    /// A cache that is not there names nothing, which reads the same way a hash
    /// no table holds does: the row prints the number.
    #[must_use]
    pub fn open() -> Self {
        match HashtableCache::discover() {
            Ok(cache) => Self(cache.bin_tables()),
            Err(e) => {
                tracing::debug!("No hashtable cache to name bin hashes with: {e}");
                Self::default()
            }
        }
    }

    /// Name nothing, which is what a run with no cache does.
    #[must_use]
    pub fn none() -> Self {
        Self::default()
    }

    /// The name of a property, for a segment of a property path.
    #[must_use]
    pub fn field(&self, hash: BinHash) -> Option<Cow<'_, str>> {
        self.0.field(hash)
    }

    /// The string behind a `Hash` value, for a map key or a `Hash` property.
    #[must_use]
    pub fn value(&self, hash: BinHash) -> Option<Cow<'_, str>> {
        self.0.value(hash)
    }

    /// The path of an object, for the entry a site names.
    #[must_use]
    pub fn entry(&self, hash: BinHash) -> Option<Cow<'_, str>> {
        self.0.entry(hash)
    }

    /// The name of a class.
    #[must_use]
    pub fn class(&self, hash: BinHash) -> Option<Cow<'_, str>> {
        self.0.class(hash)
    }
}

/// A hash as a row prints one, which is `0x` and eight digits.
#[must_use]
pub fn hex(hash: BinHash) -> String {
    format!("0x{:08x}", hash.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every lookup has to miss rather than answer out of another table's
    /// universe, which is the whole reason the four are kept apart.
    #[test]
    fn a_cache_that_is_not_there_names_nothing() {
        let names = BinNames::none();
        let hash = BinHash(0x0032_9f1d);

        assert_eq!(names.field(hash), None);
        assert_eq!(names.value(hash), None);
        assert_eq!(names.entry(hash), None);
        assert_eq!(names.class(hash), None);
    }

    #[test]
    fn a_hash_with_no_name_prints_as_eight_digits() {
        assert_eq!(hex(BinHash(0x0032_9f1d)), "0x00329f1d");
        assert_eq!(hex(BinHash(0xffff_ffff)), "0xffffffff");
    }
}
