//! What a mod actually touches, and what that makes it.
//!
//! [`scan`] drives the overlay builder's WAD analysis for a single mod;
//! [`categorize`] turns the result into champions, maps and tags. The two
//! caches are deliberately different: [`wad_reports`] persists, because a mod's
//! footprint is a stable property of that mod, while [`linked_bins`] is
//! in-memory only, because whether a mod's links resolve depends on the entire
//! enabled set in a given build.

pub(super) mod categorize;
pub(super) mod linked_bins;
pub(super) mod scan;
pub(super) mod wad_reports;
