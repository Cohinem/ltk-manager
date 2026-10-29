//! One media of an audio file, decoded: the answer of the `sound` preview form.

use std::io::Cursor;

use ltk_wwise::package::PackageKey;
use ltk_wwise::{Bank, MountedPackage, SourceId};

use crate::decode::{DecodeError, Decoded, decode};

/// Why an audio file gives no sound for a source ID.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum SoundError {
    /// The package or bank holds no media with the source ID.
    #[error("the file holds no media {source_id}")]
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
/// The kind of file is read from its magic. A WEM is its own media and ignores `source_id`. A
/// package is mounted, so only the entry records and the one media are read.
///
/// # Errors
///
/// - [`SoundError::NoMedia`] if a package or bank holds no media `source_id`.
/// - [`SoundError::NotAudio`] if `file` is not a package, a bank or a WEM.
/// - [`SoundError::Read`] if the package or bank cannot be read.
/// - [`SoundError::Decode`] if the media cannot be decoded.
pub fn sound(file: &[u8], source_id: SourceId) -> Result<Decoded, SoundError> {
    let media = match file.get(..4) {
        Some(PACKAGE_MAGIC) => packaged_media(file, source_id)?,
        Some(BANK_MAGIC) => banked_media(file, source_id)?,
        Some(WEM_MAGIC) => return Ok(decode(source_id, file)?),
        _ => return Err(SoundError::NotAudio),
    };

    Ok(decode(source_id, &media)?)
}

/// Returns the entry name key of the media `source_id` in a package.
pub(crate) fn package_key(source_id: SourceId) -> PackageKey {
    PackageKey::from_name(&format!("{source_id}.wem"))
}

fn packaged_media(file: &[u8], source_id: SourceId) -> Result<Vec<u8>, SoundError> {
    let mut package = MountedPackage::mount(Cursor::new(file))?;
    let entry = package
        .get(package_key(source_id))
        .cloned()
        .ok_or(SoundError::NoMedia { source_id })?;

    Ok(package.read(&entry)?)
}

fn banked_media(file: &[u8], source_id: SourceId) -> Result<Vec<u8>, SoundError> {
    let bank = Bank::from_reader(&mut Cursor::new(file))?;
    bank.media()
        .and_then(|media| media.get(source_id))
        .map(<[u8]>::to_vec)
        .ok_or(SoundError::NoMedia { source_id })
}

/// The magic of a package: `r3d2`.
const PACKAGE_MAGIC: &[u8] = b"r3d2";

/// The magic of a bank: its first chunk, `BKHD`.
const BANK_MAGIC: &[u8] = b"BKHD";

/// The magic of a WEM, a RIFF file.
const WEM_MAGIC: &[u8] = b"RIFF";
