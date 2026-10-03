//! A breadth-first walk over the bins a document links, and the material search built on it.

use std::collections::{HashSet, VecDeque};

use ltk_manager_assets::preview::AssetRef;
use ltk_manager_bin::bin_document::{AssetLookup, BinDocument, Locator, RowNames};
use ltk_manager_bin::object_index::parse_hash;

use crate::material::{MaterialPreview, linked_material};

/// The most linked files one walk opens, however deep the links run.
pub(crate) const LINKED_CAP: usize = 32;

/// Whether a walk over linked files goes on past the file it is at.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Walk {
    On,
    Done,
}

/// Every file in `linked` and in what each links, breadth first, until `visit` is done.
///
/// Each file's links come in the order its header lists them, so the file nearest the
/// start is visited first. `read` answers a file's document, and none for one it cannot
/// read, which is passed over. A file reached twice is read once, and at most
/// `LINKED_CAP` files are opened.
pub(crate) fn walk_linked(
    linked: Vec<AssetRef>,
    assets: &dyn AssetLookup,
    read: &mut dyn FnMut(&AssetRef) -> Option<BinDocument>,
    visit: &mut dyn FnMut(&AssetRef, &BinDocument) -> Walk,
) {
    let mut seen: HashSet<AssetRef> = linked.iter().cloned().collect();
    let mut queue: VecDeque<AssetRef> = linked.into();
    let mut opened = 0;

    while let Some(asset) = queue.pop_front() {
        if opened == LINKED_CAP {
            break;
        }
        opened += 1;
        let Some(document) = read(&asset) else {
            continue;
        };
        if visit(&asset, &document) == Walk::Done {
            return;
        }
        for next in document
            .dependencies()
            .iter()
            .filter_map(|path| assets.locate(path))
        {
            if seen.insert(next.clone()) {
                queue.push_back(next);
            }
        }
    }
}

/// Each of `missing` that a file within reach of `linked` declares, read there and marked
/// with that file as its `source`.
///
/// A material no file within reach declares stays missing. `shaders` is the defs a
/// material's pass shader resolves in.
pub(crate) fn find_linked_materials(
    mut missing: Vec<&mut MaterialPreview>,
    linked: Vec<AssetRef>,
    names: &dyn RowNames,
    assets: &dyn AssetLookup,
    shaders: Option<&BinDocument>,
    read: &mut dyn FnMut(&AssetRef) -> Option<BinDocument>,
) {
    missing.retain(|material| material.missing);
    if missing.is_empty() {
        return;
    }

    let locator = Locator { names, assets };
    walk_linked(linked, assets, read, &mut |asset, document| {
        for material in &mut missing {
            let Some(hash) = parse_hash(&material.hash) else {
                continue;
            };
            if document.object_at(hash).is_some() {
                **material = MaterialPreview {
                    source: Some(asset.clone()),
                    ..linked_material(document, hash, &locator, shaders)
                };
            }
        }
        missing.retain(|material| material.missing);
        if missing.is_empty() {
            Walk::Done
        } else {
            Walk::On
        }
    });
}
