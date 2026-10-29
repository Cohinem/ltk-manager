//! Event names resolved into play trees for a viewport: the sounds of a clip or an effect.
//!
//! "Viewport sound" in `docs/ux/AUDIO.md`.

use std::collections::HashSet;

use serde::Serialize;

use crate::bank_set::{BankSet, BankUnit};
use crate::events::{EventTree, event_tree};
use crate::files::AudioFiles;
use crate::index::AudioIndex;
use crate::lookup::SoundLookup;
use crate::names::EventNames;

/// One event name and what it resolves to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct ResolvedSound {
    pub name: String,
    pub resolution: SoundResolution,
}

/// What one event name resolves to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(
    tag = "status",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SoundResolution {
    /// The play tree of the event.
    Resolved { tree: EventTree },
    /// No bank of the set holds an event of the name.
    NoEvent,
    /// An object of the tree cannot be decoded.
    DecodeError {
        object: u32,
        /// The game path of the bank that holds the object.
        bank: String,
        message: String,
    },
}

/// Resolves each of `names` into the play tree of its event, in the order given.
///
/// The bank set is `own`, the bank units of the open document. A name that `own` does not
/// resolve adds the bank units that `indexes` list for it, the first index first, and is looked
/// up again in the wider set. `own` stays first in that set, so its files win over the files of
/// an index unit for the same event.
#[must_use]
pub fn resolve_sounds(
    own: &[BankUnit],
    names: &[String],
    indexes: &[&AudioIndex],
    files: &dyn AudioFiles,
    locale: Option<&str>,
) -> Vec<ResolvedSound> {
    let table: EventNames = names.iter().collect();
    let set = BankSet::open(own, files, locale);
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
    let mut units = own.to_vec();
    let mut listed: HashSet<BankUnit> = own.iter().cloned().collect();
    for &at in &missing {
        for index in indexes {
            for indexed in index.units_listing(&names[at]) {
                if listed.insert(indexed.unit.clone()) {
                    units.push(indexed.unit.clone());
                }
            }
        }
    }
    if units.len() == own.len() {
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
        Ok(Some(tree)) => SoundResolution::Resolved {
            tree: event_tree(set, tree),
        },
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
