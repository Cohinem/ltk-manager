//! The media table of an audio file: one row per media, read without decoding audio.

use std::io::Cursor;

use ltk_wwise::wem::{WemCodec, WemInfo};
use ltk_wwise::{Bank, MountedPackage};
use serde::Serialize;

use crate::container::{AudioKind, kind_of_bytes};

/// One media of a package, a media bank or a WEM.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct MediaRow {
    /// The source ID of the media, which is 0 for a WEM file.
    pub source_id: u32,
    /// The bytes that the media takes in the file.
    pub size_bytes: u32,
    /// The `fmt ` and `data` facts, or `None` if the media is not a readable WEM.
    pub format: Option<MediaFormat>,
    /// Whether the media decodes for playback, and why not.
    pub playback: Playback,
}

/// The format facts of one WEM media, from its `fmt ` and `data` chunk headers.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(rename_all = "camelCase")]
pub struct MediaFormat {
    /// The `wFormatTag` of the media.
    pub codec: u16,
    /// The number of channels.
    pub channels: u16,
    /// Samples per second.
    pub sample_rate: u32,
    /// The `nAvgBytesPerSec` of the media, which the duration divides by.
    pub average_bytes_per_second: u32,
    /// The size of the `data` chunk in bytes.
    pub data_size: u32,
    /// The length in seconds, or `None` if the byte rate is 0. An estimate for Vorbis.
    pub duration_seconds: Option<f64>,
}

/// Whether the decoder of the crate plays a media.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "ts", derive(specta::Type))]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Playback {
    /// The codec is Vorbis or PCM.
    Playable,
    /// The codec has no decoder in the crate.
    UnsupportedCodec,
    /// The media is not a readable WEM.
    Unreadable { message: String },
}

/// Why an audio file gives no media table.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum MediaError {
    /// The file is not a Wwise package, bank or WEM.
    #[error("the file is not a Wwise package, bank or WEM")]
    NotAudio,

    /// The package or bank cannot be read.
    #[error("the audio file cannot be read: {0}")]
    Read(#[from] ltk_wwise::Error),
}

/// Lists the media of the package, bank or WEM `file`, read from its magic.
///
/// A package lists its entries in file order and a bank its media index in ascending source ID
/// order. A WEM is one row of source ID 0. Each row reads the `fmt ` chunk of its media and no
/// audio is decoded. A package entry whose key does not fit a source ID is skipped.
///
/// # Errors
///
/// - [`MediaError::NotAudio`] if `file` is not a package, a bank or a WEM.
/// - [`MediaError::Read`] if the package or bank cannot be read.
pub fn media_rows(file: &[u8]) -> Result<Vec<MediaRow>, MediaError> {
    match kind_of_bytes(file).ok_or(MediaError::NotAudio)? {
        AudioKind::Package => packaged_rows(file),
        AudioKind::Bank => banked_rows(file),
        AudioKind::Media => Ok(vec![row(0, file)]),
    }
}

fn packaged_rows(file: &[u8]) -> Result<Vec<MediaRow>, MediaError> {
    let package = MountedPackage::mount(Cursor::new(file))?;

    let rows = package
        .entries()
        .iter()
        .filter_map(|entry| {
            let source_id = u32::try_from(entry.key().0).ok()?;
            let start = entry.offset() as usize;
            let media = file.get(start..start + entry.size() as usize)?;
            Some(row(source_id, media))
        })
        .collect();
    Ok(rows)
}

fn banked_rows(file: &[u8]) -> Result<Vec<MediaRow>, MediaError> {
    let bank = Bank::from_reader(&mut Cursor::new(file))?;

    let Some(media) = bank.media() else {
        return Ok(Vec::new());
    };
    Ok(media
        .iter()
        .map(|(source_id, bytes)| row(source_id.0, bytes))
        .collect())
}

/// Returns the row of the media `source_id` whose bytes are `media`.
fn row(source_id: u32, media: &[u8]) -> MediaRow {
    let size_bytes = u32::try_from(media.len()).unwrap_or(u32::MAX);

    match WemInfo::from_bytes(media) {
        Ok(info) => MediaRow {
            source_id,
            size_bytes,
            format: Some(MediaFormat {
                codec: info.codec.0,
                channels: info.channels,
                sample_rate: info.sample_rate,
                average_bytes_per_second: info.average_bytes_per_second,
                data_size: info.data_size,
                duration_seconds: info.duration().map(|duration| duration.as_secs_f64()),
            }),
            playback: playback_of(info.codec),
        },
        Err(error) => MediaRow {
            source_id,
            size_bytes,
            format: None,
            playback: Playback::Unreadable {
                message: error.to_string(),
            },
        },
    }
}

/// Returns the playback of a media of `codec`: the codecs that [`crate::decode`] converts.
fn playback_of(codec: WemCodec) -> Playback {
    match codec {
        WemCodec::VORBIS | WemCodec::PCM | WemCodec::PCM_EXTENSIBLE => Playback::Playable,
        _ => Playback::UnsupportedCodec,
    }
}
