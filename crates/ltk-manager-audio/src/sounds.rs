//! Event names resolved into play trees for a viewport: the sounds of a clip or an effect.
//!
//! "Viewport sound" in `docs/ux/AUDIO.md`.
//!
//! An ID crosses IPC as a `u32`, because the `ltk_wwise` ID types implement neither `Serialize`
//! nor `specta::Type`, and a serde adapter splits a specta type into two phases.

use std::collections::HashSet;

use serde::Serialize;

use crate::bank_set::{BankSet, BankUnit};
use crate::events::{EventTree, ObjectProperties, event_tree, tree_properties};
use crate::files::AudioFiles;
use crate::index::AudioIndex;
use crate::lookup::SoundLookup;
use crate::names::EventNames;

/// One event name and what it resolves to.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSound {
    /// The event name, as asked for.
    pub name: String,
    /// What the name resolves to.
    pub resolution: SoundResolution,
}

/// What one event name resolves to.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SoundResolution {
    /// The play tree of the event.
    Resolved {
        tree: EventTree,
        /// The properties of the actions and nodes of the tree, which the voices play with.
        properties: Vec<ObjectProperties>,
    },
    /// No bank of the set contains an event of the name.
    NoEvent,
    /// An object of the tree cannot be decoded.
    DecodeError {
        /// The ID of the object that does not decode.
        object: u32,
        /// The game path of the bank that contains the object.
        bank: String,
        /// The error of the decode.
        message: String,
    },
}

/// Resolves each of `names` into the play tree of its event, in the order given.
///
/// The bank set is `document_units`, the bank units of the open document. A name that they do not
/// resolve adds the bank units that `indexes` list for it, the first index first, and is looked
/// up again in the wider set. `document_units` stay first in that set, so its files win over the files of
/// an index unit for the same event.
#[must_use]
pub fn resolve_sounds(
    document_units: &[BankUnit],
    names: &[String],
    indexes: &[&AudioIndex],
    files: &dyn AudioFiles,
    locale: Option<&str>,
) -> Vec<ResolvedSound> {
    let table: EventNames = names.iter().collect();
    let set = BankSet::open(document_units, files, locale);
    let mut resolved: Vec<ResolvedSound> = names
        .iter()
        .map(|name| resolve(&set, &table, name))
        .collect();

    let missing: Vec<usize> = resolved
        .iter()
        .enumerate()
        .filter(|(_, sound)| sound.resolution == SoundResolution::NoEvent)
        .map(|(at, _)| at)
        .collect();
    let mut units = document_units.to_vec();
    let mut listed: HashSet<BankUnit> = document_units.iter().cloned().collect();
    for &at in &missing {
        for index in indexes {
            for indexed in index.units_listing(&names[at]) {
                if listed.insert(indexed.unit.clone()) {
                    units.push(indexed.unit.clone());
                }
            }
        }
    }
    if units.len() == document_units.len() {
        return resolved;
    }

    let wider = BankSet::open(&units, files, locale);
    for at in missing {
        resolved[at] = resolve(&wider, &table, &names[at]);
    }
    resolved
}

fn resolve(set: &BankSet, names: &EventNames, name: &str) -> ResolvedSound {
    let resolution = match SoundLookup::new(set, names).event_named(name) {
        Ok(Some(tree)) => {
            let tree = event_tree(set, tree);
            let properties = tree_properties(set, &tree);
            SoundResolution::Resolved { tree, properties }
        }
        Ok(None) => SoundResolution::NoEvent,
        Err(error) => SoundResolution::DecodeError {
            object: error.object.0,
            bank: error.bank.clone(),
            message: error.error.to_string(),
        },
    };

    ResolvedSound {
        name: name.to_owned(),
        resolution,
    }
}
