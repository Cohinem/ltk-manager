//! The header facts of a package, a bank or a WEM, through the public surface.

mod common;

use common::{fixture, packaged};
use ltk_manager_assets::preview::{AudioContainer, AudioInfo, BankFacts};
use ltk_manager_audio::audio_info;

#[test]
fn audio_info_counts_media_of_package() {
    let info = audio_info("map22_audio.wpk", &fixture("package.wpk")).unwrap();

    assert_eq!(
        info,
        AudioInfo {
            container: AudioContainer::Package,
            size_bytes: 6910,
            media_count: 2,
            bank: None,
            failure: None,
        }
    );
}

#[test]
fn audio_info_reports_header_facts_of_media_bank() {
    let info = audio_info("sett_base_sfx_audio.bnk", &fixture("media_v145.bnk")).unwrap();

    assert_eq!(info.container, AudioContainer::Bank);
    assert_eq!(info.media_count, 1);
    assert_eq!(
        info.bank,
        Some(BankFacts {
            version: 145,
            bank_type: 0,
            alignment: 16,
            header_id: 0x2c53_111e,
            name_id: Some(0xe9b7_0b40),
            rejection: None,
            event_count: None,
        })
    );
}

#[test]
fn audio_info_reports_rejection_of_legacy_event_bank() {
    let info = audio_info("map22_events.bnk", &fixture("events_v134.bnk")).unwrap();

    let bank = info.bank.unwrap();
    assert_eq!(bank.version, 134);
    assert_eq!(
        bank.rejection.as_deref(),
        Some("legacy bank version 134 has a HIRC chunk")
    );
}

#[test]
fn audio_info_counts_events_of_hierarchy() {
    let info = audio_info("map22_events.bnk", &fixture("events_v145.bnk")).unwrap();

    assert_eq!(info.media_count, 0);
    assert_eq!(info.bank.unwrap().event_count, Some(3));
}

#[test]
fn audio_info_reads_nameless_chunk_from_its_magic() {
    let info = audio_info("27e235d8d6599498", &fixture("media_v134.bnk")).unwrap();

    let bank = info.bank.unwrap();
    assert_eq!(bank.header_id, 0x351b_afb9);
    assert_eq!(bank.alignment, 0);
    assert_eq!(bank.name_id, None);
}

#[test]
fn audio_info_counts_wem_as_one_media() {
    let info = audio_info("vo.wem", &packaged(380_333_190)).unwrap();

    assert_eq!(info.container, AudioContainer::Media);
    assert_eq!(info.media_count, 1);
    assert_eq!(info.bank, None);
}

#[test]
fn audio_info_reports_read_failure_of_named_bank() {
    let mut bank = fixture("media_v145.bnk");
    bank.truncate(60);

    let info = audio_info("broken_audio.bnk", &bank).unwrap();

    assert_eq!(info.bank, None);
    assert_eq!(info.media_count, 0);
    let failure = info.failure.unwrap();
    assert!(failure.contains("offset 52"), "{failure}");
}

#[test]
fn audio_info_skips_file_of_other_kind() {
    assert_eq!(audio_info("icon.png", &fixture("package.wpk")), None);
    assert_eq!(
        audio_info("0123456789abcdef", b"PROP\x03\x00\x00\x00"),
        None
    );
}
