//! The answer of an index search: the rows it kept and how many matched.

use serde::Serialize;

/// The rows one search of an index kept, cut at its limit, and how many matched in all.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct Capped<T> {
    /// The rows in the order the search gives them, at most its limit.
    pub hits: Vec<T>,
    /// How many rows matched in all, counted on past the cap.
    pub total: u32,
    /// A newer search overtook this one, so the hits are a part of the answer.
    ///
    /// The caller is expected to be showing the newer search by now.
    pub superseded: bool,
    /// No table named a single entry of the index, so only a hash can match.
    ///
    /// An index whose names never resolved answers every path query with nothing,
    /// which reads exactly like an index that holds no match. The caller says which.
    pub unnamed: bool,
}

impl<T> Capped<T> {
    /// A search that found nothing.
    pub fn empty(unnamed: bool) -> Self {
        Self {
            hits: Vec::new(),
            total: 0,
            superseded: false,
            unnamed,
        }
    }
}
