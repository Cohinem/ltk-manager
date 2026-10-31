//! The files of a list of bank units, opened through a fake `AudioFiles`.

mod common;

use common::{FakeFiles, fixture};
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{BankContent, BankSet, BankUnit};

const EVENTS: &str = "ASSETS/Sounds/Wwise2016/SFX/Shared/Map22_events.bnk";
const MEDIA: &str = "ASSETS/Sounds/Wwise2016/SFX/Shared/Map22_audio.bnk";
const PACKAGE: &str = "ASSETS/Sounds/Wwise2016/SFX/Shared/Map22_audio.wpk";
const VO_PACKAGE: &str = "ASSETS/Sounds/Wwise2016/VO/en_US/Shared/Map22_VO_audio.wpk";

fn unit(paths: &[&str], voice_over: bool) -> BankUnit {
    BankUnit {
        name: "Map22".to_owned(),
        bank_path: paths.iter().map(|&path| path.to_owned()).collect(),
        events: Vec::new(),
        voice_over,
    }
}

fn kinds(set: &BankSet) -> Vec<(&str, &'static str)> {
    set.files()
        .iter()
        .map(|file| {
            let kind = match file.content() {
                BankContent::Bank { .. } => "bank",
                BankContent::Package { .. } => "package",
                BankContent::Missing => "missing",
                BankContent::Failed { .. } => "failed",
            };
            (file.path(), kind)
        })
        .collect()
}

#[test]
fn open_reads_banks_and_mounts_packages_in_unit_order() {
    let files = FakeFiles::default()
        .with_fixture(EVENTS, "events_v145.bnk")
        .with_fixture(MEDIA, "media_v145.bnk")
        .with_fixture(PACKAGE, "package.wpk");
    let units = [unit(&[EVENTS, MEDIA], false), unit(&[PACKAGE], false)];

    let set = BankSet::open(&units, &files, None);

    assert_eq!(
        kinds(&set),
        [(EVENTS, "bank"), (MEDIA, "bank"), (PACKAGE, "package")]
    );
    assert_eq!(
        set.files()
            .iter()
            .map(|file| file.unit())
            .collect::<Vec<_>>(),
        [0, 0, 1]
    );
    let BankContent::Package { entries, .. } = set.files()[2].content() else {
        unreachable!();
    };
    assert_eq!(entries.len(), 2);
    assert_eq!(
        set.files()[0].asset(),
        Some(&AssetRef::File {
            path: EVENTS.to_lowercase()
        })
    );
}

#[test]
fn open_keeps_missing_file_with_its_path() {
    let files = FakeFiles::default().with_fixture(MEDIA, "media_v145.bnk");

    let set = BankSet::open(&[unit(&[EVENTS, MEDIA], false)], &files, None);

    assert_eq!(kinds(&set), [(EVENTS, "missing"), (MEDIA, "bank")]);
    assert_eq!(set.files()[0].asset(), None);
}

#[test]
fn open_keeps_failed_bank_with_its_message_and_reads_the_rest() {
    let truncated = fixture("events_v145.bnk")[..100].to_vec();
    let files = FakeFiles::default()
        .with(EVENTS, truncated)
        .with_fixture(MEDIA, "media_v145.bnk");

    let set = BankSet::open(&[unit(&[EVENTS, MEDIA], false)], &files, None);

    assert_eq!(kinds(&set), [(EVENTS, "failed"), (MEDIA, "bank")]);
    let BankContent::Failed { message } = set.files()[0].content() else {
        unreachable!();
    };
    assert!(
        message.contains("ends after the end of the bank"),
        "{message}"
    );
    assert!(set.files()[0].asset().is_some());
}

#[test]
fn open_reads_voice_over_path_under_client_locale() {
    let localized = "ASSETS/Sounds/Wwise2016/VO/ko_KR/Shared/Map22_VO_audio.wpk";
    let files = FakeFiles::default()
        .with_fixture(VO_PACKAGE, "package.wpk")
        .with_fixture(localized, "package.wpk");

    let set = BankSet::open(&[unit(&[VO_PACKAGE], true)], &files, Some("ko_kr"));

    assert_eq!(kinds(&set), [(localized, "package")]);
}

#[test]
fn open_falls_back_to_voice_over_path_as_written() {
    let files = FakeFiles::default().with_fixture(VO_PACKAGE, "package.wpk");

    let set = BankSet::open(&[unit(&[VO_PACKAGE], true)], &files, Some("ko_kr"));

    assert_eq!(kinds(&set), [(VO_PACKAGE, "package")]);
}

#[test]
fn open_falls_back_to_voice_over_path_as_written_on_localized_read_error() {
    let localized = "ASSETS/Sounds/Wwise2016/VO/ko_KR/Shared/Map22_VO_audio.wpk";
    let files = FakeFiles::default()
        .failing(localized)
        .with_fixture(VO_PACKAGE, "package.wpk");

    let set = BankSet::open(&[unit(&[VO_PACKAGE], true)], &files, Some("ko_kr"));

    assert_eq!(kinds(&set), [(VO_PACKAGE, "package")]);
}

#[test]
fn open_keeps_failed_voice_over_file_if_path_as_written_fails_too() {
    let files = FakeFiles::default().failing(VO_PACKAGE);

    let set = BankSet::open(&[unit(&[VO_PACKAGE], true)], &files, Some("ko_kr"));

    assert_eq!(kinds(&set), [(VO_PACKAGE, "failed")]);
}

#[test]
fn open_reads_path_as_written_if_unit_is_not_voice_over() {
    let localized = "ASSETS/Sounds/Wwise2016/VO/ko_KR/Shared/Map22_VO_audio.wpk";
    let files = FakeFiles::default()
        .with_fixture(VO_PACKAGE, "package.wpk")
        .with_fixture(localized, "package.wpk");

    let set = BankSet::open(&[unit(&[VO_PACKAGE], false)], &files, Some("ko_kr"));

    assert_eq!(kinds(&set), [(VO_PACKAGE, "package")]);
}
