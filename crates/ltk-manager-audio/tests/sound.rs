//! One media of a package, a media bank or a WEM, decoded through the public surface.

mod common;

use common::{bank, fixture, packaged, packaged_sources};
use ltk_manager_audio::{AudioFormat, SoundError, sound};
use ltk_wwise::SourceId;

#[test]
fn sound_decodes_media_of_package() {
    let source = packaged_sources()[1];

    let decoded = sound(&fixture("package.wpk"), source).unwrap();

    assert_eq!(decoded.format, AudioFormat::Ogg);
    assert_eq!(&decoded.bytes[..4], b"OggS");
}

#[test]
fn sound_decodes_media_of_media_bank() {
    let media = bank("media_v145.bnk");
    let (source, _) = media.media().unwrap().iter().next().unwrap();

    let decoded = sound(&fixture("media_v145.bnk"), source).unwrap();

    assert_eq!(&decoded.bytes[..4], b"OggS");
}

#[test]
fn sound_fails_with_no_media_if_package_lacks_source() {
    let error = sound(&fixture("package.wpk"), SourceId(12345)).unwrap_err();

    assert!(
        matches!(error, SoundError::NoMedia { source_id } if source_id == SourceId(12345)),
        "{error:?}"
    );
}

#[test]
fn sound_fails_with_no_media_if_bank_lacks_source() {
    let error = sound(&fixture("events_v145.bnk"), SourceId(12345)).unwrap_err();

    assert!(matches!(error, SoundError::NoMedia { .. }), "{error:?}");
}

#[test]
fn sound_of_wem_ignores_source() {
    let wem = packaged(packaged_sources()[0].0);

    let decoded = sound(&wem, SourceId(1)).unwrap();

    assert_eq!(decoded.format, AudioFormat::Ogg);
}

#[test]
fn sound_fails_with_not_audio_for_other_file() {
    let error = sound(b"PROP\x03\x00\x00\x00", SourceId(1)).unwrap_err();

    assert!(matches!(error, SoundError::NotAudio), "{error:?}");
}

#[test]
fn sound_fails_with_decode_error_for_undecodable_media() {
    let mut wem = packaged(packaged_sources()[0].0);
    wem[20..22].copy_from_slice(&0x3040u16.to_le_bytes());

    let error = sound(&wem, SourceId(1)).unwrap_err();

    assert!(matches!(error, SoundError::Decode(_)), "{error:?}");
}
