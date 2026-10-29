//! One media of an audio file, as its WEM bytes or decoded: the answer of the `sound` preview
//! form and of a media export.

use std::borrow::Cow;
use std::io::Cursor;

use ltk_wwise::package::PackageKey;
use ltk_wwise::{Bank, MountedPackage, SourceId};

use crate::container::{AudioKind, kind_of_bytes};
use crate::decode::{DecodeError, Decoded, decode};

/// Why an audio file gives no sound for a source ID.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum SoundError {
    /// The package or bank contains no media with the source ID.
    #[error("the file contains no media {source_id}")]
    NoMedia { source_id: SourceId },

    /// The file is not a package, a bank or a WEM.
    #[error("the file is not a Wwise package, bank or WEM")]
    NotAudio,

    /// The package or bank cannot be read.
    #[error("the audio file cannot be read: {0}")]
    Read(#[from] ltk_wwise::Error),

    /// The media cannot be decoded.
    #[error(transparent)]
    Decode(#[from] DecodeError),
}

/// Decodes the media `source_id` of the package, bank or WEM `file`.
///
/// The kind of file is read from its magic. A WEM file is one media and ignores `source_id`. A
/// package is mounted, so only the entry records and the one media are read.
///
/// # Errors
///
/// - The errors of [`media`].
/// - [`SoundError::Decode`] if the media cannot be decoded.
pub fn sound(file: &[u8], source_id: SourceId) -> Result<Decoded, SoundError> {
    Ok(decode(source_id, &media(file, source_id)?)?)
}

/// Returns the WEM bytes of the media `source_id` of the package, bank or WEM `file`.
///
/// The kind of file is read from its magic. A WEM file is one media and ignores `source_id`.
///
/// # Errors
///
/// - [`SoundError::NoMedia`] if a package or bank contains no media `source_id`.
/// - [`SoundError::NotAudio`] if `file` is not a package, a bank or a WEM.
/// - [`SoundError::Read`] if the package or bank cannot be read.
pub fn media(file: &[u8], source_id: SourceId) -> Result<Cow<'_, [u8]>, SoundError> {
    match kind_of_bytes(file).ok_or(SoundError::NotAudio)? {
        AudioKind::Package => packaged_media(file, source_id).map(Cow::Borrowed),
        AudioKind::Bank => banked_media(file, source_id).map(Cow::Owned),
        AudioKind::Media => Ok(Cow::Borrowed(file)),
    }
}

/// Returns the entry name key of the media `source_id` in a package.
pub(crate) fn package_key(source_id: SourceId) -> PackageKey {
    PackageKey::from_name(&format!("{source_id}.wem"))
}

fn packaged_media(file: &[u8], source_id: SourceId) -> Result<&[u8], SoundError> {
    let package = MountedPackage::mount(Cursor::new(file))?;
    let entry = package
        .get(package_key(source_id))
        .ok_or(SoundError::NoMedia { source_id })?;

    let start = entry.offset() as usize;
    file.get(start..start + entry.size() as usize)
        .ok_or(SoundError::NoMedia { source_id })
}

fn banked_media(file: &[u8], source_id: SourceId) -> Result<Vec<u8>, SoundError> {
    let bank = Bank::from_reader(&mut Cursor::new(file))?;
    bank.media()
        .and_then(|media| media.get(source_id))
        .map(<[u8]>::to_vec)
        .ok_or(SoundError::NoMedia { source_id })
}
