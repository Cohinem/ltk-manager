//! Where the bin round's objects come from: a `PROP` mounted as a stream, or
//! a `PTCH` parsed whole.
//!
//! The one function the streaming reader sits behind, with the `PTCH`
//! fallback beside it and nowhere else (FR-10, D17).

use std::io::{Read, Seek};

use ltk_meta::walk::WalkOutcome;

use crate::problems::FileHandle;
use crate::problems::engine::Opened;
use ltk_manager_assets::bin_source::BinSource;

use super::fan::Fan;

/// Open `handle` by its magic.
///
/// # Errors
///
/// A file that cannot be opened, or whose first bytes are not a bin the
/// toolkit reads, as one sentence a panel can draw.
pub(super) fn open_handle(handle: &FileHandle<'_>) -> Result<BinSource<Opened>, String> {
    BinSource::open(handle.open()?).map_err(|e| e.to_string())
}

/// Walk every object of `source` through `fan`, in file order. A `PTCH`'s objects walk as a
/// `PROP`'s do, and its patch records are outside the pass.
///
/// # Errors
///
/// An object the source could not read. Objects before it were walked, and
/// the pass reports the failure under every subscriber at the file's site.
pub(super) fn walk<R: Read + Seek>(
    source: &mut BinSource<R>,
    fan: &mut Fan<'_, '_>,
) -> Result<WalkOutcome, ltk_meta::Error> {
    match source {
        BinSource::Stream(stream) => stream.walk(fan),
        BinSource::Patch(patch) => patch.walk(fan),
    }
}
