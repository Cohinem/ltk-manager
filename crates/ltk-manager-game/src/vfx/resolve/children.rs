//! Child systems that the open bin does not declare, read from the bins it links and from the
//! bin of the skin that the system's path names.

use std::collections::{HashMap, HashSet, VecDeque};

use indexmap::IndexMap;
use ltk_hash::BinHash;
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_base::hashing::named;
use ltk_manager_bin::bin_document::{AssetLookup, BinDocument, RowNames};
use ltk_manager_bin::object_index::parse_hash;

use super::{CHILD_IDENTIFIER, MAX_NODES, SYSTEM_DEFINITION, resolve_system, resources};
use crate::linked::LINKED_CAP;
use crate::material::MaterialPreview;
use crate::resolver::{EFFECT_KEY, skin_bin};
use crate::vfx::{VfxField, VfxSystem, VfxValue};

/// `VfxChildIdentifier.effect`, the link to the child's system.
const EFFECT: BinHash = named("effect");

/// Resolves each child identifier of `system` whose system `document` does not hold.
///
/// An `effect` link resolves in the first bin that holds its object. An `effectKey` resolves
/// through the `ResourceResolver`s of `document`, then through those of
/// `data/characters/<name>/skins/<skin>.bin` for a system under `Characters/<name>/Skins/<skin>/`.
/// Its system is then read from `document`, or from the first bin that holds it. Bins are
/// read from `linked` and the skin bin, and from what each links, breadth first. A child
/// already open above an identifier stays a link, and so does every child once the tree
/// holds [`MAX_NODES`] values. The materials of each child are added to `system`'s, with the
/// bin they were read from as their `source`.
pub fn search_linked_children(
    system: &mut VfxSystem,
    document: &BinDocument,
    linked: Vec<AssetRef>,
    names: &dyn RowNames,
    assets: &dyn AssetLookup,
    shaders: Option<&BinDocument>,
    read: &mut dyn FnMut(&AssetRef) -> Option<BinDocument>,
) {
    let mut search = Search {
        open: document,
        open_keys: resources(document),
        bins: Bins {
            assets,
            read,
            seen: HashSet::new(),
            documents: Vec::new(),
            opened: 0,
        },
        linked: Some(linked),
        skins: HashMap::new(),
        children: HashMap::new(),
        materials: Vec::new(),
        budget: MAX_NODES.saturating_sub(size(&system.root)),
        names,
        assets,
        shaders,
    };
    search.visit(&mut system.root, None, &mut Vec::new());

    for material in search.materials {
        if !system
            .materials
            .iter()
            .any(|held| held.hash == material.hash)
        {
            system.materials.push(material);
        }
    }
}

/// The bins one search reads, each once, in the order the search reaches them.
struct Bins<'a> {
    assets: &'a dyn AssetLookup,
    read: &'a mut dyn FnMut(&AssetRef) -> Option<BinDocument>,
    seen: HashSet<AssetRef>,
    documents: Vec<(AssetRef, BinDocument)>,
    opened: usize,
}

impl Bins<'_> {
    /// Reads `start` and the bins that each links, breadth first, until [`LINKED_CAP`] bins
    /// are read. Skips a bin that is already read and a bin that `read` cannot parse.
    fn reach(&mut self, start: Vec<AssetRef>) {
        let mut queue: VecDeque<AssetRef> = start
            .into_iter()
            .filter(|asset| self.seen.insert(asset.clone()))
            .collect();

        while let Some(asset) = queue.pop_front() {
            if self.opened == LINKED_CAP {
                return;
            }
            self.opened += 1;
            let Some(document) = (self.read)(&asset) else {
                continue;
            };

            for next in document
                .dependencies()
                .iter()
                .filter_map(|path| self.assets.locate(path))
            {
                if self.seen.insert(next.clone()) {
                    queue.push_back(next);
                }
            }
            self.documents.push((asset, document));
        }
    }
}

/// One search over one system's tree.
struct Search<'a> {
    open: &'a BinDocument,
    open_keys: IndexMap<BinHash, BinHash>,
    bins: Bins<'a>,
    /// The bins `document` links, until the first child that needs them reads them.
    linked: Option<Vec<AssetRef>>,
    /// The effect keys of each skin bin, by its path.
    skins: HashMap<String, IndexMap<BinHash, BinHash>>,
    /// Each child read so far, and `None` for one that no bin holds.
    children: HashMap<BinHash, Option<VfxValue>>,
    materials: Vec<MaterialPreview>,
    /// How many values the spliced children can still add.
    budget: usize,
    names: &'a dyn RowNames,
    assets: &'a dyn AssetLookup,
    shaders: Option<&'a BinDocument>,
}

impl Search<'_> {
    /// Visits `value` and each value under it, resolving each child identifier on the way.
    ///
    /// `owner` is the path of the nearest system above `value`, and `open` holds the entries
    /// of every system above it.
    fn visit(&mut self, value: &mut VfxValue, owner: Option<&str>, open: &mut Vec<BinHash>) {
        match value {
            VfxValue::Struct {
                class_hash,
                fields,
                object,
                ..
            } => {
                let class = parse_hash(class_hash);
                let system = object
                    .as_ref()
                    .filter(|_| class == Some(SYSTEM_DEFINITION))
                    .and_then(|object| Some((parse_hash(&object.entry)?, object.name.clone())));
                let owner = match &system {
                    Some((_, name)) => name.clone(),
                    None => owner.map(str::to_owned),
                };

                if let Some((entry, _)) = system {
                    open.push(entry);
                }
                if class == Some(CHILD_IDENTIFIER) {
                    self.fill(fields, owner.as_deref(), open);
                }
                for field in fields.iter_mut() {
                    self.visit(&mut field.value, owner.as_deref(), open);
                }
                if system.is_some() {
                    open.pop();
                }
            }
            VfxValue::Container { items } => {
                for item in items {
                    self.visit(item, owner, open);
                }
            }
            VfxValue::Map { entries } => {
                for entry in entries {
                    self.visit(&mut entry.value, owner, open);
                }
            }
            _ => {}
        }
    }

    /// Replaces the `effect` or `effectKey` of one child identifier with the system it names.
    ///
    /// Skips an identifier that already holds a system, and tries `effect` before
    /// `effectKey`, the order in which the renderer reads them.
    fn fill(&mut self, fields: &mut [VfxField], owner: Option<&str>, open: &[BinHash]) {
        let held = |field: &VfxField| {
            matches!(field.value, VfxValue::Struct { .. })
                && matches!(parse_hash(&field.hash), Some(EFFECT | EFFECT_KEY))
        };
        if fields.iter().any(held) {
            return;
        }

        for wanted in [EFFECT, EFFECT_KEY] {
            let Some(field) = fields
                .iter_mut()
                .find(|field| parse_hash(&field.hash) == Some(wanted))
            else {
                continue;
            };
            let target = match &field.value {
                VfxValue::Link { hash, .. } if wanted == EFFECT => parse_hash(hash),
                VfxValue::Hash { hash, .. } if wanted == EFFECT_KEY => {
                    parse_hash(hash).and_then(|key| self.target(key, owner))
                }
                _ => None,
            };
            let Some(target) = target.filter(|target| target.0 != 0 && !open.contains(target))
            else {
                continue;
            };

            if let Some(child) = self.child(target) {
                field.value = child;
                return;
            }
        }
    }

    /// Returns the object that `key` maps to, through the open bin's resolvers, then through
    /// the resolvers of the skin bin that `owner` names.
    fn target(&mut self, key: BinHash, owner: Option<&str>) -> Option<BinHash> {
        if let Some(target) = self.open_keys.get(&key) {
            return Some(*target);
        }

        let path = skin_bin(owner?)?;
        if !self.skins.contains_key(&path) {
            self.reach_linked();
            let keys = self
                .assets
                .locate(&path)
                .and_then(|asset| {
                    self.bins.reach(vec![asset.clone()]);
                    self.bins
                        .documents
                        .iter()
                        .find(|(read, _)| *read == asset)
                        .map(|(_, document)| resources(document))
                })
                .unwrap_or_default();
            self.skins.insert(path.clone(), keys);
        }
        self.skins[&path].get(&key).copied()
    }

    /// Returns the tree of the system at `target`, read from the open bin or the first read
    /// bin that holds it. Returns `None` if no bin holds it or if it does not fit the budget.
    fn child(&mut self, target: BinHash) -> Option<VfxValue> {
        if let Some(child) = self.children.get(&target) {
            return child.clone();
        }

        let child = self.read_child(target);
        self.children.insert(target, child.clone());
        child
    }

    fn read_child(&mut self, target: BinHash) -> Option<VfxValue> {
        let (source, document) = if self.open.object_at(target).is_some() {
            (None, self.open)
        } else {
            self.reach_linked();
            let (source, document) = self
                .bins
                .documents
                .iter()
                .find(|(_, document)| document.object_at(target).is_some())?;
            (Some(source.clone()), document)
        };
        let child = resolve_system(document, target, self.names, self.assets, self.shaders).ok()?;

        let spent = size(&child.root);
        if spent > self.budget {
            return None;
        }
        self.budget -= spent;

        for mut material in child.materials {
            if !material.missing && material.source.is_none() {
                material.source.clone_from(&source);
            }
            self.materials.push(material);
        }
        Some(child.root)
    }

    /// Reads the bins the open bin links, once.
    fn reach_linked(&mut self) {
        if let Some(linked) = self.linked.take() {
            self.bins.reach(linked);
        }
    }
}

/// Returns how many values `value` holds, itself included.
fn size(value: &VfxValue) -> usize {
    1 + match value {
        VfxValue::Struct { fields, .. } => fields.iter().map(|field| size(&field.value)).sum(),
        VfxValue::Container { items } => items.iter().map(size).sum(),
        VfxValue::Map { entries } => entries.iter().map(|entry| size(&entry.value)).sum(),
        _ => 0,
    }
}

#[cfg(test)]
mod tests;
