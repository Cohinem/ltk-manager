//! The voice-over event names composed from the `ContextualActionData` rules of a skin.
//!
//! A rule names an event by a short name, such as `cast3D`. The client composes the Wwise name
//! from the skin's `tagEventList`. The composition is observed in shipped data and not read from
//! the client, so a match is an inference. "Names" in `docs/ux/AUDIO.md`.

use std::collections::HashSet;

use ltk_wwise::ObjectId;

use crate::bin_audio::Audience;
use crate::index::{AudioIndex, IndexedUnit};
use crate::references::SiteNames;

/// One event of a bank that a contextual rule plays.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContextualMatch {
    /// The ID of the event that the composed name hashes to.
    pub event: ObjectId,
    /// The composed name, such as `Play_vo_Ahri_AhriBasicAttack_cast3D`.
    pub name: String,
    /// The path hash of the `ContextualActionData` object.
    pub object: u32,
    /// The position of the rule in the object's rules, in the first index that declares it.
    pub rule: usize,
    /// The audience whose short name composes the name.
    pub audience: Audience,
    /// `true` if another composition of the same rule and audience is an event of the bank too.
    pub ambiguous: bool,
}

/// Returns the events of `bank_events` that the contextual rules of the holders of `units` play.
///
/// For each rule that a holder's `mContextualActionData` link reaches, the first index that
/// declares the object first, and each tag of the holder, the function composes
/// `Play_vo_<tag>_<name>`, and `Play_vo_<tag>_<spell>_<name>` for each spell condition, where
/// `<spell>` is the last segment of the spell path that `names` gives. A composition whose ID is
/// not in `bank_events` is skipped. A rule and audience reached twice is one match.
#[must_use]
pub fn contextual_names(
    units: &[&IndexedUnit],
    indexes: &[&AudioIndex],
    bank_events: &HashSet<ObjectId>,
    names: &dyn SiteNames,
) -> Vec<ContextualMatch> {
    let mut found: Vec<ContextualMatch> = Vec::new();
    let mut holders = HashSet::new();

    for indexed in units {
        let Some(object) = indexed.holder.contextual else {
            continue;
        };
        if !holders.insert((object, &indexed.holder.tags)) {
            continue;
        }
        let Some(rules) = indexes.iter().find_map(|index| index.contextual(object)) else {
            continue;
        };

        for (position, rule) in rules.rules.iter().enumerate() {
            let spells: Vec<String> = rule
                .spells
                .iter()
                .filter_map(|spell| names.hash_name(*spell))
                .map(|path| last_segment(&path).to_owned())
                .collect();

            for audience_name in &rule.names {
                let mut composed = Vec::new();
                for tag in &indexed.holder.tags {
                    composed.push(format!("{PREFIX}{tag}_{}", audience_name.name));
                    for spell in &spells {
                        composed.push(format!("{PREFIX}{tag}_{spell}_{}", audience_name.name));
                    }
                }

                let mut ids = HashSet::new();
                let matched: Vec<(ObjectId, String)> = composed
                    .into_iter()
                    .map(|name| (ObjectId::from_name(&name), name))
                    .filter(|(id, _)| bank_events.contains(id) && ids.insert(*id))
                    .collect();
                let ambiguous = matched.len() > 1;

                for (event, name) in matched {
                    let existing = found.iter_mut().find(|existing| {
                        existing.event == event
                            && existing.object == object
                            && existing.rule == position
                            && existing.audience == audience_name.audience
                    });
                    match existing {
                        Some(existing) => existing.ambiguous |= ambiguous,
                        None => found.push(ContextualMatch {
                            event,
                            name,
                            object,
                            rule: position,
                            audience: audience_name.audience,
                            ambiguous,
                        }),
                    }
                }
            }
        }
    }
    found
}

/// Returns the part of `path` after its last `/`.
fn last_segment(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// The prefix of a voice-over play event name.
const PREFIX: &str = "Play_vo_";
