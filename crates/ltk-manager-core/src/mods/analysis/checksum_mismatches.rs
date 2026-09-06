//! Transient record of checksum mismatches from the most recent overlay build.
//!
//! A mismatch is a chunk whose container claimed a checksum its own bytes do
//! not have - the mark of a badly-packed mod, worth re-exporting. Per upstream
//! ADR-0001 it is never a build failure: the overlay carries the checksum
//! recomputed while the bytes were copied, so the content reaches the game
//! intact either way. Like [`crate::mods::LinkedBinState`] this is in-memory
//! only and replaced wholesale on every build, because only chunks a build
//! actually passed through are observed - a WAD reused from a previous build
//! reports nothing.

use crate::error::AppResult;
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;

/// One chunk whose container claimed a checksum its own bytes do not have.
///
/// The hashes are hex strings rather than numbers because they are 64-bit
/// values, which JavaScript numbers cannot carry exactly.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ChecksumMismatchInfo {
    /// Library mod id (matches `InstalledMod.id` on the frontend).
    pub mod_id: String,
    /// The mod's WAD target the chunk was read from, e.g. `Aatrox.wad.client`.
    pub wad_name: String,
    /// Path hash of the chunk that disagreed, as 16 hex digits.
    pub path_hash: String,
    /// What the container's own TOC claimed, as 16 hex digits.
    pub claimed: String,
    /// What the bytes actually hash to - the value the overlay carries - as
    /// 16 hex digits.
    pub computed: String,
}

impl From<ltk_overlay::ChecksumMismatch> for ChecksumMismatchInfo {
    fn from(mismatch: ltk_overlay::ChecksumMismatch) -> Self {
        Self {
            mod_id: mismatch.mod_id,
            wad_name: mismatch.wad_name,
            path_hash: format!("{:016x}", mismatch.path_hash),
            claimed: format!("{:016x}", mismatch.claimed),
            computed: format!("{:016x}", mismatch.computed),
        }
    }
}

/// Tauri-managed snapshot of the mismatches found in the latest overlay build.
#[derive(Debug, Default)]
pub struct ChecksumMismatchState(pub Mutex<Vec<ChecksumMismatchInfo>>);

impl ChecksumMismatchState {
    /// Replace the stored mismatches with a fresh build's results.
    pub fn record(&self, mismatches: Vec<ltk_overlay::ChecksumMismatch>) -> AppResult<()> {
        let converted = mismatches.into_iter().map(Into::into).collect();
        *self.0.lock() = converted;
        Ok(())
    }

    /// Snapshot the current mismatches, keyed by mod id.
    pub fn by_mod(&self) -> AppResult<HashMap<String, Vec<ChecksumMismatchInfo>>> {
        let mut by_mod: HashMap<String, Vec<ChecksumMismatchInfo>> = HashMap::new();
        for info in self.0.lock().iter() {
            by_mod
                .entry(info.mod_id.clone())
                .or_default()
                .push(info.clone());
        }
        Ok(by_mod)
    }
}

#[cfg(test)]
mod tests;
