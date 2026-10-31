//! The IDs of new objects and new media.
//!
//! "New objects" in `docs/ux/AUDIO.md`. A new ID is the FNV-1 hash of a generated name:
//! `ltk-manager/<bank ID>/<n>` for an object, and `ltk-manager/<bank ID>/media/<xxh64>/<n>` for
//! a media, where `<xxh64>` is the hash of the WEM. `n` counts up from 0 until the ID is free.

use ltk_wwise::{ObjectId, SourceId};
use xxhash_rust::xxh64::xxh64;

use super::history::Tx;

/// The prefix of every generated name.
const PREFIX: &str = "ltk-manager";

/// Returns the name that the object ID `n` of the bank `bank` is the hash of.
#[must_use]
fn object_seed(bank: u32, n: u32) -> String {
    format!("{PREFIX}/{bank}/{n}")
}

/// Returns the name that the source ID `n` of the WEM `wem` in the bank `bank` is the hash of.
#[must_use]
fn source_seed(bank: u32, wem: &[u8], n: u32) -> String {
    format!("{PREFIX}/{bank}/media/{:016x}/{n}", xxh64(wem, 0))
}

impl Tx<'_, '_> {
    /// Returns an object ID that no object of the opened bank or the set, no event name of the
    /// audio indexes and no earlier draw of the edit uses.
    pub fn fresh_object(&mut self) -> ObjectId {
        let bank = self.bank_id.0;
        let id = (0..)
            .map(|n| ObjectId::from_name(&object_seed(bank, n)))
            .find(|id| id.0 != 0 && !self.is_object_taken(*id))
            .expect("the seeds give more IDs than any bank takes");
        self.drawn.insert(id.0);
        id
    }

    /// Returns a source ID for the WEM `wem` that no media of the set, of the audio indexes, of
    /// the document's media files and no earlier draw of the edit uses.
    pub fn fresh_source(&mut self, wem: &[u8]) -> SourceId {
        let bank = self.bank_id.0;
        let source = (0..)
            .map(|n| SourceId(ObjectId::from_name(&source_seed(bank, wem, n)).0))
            .find(|source| source.0 != 0 && !self.is_source_taken(*source))
            .expect("the seeds give more IDs than any bank takes");
        self.drawn.insert(source.0);
        source
    }

    /// Returns `true` if an object, an event name or a draw of the edit uses `id`.
    pub fn is_object_taken(&self, id: ObjectId) -> bool {
        self.drawn.contains(&id.0)
            || self.object(id).is_some()
            || self.context.set.object(id).is_some()
            || self
                .context
                .indexes
                .iter()
                .any(|index| index.name(id).is_some())
    }

    fn is_source_taken(&self, source: SourceId) -> bool {
        self.drawn.contains(&source.0)
            || self.context.set.bank_with_media(source).is_some()
            || self.context.set.package_with_media(source).is_some()
            || self.media.iter().any(|file| file.contains(source))
            || self
                .context
                .indexes
                .iter()
                .any(|index| index.uses_source(source))
    }
}
