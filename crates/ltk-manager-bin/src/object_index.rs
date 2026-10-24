//! Every bin object the install declares, and the file that declares it.
//!
//! The locations half of the palette's object search. The names half is the
//! `binentries` table, resolved once the rows are built and held beside them.
//!
//! Per "The bin object index" in `docs/ux/PROJECT_EDITOR.md`, and section 10 of
//! `docs/research/bin-object-index.md`.

use std::collections::HashMap;
use std::sync::Arc;

use ltk_game_index::Declaration;
use ltk_hash::BinHash;
use ltk_wad::{WadHash, hex_name};

use crate::bin_document::hex;
use ltk_manager_assets::preview::AssetRef;

mod browse;
mod build;
mod find;
mod names;
mod references;
mod search;
mod state;
mod types;
mod walk;

pub use ltk_game_index::ObjectStats;
pub use state::{
    BuildTicket, ObjectFindGeneration, ObjectIndexSnapshot, ObjectIndexState,
    ObjectReferenceGeneration, ObjectSearchGeneration,
};
pub use types::{
    DeclaredObject, ObjectClassHit, ObjectDeclaration, ObjectDirListing, ObjectFindHit,
    ObjectFindResult, ObjectNodeEntry, ObjectPrefixEntry, ObjectSearchHit, ObjectSearchResult,
    ReferenceGroup, ReferenceHit, ReferenceProperty, ReferenceResult,
};
pub use walk::{FileTarget, LayerBin, WalkRequest, WalkTarget, layer_bins};

use ltk_manager_base::generation::STALE_CHECK_INTERVAL;

/// The prefix of the group holding the objects no table names.
///
/// A resolved object path never holds `?`. The group collides with no path the
/// game ships.
pub const UNNAMED_PREFIX: &str = "?";

/// One bin chunk that declares an object, which a declaration's chunk resolves to.
#[derive(Debug)]
struct DeclaringFile {
    path_hash: WadHash,
    /// The path the WAD tables named it by at the build, or `None` for a sniffed chunk.
    path: Option<Box<str>>,
    /// Index into [`Declarations::wads`].
    wad: u32,
}

/// What a build fills, and what a renaming shares untouched.
#[derive(Debug)]
struct Declarations {
    /// Every declaration of the install, in the storage order of the crate's index.
    index: ltk_game_index::ObjectIndex,
    /// Every declaring chunk in archive order, by path within one archive, the unnamed last.
    files: Vec<DeclaringFile>,
    /// A declaring chunk's index in `files`, by its path hash.
    by_file: HashMap<WadHash, u32>,
    /// Archive names, in the chunk index's order.
    wads: Vec<String>,
}

/// One object a table names: its path, with its letters for the mask to reject on.
#[derive(Debug)]
struct NamedObject {
    hash: BinHash,
    name: Box<str>,
    mask: u32,
}

/// The names resolved for one index, resident while it is.
#[derive(Debug, Default)]
struct Names {
    /// Every object a table names, in the order of [`compare_paths`], which the
    /// objects browser reads one prefix at a time.
    named: Vec<NamedObject>,
    /// The index into `named` of each object a table names.
    objects: HashMap<BinHash, u32>,
    classes: HashMap<BinHash, Box<str>>,
    /// The declaring chunks the build sniffed that a table names after all.
    files: HashMap<WadHash, Box<str>>,
}

/// Every bin object the install declares, searchable by path or by hash.
///
/// Built once a session behind the Objects switch, and renamed in place when
/// the hash tables move, because the rows are the install's and the names
/// are the tables'.
#[derive(Debug)]
pub struct ObjectIndex {
    declared: Arc<Declarations>,
    names: Names,
}

impl ObjectIndex {
    /// Every declaration of `object` in archive order, serialized.
    fn declarations_of(&self, object: BinHash) -> Vec<ObjectDeclaration> {
        self.declared
            .index
            .declarations(object)
            .map(|(_, row)| self.declaration(row))
            .collect()
    }

    /// What the build measured.
    pub fn stats(&self) -> ObjectStats {
        *self.declared.index.stats()
    }

    /// Whether any file of the install declares `object`.
    #[must_use]
    pub fn declares(&self, object: BinHash) -> bool {
        self.declared.index.declares(object)
    }

    /// Whether any file of the install declares `object` as an instance of `class`.
    #[must_use]
    pub fn declares_class(&self, object: BinHash, class: BinHash) -> bool {
        self.declared
            .index
            .declarations(object)
            .any(|(_, row)| row.class == class)
    }

    /// Returns the chunk of each declaration of `object`, in archive order.
    pub fn declaring_chunks(&self, object: BinHash) -> impl Iterator<Item = WadHash> + '_ {
        self.declared
            .index
            .declarations(object)
            .map(|(_, row)| row.chunk)
    }

    /// Every object a table names, with its path, in path order.
    pub fn named_objects(&self) -> impl Iterator<Item = (BinHash, &str)> + '_ {
        self.names
            .named
            .iter()
            .map(|object| (object.hash, &*object.name))
    }

    /// Every declaration of `object` in archive order, or `None` where nothing declares it.
    #[must_use]
    pub fn declared(&self, object: BinHash) -> Option<DeclaredObject> {
        let declarations = self.declarations_of(object);
        if declarations.is_empty() {
            return None;
        }
        Some(DeclaredObject {
            path: self.object_name(object),
            declarations,
        })
    }

    /// `row` as a serialized declaration.
    fn declaration(&self, row: &Declaration) -> ObjectDeclaration {
        let (file, wad) = self.declared.file(row.chunk).map_or_else(
            || (hex_name(row.chunk), String::new()),
            |file| {
                (
                    self.file_name(file),
                    self.declared.wads[file.wad as usize].clone(),
                )
            },
        );
        ObjectDeclaration {
            asset: AssetRef::GameChunk {
                wad,
                path_hash: hex_name(row.chunk),
            },
            file,
            class_hash: hex(row.class),
            class: self.class_name(row.class),
        }
    }

    /// The object's path, or its hex when no table names it.
    fn object_name(&self, object: BinHash) -> String {
        self.named_object(object)
            .map_or_else(|| hex(object), |named| named.name.to_string())
    }

    /// The class's name, or its hex when no table names it.
    fn class_name(&self, class: BinHash) -> String {
        self.names
            .classes
            .get(&class)
            .map_or_else(|| hex(class), ToString::to_string)
    }

    /// The name a declaring chunk reads as: the game index's, else a table's
    /// resolved since, else its hex.
    fn file_name(&self, file: &DeclaringFile) -> String {
        file.path
            .as_deref()
            .or_else(|| self.names.files.get(&file.path_hash).map(|path| &**path))
            .map_or_else(|| hex_name(file.path_hash), str::to_owned)
    }

    /// Every row as `(object, class, declaring file name)`, file by file in the order of
    /// `files`.
    #[cfg(test)]
    fn rows(&self) -> impl Iterator<Item = (BinHash, BinHash, String)> {
        self.declared.files.iter().flat_map(|file| {
            self.declared
                .index
                .chunk_declarations(file.path_hash)
                .map(|(_, row)| (row.object, row.class, self.file_name(file)))
        })
    }
}

impl Declarations {
    fn file(&self, path_hash: WadHash) -> Option<&DeclaringFile> {
        self.by_file
            .get(&path_hash)
            .map(|&at| &self.files[at as usize])
    }

    /// Every declaration, in storage order. A declaration's position is its row.
    fn rows(&self) -> &[Declaration] {
        self.index.rows()
    }
}

/// The object hash a query of eight hex digits names, `0x` or not.
#[must_use]
pub fn parse_hash(query: &str) -> Option<BinHash> {
    let digits = query.trim();
    let digits = digits
        .strip_prefix("0x")
        .or_else(|| digits.strip_prefix("0X"))
        .unwrap_or(digits);
    if digits.len() != 8 || !digits.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    u32::from_str_radix(digits, 16).ok().map(BinHash)
}

#[cfg(test)]
mod tests;
