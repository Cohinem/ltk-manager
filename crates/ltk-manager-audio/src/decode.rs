//! WEM media to a stream that a webview plays.

use std::io::Cursor;

use lewton::inside_ogg::OggStreamReader;
use ltk_wwise::SourceId;
use ltk_wwise::wem::{WemCodec, WemInfo};
use ww2ogg::{CodebookLibrary, WwiseRiffVorbis};

/// The container of a decoded media.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AudioFormat {
    /// Ogg Vorbis.
    Ogg,
    /// A RIFF `WAVE` file of integer PCM.
    Wav,
}

impl AudioFormat {
    /// Returns the MIME type of the format.
    #[must_use]
    pub fn mime(self) -> &'static str {
        match self {
            Self::Ogg => "audio/ogg",
            Self::Wav => "audio/wav",
        }
    }
}

/// One media, decoded into a format that a webview plays.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Decoded {
    pub bytes: Vec<u8>,
    pub format: AudioFormat,
}

/// A media that cannot be decoded.
#[derive(Debug, thiserror::Error)]
#[error("media {source_id} cannot be decoded: {reason}")]
pub struct DecodeError {
    /// The source ID of the media.
    pub source_id: SourceId,
    pub reason: DecodeFailure,
}

/// Why a media cannot be decoded.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum DecodeFailure {
    /// The codec of the media has no decoder in the crate.
    #[error("codec {:#06x} is not supported", .0.0)]
    Codec(WemCodec),

    /// The media is not a WEM.
    #[error(transparent)]
    Wem(ltk_wwise::Error),

    /// The Vorbis conversion failed.
    #[error("the Vorbis conversion failed: {0}")]
    Vorbis(ww2ogg::WemError),

    /// The PCM media has no `fmt ` or `data` chunk that the WAV writer reads.
    #[error("the PCM media is malformed: {0}")]
    Pcm(&'static str),
}

/// Decodes the WEM `media` of the source `source_id`.
///
/// # Errors
///
/// Fails with a [`DecodeError`] that names `source_id` if the media is not a WEM, if its codec is
/// neither Vorbis nor PCM, or if the conversion fails.
pub fn decode(source_id: SourceId, media: &[u8]) -> Result<Decoded, DecodeError> {
    let fail = |reason| DecodeError { source_id, reason };

    let info = WemInfo::from_bytes(media).map_err(|e| fail(DecodeFailure::Wem(e)))?;
    match info.codec {
        WemCodec::VORBIS => vorbis_to_ogg(media)
            .map(|bytes| Decoded {
                bytes,
                format: AudioFormat::Ogg,
            })
            .map_err(|e| fail(DecodeFailure::Vorbis(e))),
        WemCodec::PCM | WemCodec::PCM_EXTENSIBLE => pcm_to_wav(media)
            .map(|bytes| Decoded {
                bytes,
                format: AudioFormat::Wav,
            })
            .map_err(|e| fail(DecodeFailure::Pcm(e))),
        codec => Err(fail(DecodeFailure::Codec(codec))),
    }
}

/// Converts the Wwise Vorbis WEM `media` to Ogg Vorbis and validates the result.
fn vorbis_to_ogg(media: &[u8]) -> ww2ogg::WemResult<Vec<u8>> {
    let codebooks = CodebookLibrary::aotuv_codebooks()?;
    let mut converter = WwiseRiffVorbis::new(Cursor::new(media), codebooks)?;

    let mut ogg = Vec::with_capacity(media.len());
    converter.generate_ogg(&mut ogg)?;

    validate(&ogg)?;
    Ok(ogg)
}

/// Fails if the headers or the first packets of the Ogg Vorbis stream `ogg` do not decode.
///
/// A wrong codebook fails in the setup header. `ww2ogg::validate` also rejects a packet whose
/// samples clip, which rejects loud media that the game ships, so the check is written here.
fn validate(ogg: &[u8]) -> ww2ogg::WemResult<()> {
    let invalid = |e: lewton::VorbisError| ww2ogg::WemError::codebook(e.to_string());

    let mut reader = OggStreamReader::new(Cursor::new(ogg)).map_err(invalid)?;
    let mut samples = 0;
    for _ in 0..VALIDATED_PACKETS {
        match reader.read_dec_packet_itl().map_err(invalid)? {
            Some(packet) => samples += packet.len(),
            None => break,
        }
    }

    if samples == 0 {
        return Err(ww2ogg::WemError::codebook("the stream holds no samples"));
    }
    Ok(())
}

/// The number of audio packets that [`validate`] decodes.
const VALIDATED_PACKETS: usize = 10;

/// Writes the PCM WEM `media` as a WAV file with a 16-byte `fmt ` chunk and the `data` chunk.
///
/// The `fmt ` tag is written as 1, integer PCM, for a WEM that carries `WAVEFORMATEXTENSIBLE`.
fn pcm_to_wav(media: &[u8]) -> Result<Vec<u8>, &'static str> {
    let fmt = riff_chunk(media, b"fmt ").ok_or("no fmt chunk")?;
    let fmt = fmt
        .first_chunk::<PCM_FMT_LEN>()
        .ok_or("fmt chunk shorter than 16 bytes")?;
    let data = riff_chunk(media, b"data").ok_or("no data chunk")?;

    let data_len = u32::try_from(data.len()).map_err(|_| "data chunk exceeds 4 GiB")?;
    let riff_len = data_len
        .checked_add(WAV_HEADER_LEN - 8)
        .ok_or("data chunk exceeds 4 GiB")?;

    let mut wav = Vec::with_capacity(WAV_HEADER_LEN as usize + data.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&riff_len.to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&(PCM_FMT_LEN as u32).to_le_bytes());
    wav.extend_from_slice(&WemCodec::PCM.0.to_le_bytes());
    wav.extend_from_slice(&fmt[2..]);
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(data);
    Ok(wav)
}

/// Returns the body of the first chunk `tag` of the RIFF file `riff`.
///
/// Returns `None` if no chunk has the tag. A body that ends after the end of `riff` is cut at the
/// end of `riff`, because a WEM `data` size can count bytes that a package entry does not hold.
fn riff_chunk<'a>(riff: &'a [u8], tag: &[u8; 4]) -> Option<&'a [u8]> {
    let mut offset = RIFF_HEADER_LEN;
    while let Some((header, rest)) = riff.get(offset..)?.split_first_chunk::<8>() {
        let size = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
        if &header[..4] == tag {
            return Some(&rest[..size.min(rest.len())]);
        }

        offset = offset.checked_add(8 + size + (size & 1))?;
    }
    None
}

/// The length of the RIFF header: `RIFF`, the size and `WAVE`.
const RIFF_HEADER_LEN: usize = 12;

/// The length of a PCM `fmt ` body: tag, channels, rate, byte rate, block align and bit depth.
const PCM_FMT_LEN: usize = 16;

/// The length of the header of a WAV file with a 16-byte `fmt ` chunk.
const WAV_HEADER_LEN: u32 = 44;
