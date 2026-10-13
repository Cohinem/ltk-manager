//! Reports an object link whose target is not defined by the mod or by the installed game.
//!
//! An `ObjectLink` value contains the path hash of another bin object. The game
//! resolves the hash against the objects of every bin that it has loaded. A
//! hash that no loaded bin defines resolves to null, and the load still
//! succeeds. The cost of a null link depends on the class that reads it. Some
//! classes check for null and fall back, and some classes dereference the link
//! and crash.
//!
//! A target is defined if a bin of the mod declares it, or if a bin of the
//! installed game declares it in a chunk that the mod does not replace. A
//! replaced chunk is excluded, because the game loads the copy from the mod.
//!
//! The bins of the installed game contain links to objects that no bin defines.
//! A walk of one install found 338 such links in 172 files. A mod that edits
//! one of those bins did not add these links. The rule therefore skips a link
//! to a target that the game defines nowhere if the game contains the same
//! link. It reads the game's copy of the mod's chunk, and every game chunk that
//! declares the object that contains the link.
//!
//! A link in the `resourceMap` of a `ResourceResolver` is reported at
//! [`ProblemSeverity::Info`]. The game substitutes a placeholder effect for a
//! resource that does not resolve, as `bin/resolver-key-loss` documents. Every
//! other link is reported at [`ProblemSeverity::Warning`].
//!
//! The rule reports no link in three cases:
//!
//! - No install is configured. The rule is dormant.
//! - A bin of the mod cannot be read. That bin may define any target.
//! - The bin objects of the install cannot be indexed. The run records a failure.
//!
//! The rule does not know which bins are loaded when the game reads a link, so
//! a link that the rule accepts can still resolve to null. The rule also does
//! not read other enabled mods, which can define a target that it reports.
//!
//! Per `specs/017-bin-object-link/spec.md`.

use std::borrow::Cow;
use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use ltk_hash::{BinHash, WadHash};
use ltk_meta::property::Kind;
use ltk_meta::walk::{ChildSegment, Leaf, Node, Visit, Visitor};
use parking_lot::Mutex;

use super::bin_resolver_key_loss::{RESOURCE_MAP, RESOURCE_RESOLVER};
use crate::engine::parse_bin;
use crate::game::GameContent;
use crate::names::BinNames;
use crate::{
    Applied, BinVisitor, Detail, Dormancy, FileHandle, FixError, FixRun, NodeAddress, Pass,
    Problem, ProblemSeverity, ProjectFiles, Rule, RuleId, RuleMeta, Sink, Site, Walk, Weight,
};
use ltk_manager_bin::bin_document::{hex, owned};
use ltk_manager_bin::bin_walk::{self, Address, Declared, FieldNames};

/// The id of the rule.
pub const ID: RuleId = RuleId("bin/object-link");

/// The rule that reports an object link to an object that no bin defines.
#[derive(Debug, Default)]
pub struct BinObjectLink;

impl BinObjectLink {
    /// Returns the rule.
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

/// The catalogue entry of the rule.
const META: RuleMeta = RuleMeta {
    id: ID,
    title: "Missing linked object",
    description: "A link to an object that is not defined",
    unfixable: "Couldn't repair because the linked object does not exist",
    /* `None` because the severity of a finding depends on the property that contains the link. */
    severity: None,
};

impl Rule for BinObjectLink {
    fn meta(&self) -> &RuleMeta {
        &META
    }

    fn dormant(&self, project: &ProjectFiles) -> Option<Dormancy> {
        project.game().is_none().then(|| {
            Dormancy::new(
                "A League install",
                "Set the League path in Settings to run this check.",
            )
        })
    }

    fn subscribe(&self, pass: &mut Pass<'_>) {
        let Some(game) = pass.game() else {
            return;
        };
        let names = pass.project().names();
        let replaced = pass
            .project()
            .bins()
            .filter_map(|bin| bin.wad_hash())
            .collect();
        let scan: Arc<Mutex<Scan>> = Arc::default();

        pass.bins()
            /* `Links::game_holds` parses a game bin beside the bin of the mod. */
            .weighing(Weight::Bins(2))
            .visit(Links {
                names,
                game,
                replaced,
                scan: Arc::clone(&scan),
            });

        pass.finish(move |finish| {
            let bins: Vec<FileHandle<'_>> = finish.project().bins().collect();
            let Scan {
                bins: mut read,
                unindexed,
            } = std::mem::take(&mut *scan.lock());

            if unindexed {
                finish.failure(
                    None,
                    "The bin objects of the installed game could not be indexed, so object links were not checked. Sync the hashtables in Settings and check again.",
                );
                return;
            }
            /* The pass has reported each bin that failed. Such a bin may define any target. */
            if read.len() != bins.len() {
                return;
            }
            read.sort_by_key(|bin| bin.index);

            let defined: HashSet<BinHash> = read
                .iter()
                .flat_map(|bin| bin.defines.iter().copied())
                .collect();

            for bin in read {
                let handle = bins[bin.index];

                for link in bin.links {
                    if defined.contains(&link.target) {
                        continue;
                    }

                    let target = names
                        .entry(link.target)
                        .unwrap_or_else(|| hex(link.target));
                    let site = Site::node(
                        handle.layer(),
                        handle.path(),
                        NodeAddress {
                            entry: link.entry,
                            label: link.address.label(),
                            path: link.address.into_hashes(),
                        },
                    );
                    finish.problem(
                        link.severity,
                        site,
                        Detail::new(format!(
                            "{target} is not defined"
                        )),
                    );
                }
            }
        });
    }

    /// Records every problem as skipped, because the rule derives no repair.
    fn fix(&self, problems: &[&Problem], run: &mut FixRun<'_>) -> Result<Applied, FixError> {
        Ok(run.skip_all(problems))
    }
}

/// The result of the bin round of one run.
#[derive(Default)]
struct Scan {
    /// One entry for each bin that was read, in the order in which the workers finished.
    bins: Vec<BinLinks>,
    /// `true` if the bin objects of the install could not be indexed.
    unindexed: bool,
}

/// The objects that one bin defines, and the links that the bin and the game do not resolve.
struct BinLinks {
    /// The position of the bin in the round.
    index: usize,
    defines: Vec<BinHash>,
    links: Vec<Link>,
}

/// One object link value.
struct Link {
    /// The object that contains the link.
    entry: BinHash,
    target: BinHash,
    address: Address,
    severity: ProblemSeverity,
}

/// The bin subscription that collects the defined objects and the unresolved links of each bin.
struct Links<'p> {
    names: &'p BinNames,
    game: &'p dyn GameContent,
    /// The chunk of every bin of the mod. The game loads these in place of its own chunks.
    replaced: HashSet<WadHash>,
    scan: Arc<Mutex<Scan>>,
}

impl Links<'_> {
    /// Removes from `links` every link that the installed game resolves or contains itself.
    ///
    /// `chunk` is the chunk of the bin that contains `links`. Returns `false` if the bin
    /// objects of the install are not indexed. In that case every link is removed.
    fn drop_resolved_by_game(&self, chunk: Option<WadHash>, links: &mut Vec<Link>) -> bool {
        let mut indexed = true;
        let mut game_links: HashMap<WadHash, HashSet<BinHash>> = HashMap::new();

        links.retain(|link| {
            let Some(declaring) = self.game.declaring_chunks(link.target) else {
                indexed = false;
                return false;
            };
            if declaring.is_empty() {
                return !self.game_holds(link, chunk, &mut game_links);
            }
            declaring.iter().all(|chunk| self.replaced.contains(chunk))
        });
        indexed
    }

    /// Returns `true` if the installed game contains a link to the target of `link`.
    ///
    /// Reads the game's copy of `chunk` and every game chunk that declares the object
    /// that contains `link`. `game_links` caches the link targets of each chunk read.
    fn game_holds(
        &self,
        link: &Link,
        chunk: Option<WadHash>,
        game_links: &mut HashMap<WadHash, HashSet<BinHash>>,
    ) -> bool {
        let declaring = self.game.declaring_chunks(link.entry).unwrap_or_default();

        chunk.into_iter().chain(declaring).any(|chunk| {
            game_links
                .entry(chunk)
                .or_insert_with(|| self.links_of_game_chunk(chunk))
                .contains(&link.target)
        })
    }

    /// Reads the target of every object link in the game bin at `chunk`.
    ///
    /// Returns an empty set if the install does not contain the chunk, or if the chunk
    /// cannot be read or parsed.
    fn links_of_game_chunk(&self, chunk: WadHash) -> HashSet<BinHash> {
        let read = || -> Result<HashSet<BinHash>, String> {
            let Some(bytes) = self.game.read(chunk)? else {
                return Ok(HashSet::new());
            };
            let bin = parse_bin(&bytes)?;
            let mut targets = Targets::default();
            owned(bin_walk::bin(&bin, &mut targets));
            Ok(targets.0)
        };

        read().unwrap_or_else(|e| {
            tracing::debug!("Could not read the links of game chunk {chunk:016x}: {e}");
            HashSet::new()
        })
    }
}

impl BinVisitor for Links<'_> {
    fn begin<'r, 'f: 'r>(&'r self, sink: Sink<'f>) -> Box<dyn Walk<'f> + 'r> {
        Box::new(Reading {
            rule: self,
            names: FieldMemo {
                names: self.names,
                fields: RefCell::default(),
            },
            defines: Vec::new(),
            links: Vec::new(),
            sink,
        })
    }
}

/// The step from a property to a link under it.
enum Under<V> {
    /// The link is the value of the property, or the value of its optional.
    Property,
    Index(usize),
    Key(V),
}

/// Calls `found` for every non-null object link in the property value `value`.
///
/// A container or a map cannot contain a container, and a map cannot have a link as
/// its key. Every link is therefore the value of a property or one level under it.
///
/// Fails if a header or a leaf of `value` does not decode.
fn each_link<'a, V: Declared<'a>>(
    value: V,
    mut found: impl FnMut(BinHash, Under<V>),
) -> Result<(), ltk_meta::Error> {
    let mut link = |held: V, under: Under<V>| -> Result<(), ltk_meta::Error> {
        if let Some(Leaf::Link(target)) = held.as_leaf()?
            && target.0 != 0
        {
            found(target, under);
        }
        Ok(())
    };

    match value.kind() {
        Kind::ObjectLink => link(value, Under::Property)?,
        Kind::Optional | Kind::Container | Kind::UnorderedContainer | Kind::Map
            if value.item_kind()? == Some(Kind::ObjectLink) =>
        {
            for child in value.children()? {
                match child? {
                    (ChildSegment::Index(_), held) if value.kind() == Kind::Optional => {
                        link(held, Under::Property)?;
                    }
                    (ChildSegment::Index(index), held) => link(held, Under::Index(index))?,
                    (ChildSegment::Key(key), held) => link(held, Under::Key(key))?,
                }
            }
        }
        _ => {}
    }
    Ok(())
}

/// The walk of one bin.
struct Reading<'r, 'f> {
    rule: &'r Links<'r>,
    names: FieldMemo<'r>,
    defines: Vec<BinHash>,
    links: Vec<Link>,
    sink: Sink<'f>,
}

impl<'a, V: Declared<'a>> Visitor<'a, V> for Reading<'_, '_> {
    type Error = ltk_meta::Error;

    fn enter_node(&mut self, node: &Node<'_, 'a, V>) -> Result<Visit, ltk_meta::Error> {
        if node.is_root() {
            self.defines.push(node.object_hash());
        }
        Ok(Visit::Continue)
    }

    fn enter_property(
        &mut self,
        field: BinHash,
        value: V,
        node: &Node<'_, 'a, V>,
    ) -> Result<Visit, ltk_meta::Error> {
        let entry = node.object_hash();
        let class = node.class_hash();
        let severity = if class == RESOURCE_RESOLVER && field == RESOURCE_MAP {
            ProblemSeverity::Info
        } else {
            ProblemSeverity::Warning
        };
        let (names, links) = (&self.names, &mut self.links);

        each_link(value, |target, under| {
            let mut address = Address::of(node.trail(), field, class, names);
            match under {
                Under::Property => {}
                Under::Index(index) => address.push_index(index),
                Under::Key(key) => address.push_key(key, names),
            }
            links.push(Link {
                entry,
                target,
                address,
                severity,
            });
        })?;
        Ok(Visit::Continue)
    }
}

impl<'f> Walk<'f> for Reading<'_, 'f> {
    /// Stores the objects of the bin and the links that the bin and the game do not resolve.
    fn end(self: Box<Self>) -> Sink<'f> {
        let Self {
            rule,
            defines,
            mut links,
            sink,
            ..
        } = *self;

        let own: HashSet<BinHash> = defines.iter().copied().collect();
        links.retain(|link| !own.contains(&link.target));
        let indexed = rule.drop_resolved_by_game(sink.handle().wad_hash(), &mut links);

        let mut scan = rule.scan.lock();
        scan.unindexed |= !indexed;
        scan.bins.push(BinLinks {
            index: sink.index(),
            defines,
            links,
        });
        drop(scan);
        sink
    }
}

/// The target of every object link of one bin.
#[derive(Default)]
struct Targets(HashSet<BinHash>);

impl<'a, V: Declared<'a>> Visitor<'a, V> for Targets {
    type Error = ltk_meta::Error;

    fn enter_property(
        &mut self,
        _field: BinHash,
        value: V,
        _node: &Node<'_, 'a, V>,
    ) -> Result<Visit, ltk_meta::Error> {
        each_link(value, |target, _| {
            self.0.insert(target);
        })?;
        Ok(Visit::Continue)
    }
}

/// A cache of the field names that the walk of one bin looks up.
///
/// The walk renders an address for every link of the bin. Without the cache, each
/// segment of each address is a lookup in the hash tables.
struct FieldMemo<'p> {
    names: &'p BinNames,
    fields: RefCell<HashMap<BinHash, Option<String>>>,
}

impl FieldNames for FieldMemo<'_> {
    fn field(&self, field: BinHash, _class: Option<BinHash>) -> Option<Cow<'_, str>> {
        self.fields
            .borrow_mut()
            .entry(field)
            .or_insert_with(|| self.names.field(field))
            .clone()
            .map(Cow::Owned)
    }

    fn hash(&self, hash: BinHash) -> Option<Cow<'_, str>> {
        self.names.value(hash).map(Cow::Owned)
    }
}

#[cfg(test)]
mod tests;
