//! Where a manifest declares a property of an entry.
//!
//! An entry body sits under an `entries` module, or beside the `target` key of
//! a module whose chunk is the edited one, directly or in its `edits` list. A
//! key names a property by its full path, `skinMeshProperties.selfIllumination`,
//! or by the part of it below an unsigned block key, `selfIllumination` under
//! `skinMeshProperties:`.

use ltk_game_data::{BinHash, EntryName, Sign, Target};
use ltk_meta::path::{PropertyPath, Segment};
use yaml_edit::{Document, Mapping, MappingEntry, Sequence, YamlNode};

use crate::syntax;

/// The keys of a `target` module that are not entry names.
const MODULE_KEYS: [&str; 8] = [
    "target",
    "entries",
    "source",
    "edits",
    "overrides",
    "links",
    "+links",
    "-links",
];

/// One signed property of one entry, in the chunk a document shows.
pub(crate) struct Site<'a> {
    /// The path hash of the edited chunk. A `target` module applies to its own
    /// chunk only.
    pub(crate) chunk_hash: u64,
    pub(crate) entry: BinHash,
    pub(crate) sign: Sign,
    pub(crate) segments: Vec<Segment<'a>>,
}

/// The `modules` list of a manifest and its entry in the root mapping.
pub(crate) fn modules(doc: &Document) -> Option<(MappingEntry, Option<Sequence>)> {
    let root = doc.as_mapping()?;
    let entry = syntax::entries(&root)
        .into_iter()
        .find(|entry| syntax::key_string(entry).as_deref() == Some("modules"))?;
    let list = match entry.value_node() {
        Some(YamlNode::Sequence(list)) => Some(list),
        _ => None,
    };
    Some((entry, list))
}

/// Every module mapping, in execution order.
pub(crate) fn module_mappings(doc: &Document) -> Vec<Mapping> {
    modules(doc)
        .and_then(|(_, list)| list)
        .map(|list| {
            list.values()
                .filter_map(|module| module.as_mapping().cloned())
                .collect()
        })
        .unwrap_or_default()
}

/// The bodies declaring for `site`'s entry, in execution order.
fn bodies(doc: &Document, site: &Site<'_>) -> Vec<Mapping> {
    let mut bodies = Vec::new();
    for module in module_mappings(doc) {
        if let Some(entries) = module.get_mapping("entries") {
            bodies.extend(entry_bodies(&entries, site.entry, &[]));
        } else if targets(&module, site.chunk_hash) {
            bodies.extend(entry_bodies(&module, site.entry, &MODULE_KEYS));
            if let Some(edits) = module.get_sequence("edits") {
                for edit in edits.values() {
                    if let Some(edit) = edit.as_mapping() {
                        bodies.extend(entry_bodies(edit, site.entry, &MODULE_KEYS));
                    }
                }
            }
        }
    }
    bodies
}

/// Whether a module's `target` is the chunk `chunk_hash` names.
fn targets(module: &Mapping, chunk_hash: u64) -> bool {
    module
        .get("target")
        .and_then(|target| target.as_scalar().map(yaml_edit::Scalar::as_string))
        .and_then(|target| Target::try_from(target).ok())
        .is_some_and(|target| target.chunk_hash() == chunk_hash)
}

/// The bodies of `mapping`'s keys naming `entry`, a name or its hash alike.
fn entry_bodies(mapping: &Mapping, entry: BinHash, skip: &[&str]) -> Vec<Mapping> {
    syntax::entries(mapping)
        .iter()
        .filter(|candidate| names(candidate, entry, skip))
        .filter_map(syntax::mapping_value)
        .collect()
}

/// Whether a mapping entry's key is an entry name for `entry`.
fn names(candidate: &MappingEntry, entry: BinHash, skip: &[&str]) -> bool {
    syntax::key_string(candidate)
        .filter(|key| !skip.contains(&key.as_str()))
        .and_then(|key| EntryName::try_from(key).ok())
        .is_some_and(|name| name.object_hash() == entry)
}

/// The last key declaring `site`, the one whose value the build applies last.
pub(crate) fn last_key(doc: &Document, site: &Site<'_>) -> Option<MappingEntry> {
    let mut found = Vec::new();
    for body in bodies(doc, site) {
        keys_in(&body, site.sign, &site.segments, &mut found);
    }
    found.pop()
}

/// The keys under `mapping` declaring `segments` with `sign`, in order.
fn keys_in(mapping: &Mapping, sign: Sign, segments: &[Segment<'_>], found: &mut Vec<MappingEntry>) {
    for entry in syntax::entries(mapping) {
        let Some(key) = syntax::key_string(&entry) else {
            continue;
        };
        let (key_sign, spelled) = Sign::of(&key);
        let Ok(path) = PropertyPath::new(spelled) else {
            continue;
        };
        let key_segments: Vec<Segment<'_>> = path.segments().collect();
        if !is_prefix(&key_segments, segments) {
            continue;
        }
        if key_segments.len() == segments.len() {
            if key_sign == sign {
                found.push(entry);
            }
        } else if key_sign == Sign::Set
            && let Some(block) = syntax::mapping_value(&entry)
        {
            keys_in(&block, sign, &segments[key_segments.len()..], found);
        }
    }
}

/// Whether `prefix` names the first segments of `segments`, names compared by
/// hash.
fn is_prefix(prefix: &[Segment<'_>], segments: &[Segment<'_>]) -> bool {
    prefix.len() <= segments.len()
        && prefix
            .iter()
            .zip(segments)
            .all(|(a, b)| a.name_hash() == b.name_hash() && a.subscript == b.subscript)
}

/// The body of `entry` in the last `entries` module naming it.
pub(crate) fn last_entries_body(doc: &Document, entry: BinHash) -> Option<Mapping> {
    module_mappings(doc)
        .iter()
        .filter_map(|module| module.get_mapping("entries"))
        .flat_map(|entries| entry_bodies(&entries, entry, &[]))
        .last()
}

/// The entries mapping of the last module, where that module is an `entries`
/// module.
pub(crate) fn trailing_entries(doc: &Document) -> Option<Mapping> {
    module_mappings(doc).last()?.get_mapping("entries")
}

/// The deepest unsigned block under `mapping` whose key names a prefix of
/// `segments`, with the segments below it. `mapping` itself where none does.
pub(crate) fn deepest_block<'s, 'p>(
    mapping: &Mapping,
    segments: &'s [Segment<'p>],
) -> (Mapping, &'s [Segment<'p>]) {
    let mut found = None;
    for entry in syntax::entries(mapping) {
        let Some(key) = syntax::key_string(&entry) else {
            continue;
        };
        let (key_sign, spelled) = Sign::of(&key);
        let Ok(path) = PropertyPath::new(spelled) else {
            continue;
        };
        let key_segments: Vec<Segment<'_>> = path.segments().collect();
        if key_sign == Sign::Set
            && key_segments.len() < segments.len()
            && is_prefix(&key_segments, segments)
            && let Some(block) = syntax::mapping_value(&entry)
        {
            found = Some((block, key_segments.len()));
        }
    }
    match found {
        Some((block, used)) => deepest_block(&block, &segments[used..]),
        None => (mapping.clone(), segments),
    }
}
