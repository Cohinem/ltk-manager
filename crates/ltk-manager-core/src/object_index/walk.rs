//! The walk of every bin for what the index does not hold: the uses of an embedded
//! class, and the values that link to an object.
//!
//! "The References document" in `docs/ux/PROJECT_EDITOR.md`.

use std::io::Cursor;

use ltk_hash::BinHash;
use ltk_meta::property::{Kind, NoMeta};
use ltk_meta::stream::BinStream;
use ltk_meta::walk::{Child, Leaf, OwnedNode, TreeNode, TreeValue};
use ltk_meta::{BinOverride, Error, PropertyValueEnum};

use super::build::PATCH_MAGIC;
use crate::problems::walk::{Declared, write_key};

mod run;

#[cfg(test)]
pub(super) use run::spelled_property;
pub use run::{LayerBin, WalkRequest, layer_bins};

/// What a walk looks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum WalkTarget {
    /// Every `pointer` or `embed` value of a class, below the root of an object.
    Embedded(BinHash),
    /// Every `link` or `hash` value holding an object's path hash, map keys included.
    Linked(BinHash),
}

impl WalkTarget {
    /// Whether a value of `kind` can hold what the walk looks for, itself or below it.
    fn reaches(self, kind: Kind) -> bool {
        match kind {
            Kind::Struct
            | Kind::Embedded
            | Kind::Container
            | Kind::UnorderedContainer
            | Kind::Optional
            | Kind::Map => true,
            Kind::Hash | Kind::ObjectLink => matches!(self, Self::Linked(_)),
            _ => false,
        }
    }

    /// Whether `leaf` is a value this target links to.
    fn links(self, leaf: Leaf<'_>) -> bool {
        matches!(
            (self, leaf),
            (Self::Linked(target), Leaf::Hash(hash) | Leaf::Link(hash)) if hash == target
        )
    }
}

/// One step from an object's root to the value a walk found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum HitStep {
    /// A property, and the class of the node it was read on.
    Field { class: BinHash, field: BinHash },
    /// An element of a container, or the value of an optional that holds rows of its own.
    Index(usize),
    /// A map entry: its key as the wire writes it, and the hash the key holds, if it holds one.
    Key {
        text: Box<str>,
        hash: Option<BinHash>,
    },
}

/// One value a walk found, in the object that holds it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct WalkHit {
    pub(super) object: BinHash,
    /// The class of the object, not of the value.
    pub(super) class: BinHash,
    /// The path to the row that draws the value. Never empty.
    pub(super) steps: Vec<HitStep>,
}

/// Push every value `target` names in the bin `bytes` onto `hits`, in file order.
///
/// A `PROP` is read one buffered object at a time. A `PTCH` is read whole, and its patch
/// records, which have no node to stand on, are not walked.
///
/// # Errors
///
/// Fails when the bytes are not a bin the toolkit reads. The hits found before the
/// failure stay pushed.
pub(super) fn scan_bin(
    bytes: &[u8],
    target: WalkTarget,
    hits: &mut Vec<WalkHit>,
) -> Result<(), Error> {
    if bytes.starts_with(&PATCH_MAGIC) {
        let patch = BinOverride::<NoMeta>::from_reader(&mut Cursor::new(bytes))?;
        for object in patch.objects.values() {
            Scan::<&PropertyValueEnum>::new(target, object.path_hash, object.class_hash, hits)
                .node(OwnedNode::from(object))?;
        }
        return Ok(());
    }

    let mut stream: BinStream<_> = BinStream::mount(Cursor::new(bytes))?;
    let mut objects = stream.objects();
    while let Some(mut object) = objects.next()? {
        let view = object.view()?;
        let mut scan = Scan::new(target, view.path_hash(), view.class_hash(), hits);
        for property in view.properties() {
            let property = property?;
            scan.property(
                view.class_hash(),
                property.name_hash(),
                property.value_view()?,
            )?;
        }
    }
    Ok(())
}

/// Whether a value of `kind` holds rows of its own, which an optional keeps its `[0]` for.
///
/// The rule `inlines` in the bin document draws an optional by.
fn holds_rows(kind: Kind) -> bool {
    matches!(
        kind,
        Kind::Container
            | Kind::UnorderedContainer
            | Kind::Map
            | Kind::Optional
            | Kind::Struct
            | Kind::Embedded
    )
}

/// One object's descent, with the steps to where it stands.
struct Scan<'h, V> {
    target: WalkTarget,
    object: BinHash,
    class: BinHash,
    /// A key is the tree's own value, rendered only for a hit.
    steps: Vec<Step<V>>,
    hits: &'h mut Vec<WalkHit>,
}

enum Step<V> {
    Field { class: BinHash, field: BinHash },
    Index(usize),
    Key(V),
}

impl<'h, 'a, V: Declared<'a>> Scan<'h, V> {
    fn new(
        target: WalkTarget,
        object: BinHash,
        class: BinHash,
        hits: &'h mut Vec<WalkHit>,
    ) -> Self {
        Self {
            target,
            object,
            class,
            steps: Vec::new(),
            hits,
        }
    }

    fn node(&mut self, node: V::Node) -> Result<(), Error> {
        for property in node.properties() {
            let (field, value) = property?;
            self.property(node.class_hash(), field, value)?;
        }
        Ok(())
    }

    fn property(&mut self, class: BinHash, field: BinHash, value: V) -> Result<(), Error> {
        if !self.target.reaches(value.kind()) {
            return Ok(());
        }
        self.steps.push(Step::Field { class, field });
        let scanned = self.value(value);
        self.steps.pop();
        scanned
    }

    fn value(&mut self, value: V) -> Result<(), Error> {
        match value.kind() {
            Kind::Struct | Kind::Embedded => {
                let Some(node) = value.as_node()? else {
                    return Ok(());
                };
                if self.target == WalkTarget::Embedded(node.class_hash()) {
                    self.hit();
                }
                self.node(node)
            }
            Kind::Hash | Kind::ObjectLink => {
                if value.leaf()?.is_some_and(|leaf| self.target.links(leaf)) {
                    self.hit();
                }
                Ok(())
            }
            Kind::Container | Kind::UnorderedContainer | Kind::Optional => self.items(value),
            Kind::Map => self.entries(value),
            _ => Ok(()),
        }
    }

    fn items(&mut self, value: V) -> Result<(), Error> {
        let Some(item_kind) = value.item_kind() else {
            return Ok(());
        };
        if !self.target.reaches(item_kind) {
            return Ok(());
        }
        let inline = value.kind() == Kind::Optional && !holds_rows(item_kind);
        for child in value.children()? {
            let (Child::Index(index), item) = child? else {
                continue;
            };
            if inline {
                self.value(item)?;
                continue;
            }
            self.steps.push(Step::Index(index));
            let scanned = self.value(item);
            self.steps.pop();
            scanned?;
        }
        Ok(())
    }

    fn entries(&mut self, value: V) -> Result<(), Error> {
        let keyed = value
            .key_kind()
            .is_some_and(|kind| self.target.reaches(kind));
        let valued = value
            .item_kind()
            .is_some_and(|kind| self.target.reaches(kind));
        if !keyed && !valued {
            return Ok(());
        }
        for child in value.children()? {
            let (Child::Key(key), item) = child? else {
                continue;
            };
            self.steps.push(Step::Key(key));
            let mut scanned = Ok(());
            if keyed && key.leaf()?.is_some_and(|leaf| self.target.links(leaf)) {
                self.hit();
            }
            if valued {
                scanned = self.value(item);
            }
            self.steps.pop();
            scanned?;
        }
        Ok(())
    }

    /// Record the value the steps stand on, unless it was the last one recorded.
    ///
    /// A map entry whose key and value both link to the target is one row.
    fn hit(&mut self) {
        let steps: Vec<HitStep> = self.steps.iter().map(hit_step).collect();
        if self
            .hits
            .last()
            .is_some_and(|last| last.object == self.object && last.steps == steps)
        {
            return;
        }
        self.hits.push(WalkHit {
            object: self.object,
            class: self.class,
            steps,
        });
    }
}

fn hit_step<'a, V: TreeValue<'a>>(step: &Step<V>) -> HitStep {
    match step {
        Step::Field { class, field } => HitStep::Field {
            class: *class,
            field: *field,
        },
        Step::Index(index) => HitStep::Index(*index),
        Step::Key(key) => {
            let leaf = key.leaf().ok().flatten();
            let mut text = String::new();
            write_key(&mut text, leaf);
            let hash = match leaf {
                Some(Leaf::Hash(hash)) => Some(hash),
                _ => None,
            };
            HitStep::Key {
                text: text.into(),
                hash,
            }
        }
    }
}
