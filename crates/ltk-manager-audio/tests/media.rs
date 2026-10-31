//! The media table of a package, a media bank or a WEM, through the public surface.

mod common;

use common::{fixture, packaged};
use ltk_manager_audio::{MediaError, Playback, media, media_rows};
use ltk_wwise::{Bank, MediaIndex, SourceId};

/// The `wFormatTag` of Wwise Vorbis.
const VORBIS: u16 = 0xFFFF;

#[test]
fn media_rows_list_package_entries_in_file_order() {
    let rows = media_rows(&fixture("package.wpk")).unwrap();

    let sources: Vec<u32> = rows.iter().map(|row| row.source_id).collect();
    let sizes: Vec<u32> = rows.iter().map(|row| row.size_bytes).collect();
    assert_eq!(sources, [380_333_190, 470_358_536]);
    assert_eq!(sizes, [2358, 4446]);
    for row in &rows {
        let format = row.format.as_ref().expect("a readable fmt chunk");
        assert_eq!(format.codec, VORBIS);
        assert_eq!(row.playback, Playback::Playable);
    }
}

#[test]
fn media_rows_list_bank_media_in_ascending_source_order() {
    let wem = packaged(380_333_190);
    let mut index = MediaIndex::new();
    index.insert(SourceId(900), wem.clone());
    index.insert(SourceId(7), wem.clone());
    let mut bytes = Vec::new();
    Bank::media_only("test_audio.bnk", index)
        .to_writer(&mut bytes)
        .unwrap();

    let rows = media_rows(&bytes).unwrap();

    let sources: Vec<u32> = rows.iter().map(|row| row.source_id).collect();
    assert_eq!(sources, [7, 900]);
    assert_eq!(rows[0].size_bytes, 2358);
}

#[test]
fn media_rows_read_media_bank_fixture() {
    let rows = media_rows(&fixture("media_v145.bnk")).unwrap();

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].source_id, 879_168_912);
    assert_eq!(rows[0].size_bytes, 570);
    assert_eq!(rows[0].format.as_ref().map(|f| f.codec), Some(VORBIS));
}

#[test]
fn media_rows_list_wem_as_one_row_of_source_zero() {
    let wem = packaged(470_358_536);

    let rows = media_rows(&wem).unwrap();

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].source_id, 0);
    assert_eq!(rows[0].size_bytes, 4446);
}

#[test]
fn media_rows_list_event_bank_as_empty() {
    assert!(media_rows(&fixture("events_v145.bnk")).unwrap().is_empty());
}

#[test]
fn media_rows_mark_codec_without_decoder_as_unsupported() {
    let mut wem = packaged(380_333_190);
    wem[20..22].copy_from_slice(&0x3040u16.to_le_bytes());

    let rows = media_rows(&wem).unwrap();

    assert_eq!(rows[0].format.as_ref().map(|f| f.codec), Some(0x3040));
    assert_eq!(rows[0].playback, Playback::UnsupportedCodec);
}

#[test]
fn media_rows_keep_unreadable_media_with_its_reason() {
    let mut index = MediaIndex::new();
    index.insert(SourceId(5), b"not a wem".to_vec());
    let mut bytes = Vec::new();
    Bank::media_only("test_audio.bnk", index)
        .to_writer(&mut bytes)
        .unwrap();

    let rows = media_rows(&bytes).unwrap();

    assert_eq!(rows[0].source_id, 5);
    assert_eq!(rows[0].format, None);
    assert!(
        matches!(&rows[0].playback, Playback::Unreadable { message } if message.contains("RIFF")),
        "{:?}",
        rows[0].playback
    );
}

#[test]
fn media_rows_fail_with_not_audio_for_other_file() {
    let error = media_rows(b"PROP\x03\x00\x00\x00").unwrap_err();

    assert!(matches!(error, MediaError::NotAudio), "{error:?}");
}

#[test]
fn media_rows_fail_with_read_error_for_truncated_package() {
    let package = fixture("package.wpk");

    let error = media_rows(&package[..40]).unwrap_err();

    assert!(matches!(error, MediaError::Read(_)), "{error:?}");
}

#[test]
fn media_returns_original_bytes_of_packaged_source() {
    let package = fixture("package.wpk");

    let bytes = media(&package, SourceId(470_358_536)).unwrap();

    assert_eq!(&*bytes, packaged(470_358_536).as_slice());
}
