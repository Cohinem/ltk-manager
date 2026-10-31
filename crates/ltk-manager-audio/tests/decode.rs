//! WEM decoding through the public surface.

mod common;

use common::{packaged, packaged_sources};
use ltk_manager_audio::{AudioFormat, DecodeFailure, decode};
use ltk_wwise::{SourceId, wem::WemInfo};

/// Returns the granule position of the last Ogg page of `ogg`: the sample count of the stream.
fn last_granule(ogg: &[u8]) -> u64 {
    let mut offset = 0;
    let mut granule = 0;
    while offset + 27 <= ogg.len() {
        assert_eq!(&ogg[offset..offset + 4], b"OggS", "page at {offset}");
        granule = u64::from_le_bytes(ogg[offset + 6..offset + 14].try_into().unwrap());
        let segments = usize::from(ogg[offset + 26]);
        let table = &ogg[offset + 27..offset + 27 + segments];
        let body: usize = table.iter().map(|&len| usize::from(len)).sum();
        offset += 27 + segments + body;
    }
    granule
}

#[test]
fn decode_converts_packaged_vorbis_to_ogg_of_its_duration() {
    for source in packaged_sources() {
        let wem = packaged(source.0);
        let info = WemInfo::from_bytes(&wem).unwrap();

        let decoded = decode(source, &wem).unwrap();

        assert_eq!(decoded.format, AudioFormat::Ogg);
        assert_eq!(decoded.format.mime(), "audio/ogg");
        assert_eq!(&decoded.bytes[..4], b"OggS");

        let samples = last_granule(&decoded.bytes);
        let expected = info.duration().unwrap().as_secs_f64() * f64::from(info.sample_rate);
        /* One long block of Wwise Vorbis is at most 2048 samples. */
        let delta = (samples as f64 - expected).abs();
        assert!(
            delta <= 2048.0,
            "media {source}: {samples} samples, {expected} expected"
        );
    }
}

/* More than a tenth of the samples of its first packets sit at `i16::MAX` or `i16::MIN`, which
the `ww2ogg` validator rejects as a wrong codebook. */
#[test]
fn decode_converts_vorbis_that_clips() {
    let wem = common::fixture("clipped_vorbis.wem");

    let decoded = decode(SourceId(127_311), &wem).unwrap();

    assert_eq!(&decoded.bytes[..4], b"OggS");
}

#[test]
fn decode_reports_source_of_truncated_wem() {
    let source = packaged_sources()[0];
    let wem = packaged(source.0);

    let error = decode(source, &wem[..wem.len() / 2]).unwrap_err();

    assert_eq!(error.source_id, source);
    assert!(error.to_string().contains(&source.to_string()), "{error}");
}

#[test]
fn decode_rejects_adpcm_with_its_codec() {
    let mut wem = packaged(packaged_sources()[0].0);
    /* `wFormatTag` is the first field of `fmt `, at byte 20 of a WEM. */
    wem[20..22].copy_from_slice(&0x0002u16.to_le_bytes());

    let error = decode(SourceId(7), &wem).unwrap_err();

    assert!(
        matches!(error.reason, DecodeFailure::Codec(codec) if codec.0 == 2),
        "{error:?}"
    );
    assert!(error.to_string().contains("0x0002"), "{error}");
}

#[test]
fn decode_rewrites_pcm_as_plain_wav() {
    let samples: Vec<u8> = (0..400u16).flat_map(|s| s.to_le_bytes()).collect();
    let mut fmt = Vec::new();
    for field in [1u16, 1] {
        fmt.extend_from_slice(&field.to_le_bytes());
    }
    fmt.extend_from_slice(&8000u32.to_le_bytes());
    fmt.extend_from_slice(&16000u32.to_le_bytes());
    fmt.extend_from_slice(&2u16.to_le_bytes());
    fmt.extend_from_slice(&16u16.to_le_bytes());
    /* Wwise writes extra bytes after the 16 of a PCM `fmt `. */
    fmt.extend_from_slice(&[0, 0, 0xAA, 0xBB, 0xCC, 0xDD, 0, 0]);
    let mut body = b"WAVE".to_vec();
    for (tag, data) in [
        (b"fmt ", &fmt[..]),
        (b"JUNK", &[0; 4][..]),
        (b"data", &samples[..]),
    ] {
        body.extend_from_slice(tag);
        body.extend_from_slice(&(data.len() as u32).to_le_bytes());
        body.extend_from_slice(data);
    }
    let mut wem = b"RIFF".to_vec();
    wem.extend_from_slice(&(body.len() as u32).to_le_bytes());
    wem.extend_from_slice(&body);

    let decoded = decode(SourceId(1), &wem).unwrap();

    assert_eq!(decoded.format, AudioFormat::Wav);
    assert_eq!(decoded.format.mime(), "audio/wav");
    assert_eq!(decoded.bytes.len(), 44 + samples.len());
    assert_eq!(&decoded.bytes[..4], b"RIFF");
    assert_eq!(&decoded.bytes[8..16], b"WAVEfmt ");
    assert_eq!(
        u32::from_le_bytes(decoded.bytes[16..20].try_into().unwrap()),
        16
    );
    assert_eq!(&decoded.bytes[20..36], &fmt[..16]);
    assert_eq!(&decoded.bytes[36..40], b"data");
    assert_eq!(&decoded.bytes[44..], &samples[..]);
}
