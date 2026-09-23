//! What the manager adds beside `ltk_meta::walk`: the address a finding names
//! a node by, and the shape questions a rule asks of a value that the tree
//! traits leave to the tree.
//!
//! Node, visitor, walk and trail are the toolkit's words, defined in
//! `league-toolkit/docs/design/value-walk.md` section 2. This module uses them
//! and defines none of its own.

use std::fmt::Write as _;

use ltk_hash::BinHash;
pub use ltk_meta::path::FieldNames;
use ltk_meta::property::Kind;
use ltk_meta::walk::{Leaf, Trail, TrailSegment, TreeValue, Visitor, WalkOutcome};
use ltk_meta::{BinFile, PropertyValueEnum};

/// Walk a bin of either kind: a `PROP`'s objects, or the objects a `PTCH` carries.
///
/// Patch records are outside the walk (D17 in `docs/design/problems-pass.md`).
///
/// # Errors
///
/// Whatever the visitor raises. The owned tree never fails on its own.
pub fn bin<'a, W>(bin: &'a BinFile, visitor: &mut W) -> Result<WalkOutcome, W::Error>
where
    W: Visitor<'a, &'a PropertyValueEnum>,
{
    match bin {
        BinFile::Prop(prop) => prop.walk(visitor),
        BinFile::Override(patch) => patch.walk(visitor),
    }
}

/// The kinds a container, an optional or a map declares in its header.
///
/// Each answer is one field of the value's `ltk_meta::walk::Declaration`, read off the
/// header over either tree.
pub trait Declared<'a>: TreeValue<'a> {
    /// The item kind of a container or an optional, and the value kind of a map.
    ///
    /// # Errors
    ///
    /// A requested header that does not decode.
    fn item_kind(&self) -> Result<Option<Kind>, ltk_meta::Error>;

    /// The key kind of a map.
    ///
    /// # Errors
    ///
    /// A requested header that does not decode.
    fn key_kind(&self) -> Result<Option<Kind>, ltk_meta::Error>;

    /// The class a `Struct` or `Embedded` carries, which is 0 for a null pointer.
    ///
    /// # Errors
    ///
    /// A requested header that does not decode.
    fn class_hash(&self) -> Result<Option<BinHash>, ltk_meta::Error>;

    /// Whether this is an option whose header says it holds nothing.
    ///
    /// An option writes its item kind and its count apart, so an empty one
    /// still declares the type it would hold. False for every other kind.
    ///
    /// # Errors
    ///
    /// A requested header that does not decode.
    fn is_empty_option(&self) -> Result<bool, ltk_meta::Error>;

    /// How many items a container or a map declares, and 1 or 0 for an
    /// optional. `None` for a leaf and for a node.
    ///
    /// # Errors
    ///
    /// A requested header that does not decode.
    fn item_count(&self) -> Result<Option<usize>, ltk_meta::Error>;
}

impl<'a, V: TreeValue<'a>> Declared<'a> for V {
    fn item_kind(&self) -> Result<Option<Kind>, ltk_meta::Error> {
        Ok(self.declaration()?.item_kind)
    }

    fn key_kind(&self) -> Result<Option<Kind>, ltk_meta::Error> {
        Ok(self.declaration()?.key_kind)
    }

    fn class_hash(&self) -> Result<Option<BinHash>, ltk_meta::Error> {
        Ok(self.declaration()?.class)
    }

    fn is_empty_option(&self) -> Result<bool, ltk_meta::Error> {
        let declaration = self.declaration()?;
        Ok(declaration.kind == Kind::Optional && declaration.count == Some(0))
    }

    fn item_count(&self) -> Result<Option<usize>, ltk_meta::Error> {
        Ok(self.declaration()?.count)
    }
}

/// The path to one node, written out in the two forms a row and a repair each
/// need.
///
/// A walk descends far more nodes than it reports, so an address is rendered
/// only for a node a visitor reports on, and never on the way down.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Address {
    hashes: String,
    named: String,
    resolved: bool,
}

impl Address {
    /// What the file holds, in the grammar of `value-walk.md` section 4.2: `.`
    /// between fields, `[i]` for an index, `{key}` for a map entry, every hash
    /// as lowercase hex. A repair matches on it, and no table moves it.
    #[must_use]
    pub fn hashes(&self) -> &str {
        &self.hashes
    }

    /// The hash form, owned.
    #[must_use]
    pub fn into_hashes(self) -> String {
        self.hashes
    }

    /// The same path for reading, every hash a table spells spelled.
    #[must_use]
    pub fn named(&self) -> &str {
        &self.named
    }

    /// The label a row draws, or `None` where it would repeat the hash form.
    #[must_use]
    pub fn label(&self) -> Option<String> {
        self.resolved.then(|| self.named.clone())
    }

    /// The address of `field` on the node `trail` stands on, whose class is
    /// `class`.
    #[must_use]
    pub fn of<'a, V: TreeValue<'a>>(
        trail: &Trail<V>,
        field: BinHash,
        class: BinHash,
        names: &dyn FieldNames,
    ) -> Self {
        let mut address = Self::default();
        let mut classes = trail.classes().iter();
        for step in trail.segments() {
            match step {
                TrailSegment::Field(field) => {
                    let class = classes
                        .next()
                        .expect("a trail records one class per field step");
                    address.push_field(*field, *class, names);
                }
                TrailSegment::Index(index) => address.push_index(*index),
                TrailSegment::Key(key) => address.push_key(*key, names),
            }
        }
        address.push_field(field, class, names);
        address
    }

    /// Step into a property of a node of `class`.
    pub fn push_field(&mut self, field: BinHash, class: BinHash, names: &dyn FieldNames) {
        if !self.hashes.is_empty() {
            self.hashes.push('.');
            self.named.push('.');
        }
        let _ = write!(self.hashes, "{field:08x}");
        match names.field(field, Some(class)) {
            Some(name) => {
                self.named.push_str(&name);
                self.resolved = true;
            }
            None => {
                let _ = write!(self.named, "{field:08x}");
            }
        }
    }

    /// Step into one element of a container, or the value of a present optional.
    pub fn push_index(&mut self, index: usize) {
        let _ = write!(self.hashes, "[{index}]");
        let _ = write!(self.named, "[{index}]");
    }

    /// Step into one entry of a map, subscripted by its key.
    ///
    /// A key that is not a leaf, or does not decode, is written as `{?}`.
    pub fn push_key<'a>(&mut self, key: impl TreeValue<'a>, names: &dyn FieldNames) {
        let leaf = key.as_leaf().ok().flatten();
        self.hashes.push('{');
        self.named.push('{');
        match leaf {
            Some(Leaf::Hash(hash)) => {
                let _ = write!(self.hashes, "{hash:08x}");
                match names.hash(hash) {
                    Some(name) => {
                        write_json_string(&mut self.named, &name);
                        self.resolved = true;
                    }
                    None => {
                        let _ = write!(self.named, "{hash:08x}");
                    }
                }
            }
            leaf => {
                let at = self.hashes.len();
                write_key(&mut self.hashes, leaf);
                let text = self.hashes[at..].to_owned();
                self.named.push_str(&text);
            }
        }
        self.hashes.push('}');
        self.named.push('}');
    }
}

/// The text inside a `{key}` step, as `value-walk.md` section 4.2 writes it.
///
/// `Leaf` is non-exhaustive (W22), and a kind this build does not know renders
/// as `?`, the same as a key that does not decode.
pub(crate) fn write_key(out: &mut String, leaf: Option<Leaf<'_>>) {
    let _ = match leaf {
        None => out.write_str("?"),
        Some(Leaf::None) => Ok(()),
        Some(Leaf::Bool(v) | Leaf::Flag(v)) => write!(out, "{v}"),
        Some(Leaf::I8(v)) => write!(out, "{v}"),
        Some(Leaf::U8(v)) => write!(out, "{v}"),
        Some(Leaf::I16(v)) => write!(out, "{v}"),
        Some(Leaf::U16(v)) => write!(out, "{v}"),
        Some(Leaf::I32(v)) => write!(out, "{v}"),
        Some(Leaf::U32(v)) => write!(out, "{v}"),
        Some(Leaf::I64(v)) => write!(out, "{v}"),
        Some(Leaf::U64(v)) => write!(out, "{v}"),
        Some(Leaf::F32(v)) => write!(out, "{v}"),
        Some(Leaf::Vector2(v)) => write_tuple(out, &v.to_array()),
        Some(Leaf::Vector3(v)) => write_tuple(out, &v.to_array()),
        Some(Leaf::Vector4(v)) => write_tuple(out, &v.to_array()),
        Some(Leaf::Matrix44(v)) => write_tuple(out, &v.transpose().to_cols_array()),
        Some(Leaf::Color(c)) => write_tuple(out, &[c.r, c.g, c.b, c.a]),
        Some(Leaf::String(s)) => {
            write_json_string(out, s);
            Ok(())
        }
        Some(Leaf::Hash(h) | Leaf::Link(h)) => write!(out, "{h:08x}"),
        Some(Leaf::File(h)) => write!(out, "{h:016x}"),
        Some(_) => out.write_str("?"),
    };
}

/// `(a, b, c)`.
fn write_tuple<T: std::fmt::Display>(out: &mut String, items: &[T]) -> std::fmt::Result {
    out.push('(');
    for (i, item) in items.iter().enumerate() {
        if i > 0 {
            out.push_str(", ");
        }
        write!(out, "{item}")?;
    }
    out.push(')');
    Ok(())
}

/// A JSON string literal, which is how the toolkit writes a string key.
pub(crate) fn write_json_string(out: &mut String, text: &str) {
    let _ = write!(out, "{}", serde_json::Value::String(text.to_owned()));
}

#[cfg(test)]
mod tests;
