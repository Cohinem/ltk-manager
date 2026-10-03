//! The names a reader resolves bin hashes through.

use ltk_hash::BinHash;
use ltk_wad::WadHash;

use super::{BinHashTables, WadPathResolver};

/// The names the index resolves its hashes through.
///
/// The mimir tables in the app, and whatever a test hands in.
pub trait ObjectNames {
    /// Visit the path of every object in `hashes` a table names, with its index.
    fn for_each_entry(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str));

    /// The name of a class, or `None` when no table names it.
    fn class(&self, hash: BinHash) -> Option<String>;

    /// Visit the path of every chunk in `hashes` a table names, with its index.
    ///
    /// For the declaring files the build sniffed unnamed, which a later table
    /// may name.
    fn for_each_file(&self, hashes: &[WadHash], visit: &mut dyn FnMut(usize, &str));
}

/// The shared cache's names: the bin tables for objects and classes, the WAD
/// tables for declaring files.
#[derive(Debug)]
pub struct CacheNames<'a> {
    bin: &'a BinHashTables,
    wad: &'a WadPathResolver,
}

impl<'a> CacheNames<'a> {
    /// Names out of `bin` and `wad`, both already opened by the caller.
    #[must_use]
    pub fn new(bin: &'a BinHashTables, wad: &'a WadPathResolver) -> Self {
        Self { bin, wad }
    }

    /// The four bin tables.
    #[must_use]
    pub fn bin(&self) -> &'a BinHashTables {
        self.bin
    }

    /// The WAD path tables.
    #[must_use]
    pub fn wad(&self) -> &'a WadPathResolver {
        self.wad
    }
}

impl ObjectNames for CacheNames<'_> {
    fn for_each_entry(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        self.bin.for_each_entry(hashes, visit);
    }

    fn class(&self, hash: BinHash) -> Option<String> {
        self.bin.class(hash)
    }

    fn for_each_file(&self, hashes: &[WadHash], visit: &mut dyn FnMut(usize, &str)) {
        self.wad.resolve_each(hashes, |at, path| {
            if let Some(path) = path {
                visit(at, path);
            }
        });
    }
}
