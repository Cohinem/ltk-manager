//! Every audio concept of LTK Manager: the bank set, the sound lookup, the play tree, WEM
//! decoding and the event name table.
//!
//! The crate reads Wwise files through `ltk_wwise` and knows no Tauri type. It reads game paths
//! through [`AudioFiles`], which the shell implements over the sandbox.

mod bank_set;
mod bin_audio;
mod cache;
mod container;
mod contextual;
mod decode;
mod events;
mod files;
mod game;
mod index;
mod info;
mod lookup;
mod media;
mod names;
mod references;
mod sound;
mod sounds;

/// Re-exported so a consumer names the `ltk_wwise` types of this crate's release.
pub use ltk_wwise;
pub use ltk_wwise::{ObjectId, SourceId};

pub use bank_set::{
    BANK_EVENTS, BANK_LISTS, BANK_PATH, BANK_UNIT, BANK_UNIT_NAME, BANK_VOICE_OVER, BankContent,
    BankFile, BankSet, BankUnit, CONDITION_SPELL, CONDITION_SPELL_NAME, CONTEXTUAL_ACTION_DATA,
    CONTEXTUAL_ACTION_LINK, CONTEXTUAL_RULE, EVENT_FIELDS, RULE_AUDIO_ACTION, RULE_CONDITIONS,
    RULE_NAME, SKIN_AUDIO_PROPERTIES, TAG_EVENT_LIST,
};
pub use bin_audio::{
    Audience, AudienceName, BankList, BankSite, BinAudio, ContextualRule, ContextualRules,
    HolderAudio, SiteStep, SitedUnit,
};
pub use cache::SoundCache;
pub use contextual::{ContextualMatch, contextual_names};
pub use decode::{AudioFormat, DecodeError, DecodeFailure, Decoded, decode};
pub use events::{
    AudioEvent, AudioEventList, BankSetOrigin, EventAction, EventBank, EventContext, EventNode,
    EventStatus, EventTree, MediaContainer, MediaLocation, OpenedBank, SetFile, SetFileState,
    SoundStream, action_label,
};
pub use files::{AudioFile, AudioFiles, ReadSeek};
pub use game::{GameFile, HEAD_BYTES, read_game};
pub use index::{
    AudioIndex, AudioIndexBuilder, IndexedList, IndexedRules, IndexedUnit, media_sources,
};
pub use info::audio_info;
pub use lookup::{ActionNode, LookupError, MediaSite, PlayNode, PlayTree, SoundLookup};
pub use media::{MediaError, MediaFormat, MediaRow, Playback, media_rows};
pub use names::EventNames;
pub use references::{BankDeclaration, BankReferences, BankUnitGroup, BinRow, RowPath, SiteNames};
pub use sound::{SoundError, media, sound};
pub use sounds::{ResolvedSound, SoundResolution, resolve_sounds};
