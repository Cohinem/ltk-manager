//! Every audio concept of LTK Manager: the bank set, the sound lookup, the play tree, WEM
//! decoding and the event name table.
//!
//! The crate reads Wwise files through `ltk_wwise` and knows no Tauri type. It reads game paths
//! through [`AudioFiles`], which the shell implements over the sandbox.

mod bank_set;
mod bin_audio;
mod cache;
mod container;
mod decode;
mod events;
mod files;
mod game;
mod index;
mod info;
mod lookup;
mod media;
mod names;
mod sound;

/// Re-exported so a consumer names the `ltk_wwise` types of this crate's release.
pub use ltk_wwise;
pub use ltk_wwise::{ObjectId, SourceId};

pub use bank_set::{
    BANK_EVENTS, BANK_PATH, BANK_UNIT, BANK_UNIT_NAME, BANK_VOICE_OVER, BankContent, BankFile,
    BankSet, BankUnit, EVENT_FIELDS,
};
pub use bin_audio::BinAudio;
pub use cache::SoundCache;
pub use decode::{AudioFormat, DecodeError, DecodeFailure, Decoded, decode};
pub use events::{
    AudioEvent, AudioEventList, BankSetOrigin, EventAction, EventBank, EventNode, EventStatus,
    EventTree, MediaContainer, MediaLocation, OpenedBank, SetFile, SetFileState, SoundStream,
    action_label,
};
pub use files::{AudioFile, AudioFiles, ReadSeek};
pub use game::{GameFile, HEAD_BYTES, read_game};
pub use index::{AudioIndex, AudioIndexBuilder, IndexedUnit, media_sources};
pub use info::audio_info;
pub use lookup::{ActionNode, LookupError, MediaSite, PlayNode, PlayTree, SoundLookup};
pub use media::{MediaError, MediaFormat, MediaRow, Playback, media_rows};
pub use names::EventNames;
pub use sound::{SoundError, media, sound};
