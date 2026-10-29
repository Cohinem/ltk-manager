//! Every audio concept of LTK Manager: the bank set, the sound lookup, the play tree, WEM
//! decoding and the event name table.
//!
//! The crate reads Wwise files through `ltk_wwise` and knows no Tauri type. It reads game paths
//! through [`AudioFiles`], which the shell implements over the sandbox.

mod bank_set;
mod cache;
mod container;
mod decode;
mod files;
mod info;
mod lookup;
mod media;
mod names;
mod sound;

/// Re-exported so a consumer names the `ltk_wwise` types of this crate's release.
pub use ltk_wwise;
pub use ltk_wwise::{ObjectId, SourceId};

pub use bank_set::{BankContent, BankFile, BankSet, BankUnit};
pub use cache::SoundCache;
pub use decode::{AudioFormat, DecodeError, DecodeFailure, Decoded, decode};
pub use files::{AudioFile, AudioFiles, ReadSeek};
pub use info::audio_info;
pub use lookup::{ActionNode, LookupError, MediaSite, PlayNode, PlayTree, SoundLookup};
pub use media::{MediaError, MediaFormat, MediaRow, Playback, media_rows};
pub use names::EventNames;
pub use sound::{SoundError, media, sound};
