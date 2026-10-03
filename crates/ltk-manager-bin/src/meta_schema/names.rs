//! The meta schema's class and field names under a caller's names.

use ltk_hash::{BinHash, WadHash};

use super::MetaSchema;
use crate::bin_document::RowNames;

/// Names out of `inner`, and the schema's names for the classes and fields it leaves unnamed.
///
/// The hash tables lag the game, and the schema names what a newer patch added.
pub struct SchemaNames<'a> {
    inner: &'a dyn RowNames,
    schema: &'a MetaSchema,
}

impl std::fmt::Debug for SchemaNames<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SchemaNames").finish_non_exhaustive()
    }
}

impl<'a> SchemaNames<'a> {
    /// `inner` answers first, and `schema` names what it leaves.
    #[must_use]
    pub fn new(inner: &'a dyn RowNames, schema: &'a MetaSchema) -> Self {
        Self { inner, schema }
    }
}

impl RowNames for SchemaNames<'_> {
    fn for_each_entry(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        self.inner.for_each_entry(hashes, visit);
    }

    fn for_each_class(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        fill(
            hashes,
            visit,
            &|hashes, visit| self.inner.for_each_class(hashes, visit),
            &|hash| self.schema.class_name(hash),
        );
    }

    fn for_each_field(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        fill(
            hashes,
            visit,
            &|hashes, visit| self.inner.for_each_field(hashes, visit),
            &|hash| self.schema.any_field_name(hash),
        );
    }

    fn for_each_value(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        self.inner.for_each_value(hashes, visit);
    }

    fn for_each_chunk(&self, hashes: &[WadHash], visit: &mut dyn FnMut(usize, &str)) {
        self.inner.for_each_chunk(hashes, visit);
    }
}

type Batch<'b> = dyn Fn(&[BinHash], &mut dyn FnMut(usize, &str)) + 'b;

/// Visit what `batch` names, then what `fallback` names of the hashes it left.
fn fill<'s>(
    hashes: &[BinHash],
    visit: &mut dyn FnMut(usize, &str),
    batch: &Batch<'_>,
    fallback: &dyn Fn(BinHash) -> Option<&'s str>,
) {
    let mut named = vec![false; hashes.len()];
    batch(hashes, &mut |at, name| {
        named[at] = true;
        visit(at, name);
    });

    for (at, hash) in hashes.iter().enumerate() {
        if named[at] {
            continue;
        }
        if let Some(name) = fallback(*hash) {
            visit(at, name);
        }
    }
}
