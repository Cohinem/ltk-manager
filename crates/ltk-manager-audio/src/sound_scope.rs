//! The events that a sound field of a bin suggests: the bank units of its character's skin, then
//! any event of the game. "A sound field" in `docs/ux/BIN_EDITOR.md`.

use crate::index::{AudioIndex, IndexedUnit};

/// The folder of every character's bins, lowercased.
const CHARACTERS: &str = "data/characters/";

/// Returns the skin bins whose bank units a sound field of the bin `bin` plays from.
///
/// For a bin under `data/characters/<name>/`, these are the skin bin of the same skin number as
/// `bin`, then the base skin's, so `animations/skin7.bin` reads `skins/skin7.bin` and
/// `skins/skin0.bin`. A bin without a skin number reads the base skin alone. Returns no bin for a
/// bin outside the characters folder.
#[must_use]
pub fn scope_bins(bin: &str) -> Vec<String> {
    let lower = bin.replace('\\', "/").to_ascii_lowercase();
    let Some(rest) = lower.strip_prefix(CHARACTERS) else {
        return Vec::new();
    };
    let Some((character, _)) = rest.split_once('/') else {
        return Vec::new();
    };

    let skin = skin_number(&lower).unwrap_or(0);
    let mut bins = vec![skin_bin(character, skin)];
    if skin != 0 {
        bins.push(skin_bin(character, 0));
    }
    bins
}

/// Returns the bank units that the bins `bins` declare, in the order of `bins`.
///
/// Each bin takes its units from the first of `indexes` that declares any for it, so a project
/// index before the game's replaces the game's units of a bin that the project edits. A unit
/// without events is left out.
#[must_use]
pub fn scoped_units<'a>(bins: &[String], indexes: &[&'a AudioIndex]) -> Vec<&'a IndexedUnit> {
    bins.iter()
        .flat_map(|bin| {
            indexes
                .iter()
                .map(|index| units_of_bin(index, bin))
                .find(|units| !units.is_empty())
                .unwrap_or_default()
        })
        .filter(|indexed| !indexed.unit.events.is_empty())
        .collect()
}

/// The event names of an index that match a search, and how many matched in all.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EventMatches<'a> {
    /// The first matches, shortest name first and then by name.
    pub names: Vec<&'a str>,
    /// How many names matched, including those past `names`.
    pub total: usize,
}

impl AudioIndex {
    /// Returns the event names of the index that contain every whitespace-separated term of
    /// `query`, compared without ASCII case, at most `limit` of them.
    ///
    /// An empty query matches no name.
    #[must_use]
    pub fn search_events(&self, query: &str, limit: usize) -> EventMatches<'_> {
        let terms: Vec<String> = query
            .split_whitespace()
            .map(str::to_ascii_lowercase)
            .collect();
        if terms.is_empty() {
            return EventMatches::default();
        }

        let mut names: Vec<&str> = self
            .event_names()
            .iter()
            .map(|(_, name)| name)
            .filter(|name| {
                let lower = name.to_ascii_lowercase();
                terms.iter().all(|term| lower.contains(term.as_str()))
            })
            .collect();
        let total = names.len();

        names.sort_unstable_by(|a, b| a.len().cmp(&b.len()).then_with(|| a.cmp(b)));
        names.truncate(limit);
        EventMatches { names, total }
    }
}

/// Returns the units of `index` that the bin `bin` declares, compared without ASCII case.
fn units_of_bin<'a>(index: &'a AudioIndex, bin: &str) -> Vec<&'a IndexedUnit> {
    index
        .units()
        .iter()
        .filter(|indexed| indexed.bin.eq_ignore_ascii_case(bin))
        .collect()
}

/// Returns the skin number of a lowercased bin path whose file is `skinN.bin`.
fn skin_number(lower: &str) -> Option<u32> {
    let file = lower.rsplit('/').next()?;
    file.strip_prefix("skin")?
        .strip_suffix(".bin")?
        .parse()
        .ok()
}

fn skin_bin(character: &str, skin: u32) -> String {
    format!("{CHARACTERS}{character}/skins/skin{skin}.bin")
}

#[cfg(test)]
mod tests;
