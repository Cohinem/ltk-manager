//! Where the bin round's objects come from: a `PROP` mounted as a stream, or
//! a `PTCH` parsed whole.
//!
//! The one function the streaming reader sits behind, with the `PTCH`
//! fallback beside it and nowhere else (FR-10, D17).

use std::io::{Read, Seek, SeekFrom};

use ltk_meta::BinOverride;
use ltk_meta::stream::BinStream;
use ltk_meta::walk::WalkOutcome;

use crate::problems::FileHandle;
use crate::problems::engine::Opened;

use super::fan::Fan;

/// The magic a `PTCH` opens with, which the streaming reader refuses.
const PATCH_MAGIC: [u8; 4] = *b"PTCH";

/// A bin the round walks, opened by its kind.
pub(super) enum BinSource<R: Read + Seek> {
    /// A `PROP`, mounted. One object's bytes in memory at a time.
    Stream(BinStream<R>),
    /// A `PTCH`, parsed whole. Its objects walk as a `PROP`'s do, and its
    /// patch records are outside the pass.
    Patch(BinOverride),
}

impl BinSource<Opened> {
    /// Open `handle` by its magic.
    ///
    /// # Errors
    ///
    /// A file that cannot be opened, or whose first bytes are not a bin the
    /// toolkit reads, as one sentence a panel can draw.
    pub(super) fn open(handle: &FileHandle<'_>) -> Result<Self, String> {
        let mut opened = handle.open()?;
        let mut magic = [0u8; 4];
        opened
            .read_exact(&mut magic)
            .and_then(|()| opened.seek(SeekFrom::Start(0)))
            .map_err(|e| e.to_string())?;

        if magic == PATCH_MAGIC {
            return BinOverride::from_reader(&mut opened)
                .map(Self::Patch)
                .map_err(|e| e.to_string());
        }
        BinStream::mount(opened)
            .map(Self::Stream)
            .map_err(|e| e.to_string())
    }
}

impl<R: Read + Seek> BinSource<R> {
    /// Walk every object through `fan`, in file order.
    ///
    /// # Errors
    ///
    /// An object the source could not read. Objects before it were walked, and
    /// the pass reports the failure under every subscriber at the file's site.
    pub(super) fn walk(&mut self, fan: &mut Fan<'_, '_>) -> Result<WalkOutcome, ltk_meta::Error> {
        match self {
            Self::Stream(stream) => stream.walk(fan),
            Self::Patch(patch) => patch.walk(fan),
        }
    }
}
