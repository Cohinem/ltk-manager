//! What a Wwise file holds, as the audio file document reports it.
//!
//! The types are data only. `ltk-manager-audio` reads the file and fills them, because the
//! Wwise reader sits above this crate.

use serde::Serialize;

/// The header facts of a Wwise package, bank or WEM.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct AudioInfo {
    pub container: AudioContainer,
    /// The size of the file itself.
    pub size_bytes: u64,
    /// The number of media in the file, 0 if the file cannot be read.
    pub media_count: u32,
    /// The `BKHD` facts of a bank that reads.
    pub bank: Option<BankFacts>,
    /// The reader's error if the file cannot be read. It names the offset where the reader
    /// knows one.
    pub failure: Option<String>,
}

/// The kind of Wwise file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub enum AudioContainer {
    /// A package (`.wpk`) of streamed media.
    Package,
    /// A media bank or an event bank (`.bnk`).
    Bank,
    /// One WEM media file (`.wem`).
    Media,
}

/// The `BKHD` header of a bank, and whether the client loads the bank.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct BankFacts {
    pub version: u32,
    pub bank_type: u32,
    /// The `uAlignment` field as written.
    pub alignment: u16,
    /// The bank ID of the header, which the client does not read.
    pub header_id: u32,
    /// The bank ID of the file name, which the client registers the bank under. `None` if the
    /// asset has no `.bnk` file name, as a game chunk has.
    pub name_id: Option<u32>,
    /// The reason the client rejects the bank, in the words of `Bank::check`.
    pub rejection: Option<String>,
    /// The number of events of the hierarchy, or `None` if the bank has no hierarchy.
    pub event_count: Option<u32>,
}
