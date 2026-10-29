//! Unit tests for what the reader would refuse, for the two refusals that keep
//! the rule from firing on banks that load, and for the guard on its removal.

use std::sync::Arc;

use fs_err as fs;
use ltk_hash::BinHash;
use ltk_manager_base::hashing::named;
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject, PropertyValueEnum};

use super::*;
use crate::ProjectFiles;
use crate::game::FakeContent;
use crate::{AlternativeCaveat, ChosenAlternative, FixAlternative};
use ltk_manager_assets::test_util::{
    BUILT_BANK_ID, LEGACY_EVENT_BANK, audio_bank_bytes, make_packed_chunk_fantome_zip,
    resolver_naming,
};
use ltk_manager_audio::ltk_wwise::bank::{BankHeader, RawSection, Section};
use ltk_manager_audio::ltk_wwise::hierarchy::{Object, ObjectKind};
use ltk_manager_audio::ltk_wwise::{BankId, Hierarchy, MediaIndex, SourceId};
use ltk_manager_base::budget::Budget;
use ltk_manager_base::config::Config;

/// The bank's path inside the WAD, which is what a bank unit names it by.
const BANK_IN_WAD: &str = "assets/sounds/wwise2016/sfx/ashe_sfx_events.bnk";

/// The same bank as the layer lists it, under the WAD directory it sits in.
const BANK_IN_LAYER: &str = "Aatrox.wad.client/assets/sounds/wwise2016/sfx/ashe_sfx_events.bnk";

/// Where the fixture's skin bin sits.
const BIN_IN_LAYER: &str = "Aatrox.wad.client/data/characters/ashe/skins/skin0.bin";

/// The version most legacy banks in the wild carry.
const LEGACY: BankVersion = BankVersion::V134;

/// The oldest version the game's reader reads.
const FLOOR: BankVersion = BankVersion(118);

/* The bin shape a request for a bank travels in. Written out here rather than
read from the rule, so a wrong constant there fails rather than agrees. */

const SKIN_AUDIO: BinHash = named("SkinAudioProperties");
/// `bankUnits` on it.
const BANK_UNITS: BinHash = named("bankUnits");
const UNIT: BinHash = named("BankUnit");
/// `bankPath` on it.
const UNIT_PATH: BinHash = named("bankPath");
/// The object the fixture hangs its audio properties on.
const ENTRY: BinHash = BinHash(0x1234_5678);

/// A bank at `version` holding `sections`.
fn bank(version: BankVersion, sections: Vec<Section>) -> Vec<u8> {
    let mut bank = Bank::new(BankHeader::new(version, BankId(BUILT_BANK_ID)));
    *bank.sections_mut() = sections;
    audio_bank_bytes(&bank)
}

/// An empty hierarchy, the section that carries events and sounds.
fn hierarchy() -> Section {
    Section::Hierarchy(Hierarchy::new())
}

/// A media index holding one media of `len` zero bytes.
fn media(len: usize) -> Section {
    let mut media = MediaIndex::new();
    media.insert(SourceId(1), vec![0; len]);
    Section::Media(media)
}

/// A skin bin whose one bank unit asks for `paths`.
fn bin_asking_for(paths: &[&str]) -> Vec<u8> {
    let unit = values::Struct {
        class_hash: UNIT,
        properties: [(
            UNIT_PATH,
            PropertyValueEnum::Container(
                paths
                    .iter()
                    .map(|path| values::String::new((*path).to_owned()))
                    .collect(),
            ),
        )]
        .into_iter()
        .collect(),
    };

    let bin = Bin::new(
        [BinObject::builder(ENTRY, SKIN_AUDIO)
            .property(
                BANK_UNITS,
                PropertyValueEnum::Container(vec![values::Embedded(unit)].into()),
            )
            .build()],
        std::iter::empty::<&str>(),
    );

    let mut out = std::io::Cursor::new(Vec::new());
    bin.to_writer(&mut out).unwrap();
    out.into_inner()
}

fn place(root: &std::path::Path, at: &str, bytes: &[u8]) {
    let path = root
        .join("content")
        .join("base")
        .join(at.replace('/', std::path::MAIN_SEPARATOR_STR));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, bytes).unwrap();
}

/// A project holding one `.bnk`, and nothing that asks for it.
fn project(bytes: &[u8]) -> (tempfile::TempDir, ProjectFiles) {
    project_with(bytes, &[], None)
}

/// A project holding one `.bnk`, a bin whose bank unit names `asked`, and an
/// install to ask about it.
fn project_with(
    bytes: &[u8],
    asked: &[&str],
    game: Option<Arc<dyn GameContent>>,
) -> (tempfile::TempDir, ProjectFiles) {
    let tmp = tempfile::tempdir().unwrap();
    place(tmp.path(), BANK_IN_LAYER, bytes);
    if !asked.is_empty() {
        place(tmp.path(), BIN_IN_LAYER, &bin_asking_for(asked));
    }

    let files = ProjectFiles::read(tmp.path(), &Config::default(), game).unwrap();
    (tmp, files)
}

fn found_in(files: &ProjectFiles) -> Vec<Problem> {
    let (problems, failed) = files.report(&[&AudioBankVersion::new()]).finish();
    assert!(
        failed.is_empty(),
        "the fixture should read cleanly: {failed:?}"
    );
    problems
}

fn found(bytes: &[u8]) -> Vec<Problem> {
    let (_tmp, files) = project(bytes);
    found_in(&files)
}

/// A bank the reader refuses, in the shape the whole check exists for.
fn silent_bank() -> Vec<u8> {
    bank(LEGACY, vec![hierarchy()])
}

// ---- what the reader refuses ---------------------------------------------

/// The class the whole check exists for: an events bank at a legacy version,
/// which the game drops without a word so the mod is silent.
#[test]
fn a_legacy_bank_carrying_its_hierarchy_is_reported() {
    let problems = found(&silent_bank());

    assert_eq!(problems.len(), 1);
    let problem = &problems[0];
    assert_eq!(problem.rule, ID);
    assert_eq!(problem.severity, ProblemSeverity::Warning);
    assert_eq!(problem.site.layer, "base");
    assert_eq!(problem.site.path, BANK_IN_LAYER);

    let message = problem.message.as_deref().unwrap_or_default();
    assert!(message.contains("134"), "{message}");
    assert!(message.contains("without a word"), "{message}");
}

/// The refusal that keeps the rule off the majority of legacy banks. Reporting
/// on the version alone would call every one of these broken, and the game
/// itself ships hundreds.
#[test]
fn a_legacy_bank_carrying_only_its_media_reports_nothing() {
    assert!(found(&bank(LEGACY, vec![media(512)])).is_empty());
}

/// A legacy bank holding nothing past its header loads too, because the reader
/// consumes the header before the loop that judges the rest.
#[test]
fn a_legacy_bank_that_is_only_a_header_reports_nothing() {
    assert!(found(&bank(LEGACY, Vec::new())).is_empty());
}

#[test]
fn a_bank_at_the_version_the_reader_takes_as_current_reports_nothing() {
    assert!(found(&bank(BankVersion::CURRENT, vec![hierarchy()])).is_empty());
}

/// The one-sided predicate. A bank above the version written down here is a
/// bank authored after it was written down, and calling that defective is the
/// false positive the whole check exists to avoid.
#[test]
fn a_bank_newer_than_the_version_written_down_reports_nothing() {
    assert!(found(&bank(BankVersion(146), vec![hierarchy()])).is_empty());
    assert!(found(&bank(BankVersion(185), vec![hierarchy()])).is_empty());
}

/// Below the floor the reader refuses whatever the bank carries, so the media
/// shape that saves a legacy bank does not save this one.
#[test]
fn a_bank_below_the_floor_is_reported_whatever_it_carries() {
    let problems = found(&bank(BankVersion(117), vec![media(512)]));

    assert_eq!(problems.len(), 1);
    let message = problems[0].message.as_deref().unwrap_or_default();
    assert!(message.contains("older than"), "{message}");
}

#[test]
fn a_bank_at_the_floor_carrying_only_media_reports_nothing() {
    assert!(found(&bank(FLOOR, vec![media(512)])).is_empty());
}

/// A bank whose chunks do not line up is one the client fails to read too, so the rule
/// reports it with the reader's error rather than saying nothing.
#[test]
fn a_bank_whose_chunks_do_not_line_up_is_reported() {
    let mut bytes = bank(LEGACY, vec![media(24)]);
    bytes.extend_from_slice(&[0u8; 10]);

    let problems = found(&bytes);

    assert_eq!(problems.len(), 1);
    let message = problems[0].message.as_deref().unwrap_or_default();
    assert!(message.contains("cannot read"), "{message}");
}

/// A chunk beyond the media is what the reader refuses at a legacy version, whatever its
/// tag.
#[test]
fn a_legacy_bank_holding_a_chunk_beyond_its_media_is_reported() {
    let problems = found(&bank(
        LEGACY,
        vec![Section::Raw(RawSection {
            tag: *b"ZZZZ",
            data: vec![0; 16],
        })],
    ));

    assert_eq!(problems.len(), 1);
    let message = problems[0].message.as_deref().unwrap_or_default();
    assert!(message.contains("ZZZZ"), "{message}");
}

/// Story 13: the 18 version 125 banks of the corpus fail to read in the client and in
/// `ltk_wwise` alike, with a chunk that runs past the end of the file.
#[test]
fn a_version_125_bank_the_reader_cannot_read_is_reported_with_removal() {
    let mut bytes = bank(BankVersion::V125, Vec::new());
    bytes.extend_from_slice(b"HIRC");
    bytes.extend_from_slice(&64u32.to_le_bytes());
    let (_tmp, files) = project_with(&bytes, &[], Some(FakeContent::empty()));

    let problems = found_in(&files);

    assert_eq!(problems.len(), 1);
    let message = problems[0].message.as_deref().unwrap_or_default();
    assert!(
        message.contains("ends after the end of the bank"),
        "{message}"
    );
    assert!(problems[0].fix.is_some(), "removal is offered");
    assert!(
        problems[0].alternatives.is_empty(),
        "{:?}",
        problems[0].alternatives
    );
}

/// The shape the bounded read does not resolve: the hierarchy sits behind a
/// media blob larger than the prefix, so the chunk list runs past it and only
/// the whole file says what is there.
#[test]
fn a_hierarchy_behind_a_large_media_blob_is_still_reported() {
    let problems = found(&bank(LEGACY, vec![media(32 * 1024), hierarchy()]));

    assert_eq!(problems.len(), 1);
}

/// The same bank without the hierarchy, which is the read the arithmetic
/// answers: the media blob runs to the end of the file, so nothing follows it
/// and no byte of it is ever read.
#[test]
fn a_large_media_only_bank_reports_nothing() {
    assert!(found(&bank(LEGACY, vec![media(32 * 1024)])).is_empty());
}

/// A file named `.bnk` that is not one is a rule failure rather than silence,
/// because the check could not do what it was asked rather than deciding.
#[test]
fn a_file_that_is_not_a_bank_is_reported_as_a_failure() {
    let (_tmp, files) = project(b"not a bank at all, whatever it is named");

    let (problems, failed) = files.report(&[&AudioBankVersion::new()]).finish();

    assert!(problems.is_empty());
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0].rule, ID);
}

// ---- reading both layer sources ------------------------------------------

/// Story: the check that reads an unpacked mod reads a packed one the same
/// way, because both go through the one handle.
#[test]
fn an_archive_reports_what_its_tree_reports() {
    let bytes = silent_bank();
    let (_tmp, tree) = project(&bytes);

    let archive_dir = tempfile::tempdir().unwrap();
    let archive = archive_dir.path().join("silent.fantome");
    make_packed_chunk_fantome_zip(&archive, "Silent", BANK_IN_WAD, &bytes);
    let packed = ProjectFiles::in_archive(
        &archive,
        &Config::default(),
        Budget::repair(),
        &resolver_naming(&[BANK_IN_WAD]),
        None,
    )
    .unwrap();

    let in_tree = found_in(&tree);
    let in_archive = found_in(&packed);

    assert_eq!(in_tree.len(), 1);
    assert_eq!(in_archive.len(), 1);
    assert_eq!(in_archive[0].severity, in_tree[0].severity);
    assert_eq!(in_archive[0].message, in_tree[0].message);
    assert_eq!(in_archive[0].site.path, BANK_IN_LAYER);
}

/// The same, for the shape that has to fall back to the whole file.
#[test]
fn an_archive_falls_back_to_the_whole_chunk_the_same_way_a_tree_does() {
    let bytes = bank(LEGACY, vec![media(32 * 1024), hierarchy()]);

    let archive_dir = tempfile::tempdir().unwrap();
    let archive = archive_dir.path().join("behind-media.fantome");
    make_packed_chunk_fantome_zip(&archive, "Behind Media", BANK_IN_WAD, &bytes);
    let packed = ProjectFiles::in_archive(
        &archive,
        &Config::default(),
        Budget::repair(),
        &resolver_naming(&[BANK_IN_WAD]),
        None,
    )
    .unwrap();

    assert_eq!(found_in(&packed).len(), 1);
}

// ---- the guard on removal -------------------------------------------------

/// The first row of the guard, and 15 of the 17 banks measured: the install
/// holds one at the same path, so its own answers the request.
#[test]
fn a_bank_the_install_holds_is_offered_for_removal() {
    let (_tmp, files) = project_with(
        &silent_bank(),
        &[BANK_IN_WAD],
        Some(FakeContent::containing(&[BANK_IN_WAD])),
    );

    let problems = found_in(&files);
    let fix = problems[0].fix.as_ref().expect("the game answers for it");
    let note = fix.note.as_deref().unwrap_or_default();
    assert!(note.contains("your game's own bank"), "{note}");
}

/// The second row, and the two banks measured that must not be removed:
/// something asks and nothing would answer, which trades silence for a crash.
#[test]
fn a_bank_a_unit_asks_for_that_the_install_lacks_is_refused() {
    let (_tmp, files) = project_with(&silent_bank(), &[BANK_IN_WAD], Some(FakeContent::empty()));

    let problems = found_in(&files);
    assert_eq!(problems[0].fix, None);
    let message = problems[0].message.as_deref().unwrap_or_default();
    assert!(message.contains(UNANSWERED_CODE), "{message}");
}

/// The third row: nothing asks, so removing it leaves nothing unanswered
/// whatever the install holds.
#[test]
fn a_bank_nothing_asks_for_is_offered_for_removal() {
    let (_tmp, files) = project_with(&silent_bank(), &[], Some(FakeContent::empty()));

    let problems = found_in(&files);
    let fix = problems[0].fix.as_ref().expect("nobody asks for it");
    let note = fix.note.as_deref().unwrap_or_default();
    assert!(note.contains("Nothing in the mod asks"), "{note}");
}

/// A bank unit naming a different file is not a request for this one.
#[test]
fn a_unit_asking_for_something_else_does_not_hold_the_bank_back() {
    let (_tmp, files) = project_with(
        &silent_bank(),
        &["assets/sounds/wwise2016/sfx/somebody_else.bnk"],
        Some(FakeContent::empty()),
    );

    assert!(found_in(&files)[0].fix.is_some());
}

/// The question the guard asks is about the install, so a machine with none
/// gets the honest answer rather than a guess.
#[test]
fn no_install_means_no_removal_is_offered() {
    let (_tmp, files) = project_with(&silent_bank(), &[], None);

    let problems = found_in(&files);
    assert_eq!(problems[0].fix, None);
    let message = problems[0].message.as_deref().unwrap_or_default();
    assert!(message.contains("no League install"), "{message}");
}

// ---- the repair -----------------------------------------------------------

fn fix_run(root: &std::path::Path, game: Option<Arc<dyn GameContent>>) -> FixRun<'static> {
    FixRun::open(root, Vec::new(), None, Config::default(), game)
}

#[test]
fn the_repair_deletes_the_bank_and_leaves_the_rest_alone() {
    let game = FakeContent::containing(&[BANK_IN_WAD]);
    let (tmp, files) = project_with(&silent_bank(), &[BANK_IN_WAD], Some(Arc::clone(&game)));
    let problems = found_in(&files);
    let chosen: Vec<&Problem> = problems.iter().collect();

    let mut run = fix_run(tmp.path(), Some(game));
    let applied = AudioBankVersion::new().fix(&chosen, &mut run).unwrap();
    let report = run.finish().unwrap();

    assert_eq!(
        applied,
        Applied {
            applied: 1,
            skipped: 0
        }
    );
    let layer = tmp.path().join("content").join("base");
    assert!(
        !layer
            .join(BANK_IN_LAYER.replace('/', std::path::MAIN_SEPARATOR_STR))
            .exists(),
        "the bank is still there"
    );
    assert!(
        layer
            .join(BIN_IN_LAYER.replace('/', std::path::MAIN_SEPARATOR_STR))
            .exists(),
        "the repair took the bin with it"
    );
    assert_eq!(report.files.len(), 1);
    assert_eq!(report.files[0].change, crate::FileChange::Removed);
}

/// The guard is re-derived rather than replayed, so a repair chosen while the
/// install held the path does nothing once it does not.
#[test]
fn the_repair_refuses_where_the_guard_no_longer_holds() {
    let (tmp, files) = project_with(
        &silent_bank(),
        &[BANK_IN_WAD],
        Some(FakeContent::containing(&[BANK_IN_WAD])),
    );
    let problems = found_in(&files);
    let chosen: Vec<&Problem> = problems.iter().collect();

    let mut run = fix_run(tmp.path(), Some(FakeContent::empty()));
    let applied = AudioBankVersion::new().fix(&chosen, &mut run).unwrap();
    run.finish().unwrap();

    assert_eq!(
        applied,
        Applied {
            applied: 0,
            skipped: 1
        }
    );
    assert!(
        tmp.path()
            .join("content")
            .join("base")
            .join(BANK_IN_LAYER.replace('/', std::path::MAIN_SEPARATOR_STR))
            .exists()
    );
}

/// A repair offered twice applies once, because the second run finds no bank
/// to judge at all.
#[test]
fn a_second_repair_over_a_removed_bank_skips_it() {
    let game = FakeContent::containing(&[BANK_IN_WAD]);
    let (tmp, files) = project_with(&silent_bank(), &[], Some(Arc::clone(&game)));
    let problems = found_in(&files);
    let chosen: Vec<&Problem> = problems.iter().collect();

    let mut run = fix_run(tmp.path(), Some(Arc::clone(&game)));
    AudioBankVersion::new().fix(&chosen, &mut run).unwrap();
    run.finish().unwrap();

    let mut again = fix_run(tmp.path(), Some(game));
    let applied = AudioBankVersion::new().fix(&chosen, &mut again).unwrap();

    assert_eq!(applied.applied, 0);
    assert_eq!(applied.skipped, 1);
}

// ---- the conversion ---------------------------------------------------------

const EVENTS_V134: &[u8] = LEGACY_EVENT_BANK;

/// A version 134 event bank holding one music track, a kind `Bank::upgrade` refuses.
fn music_bank() -> Vec<u8> {
    let mut hierarchy = Hierarchy::new();
    hierarchy.push(
        Object::new(
            ObjectKind::MUSIC_TRACK,
            0x0BAD_F00Du32.to_le_bytes().to_vec(),
        )
        .unwrap(),
    );
    bank(LEGACY, vec![Section::Hierarchy(hierarchy)])
}

fn conversion_of(problem: &Problem) -> Option<&FixAlternative> {
    problem
        .alternatives
        .iter()
        .find(|alternative| alternative.id.as_str() == CONVERT)
}

/// Stories 1, 2 and 4: removal stays the repair, and conversion is offered beside it.
#[test]
fn a_legacy_event_bank_offers_removal_and_an_experimental_conversion() {
    let (_tmp, files) = project_with(
        EVENTS_V134,
        &[BANK_IN_WAD],
        Some(FakeContent::containing(&[BANK_IN_WAD])),
    );

    let problems = found_in(&files);

    assert_eq!(problems.len(), 1);
    assert!(problems[0].fix.is_some(), "removal is offered");
    let conversion = conversion_of(&problems[0]).expect("conversion is offered");
    assert!(conversion.experimental);
}

/// Story 7: the version 145 attenuation has a flag that the version 134 payload has no value
/// for, and the conversion writes it as zero.
#[test]
fn a_conversion_of_a_bank_containing_an_attenuation_states_the_lost_flag() {
    let (_tmp, files) = project_with(EVENTS_V134, &[], Some(FakeContent::empty()));

    let problems = found_in(&files);

    let conversion = conversion_of(&problems[0]).expect("conversion is offered");
    assert_eq!(
        conversion.caveats,
        [AlternativeCaveat::AttenuationFlagZeroed]
    );
    assert_eq!(conversion.fix.before.as_deref(), Some("134"));
    assert_eq!(conversion.fix.note, None);
}

#[test]
fn a_conversion_of_a_bank_without_an_attenuation_states_no_loss() {
    let (_tmp, files) = project_with(&silent_bank(), &[], Some(FakeContent::empty()));

    let problems = found_in(&files);

    let conversion = conversion_of(&problems[0]).expect("conversion is offered");
    assert!(conversion.caveats.is_empty(), "{:?}", conversion.caveats);
}

/// Story 6: the message of a bank that the conversion refuses states the reason.
#[test]
fn a_bank_holding_a_music_track_offers_removal_only_and_states_the_refusal() {
    let (_tmp, files) = project_with(&music_bank(), &[], Some(FakeContent::empty()));

    let problems = found_in(&files);

    assert!(problems[0].fix.is_some(), "removal is offered");
    assert!(
        problems[0].alternatives.is_empty(),
        "{:?}",
        problems[0].alternatives
    );
    let message = problems[0].message.as_deref().unwrap_or_default();
    assert!(message.contains("MusicTrack"), "{message}");
}

/// Story 5: a bank unit asks for the bank and the game does not hold its path, so removal
/// refuses and conversion is the only repair.
#[test]
fn conversion_is_the_only_repair_where_removal_refuses() {
    let (_tmp, files) = project_with(EVENTS_V134, &[BANK_IN_WAD], Some(FakeContent::empty()));

    let problems = found_in(&files);

    assert_eq!(problems[0].fix, None);
    assert!(conversion_of(&problems[0]).is_some());
}

fn convert(tmp: &tempfile::TempDir, problems: &[Problem]) -> Applied {
    let chosen: Vec<&Problem> = problems.iter().collect();
    let mut run = fix_run(tmp.path(), Some(FakeContent::empty()));
    let applied = AudioBankVersion::new()
        .fix_alternative(&AlternativeId::new(CONVERT), &chosen, &mut run)
        .unwrap();
    run.finish().unwrap();
    applied
}

fn bank_on_disk(tmp: &tempfile::TempDir) -> Vec<u8> {
    fs::read(
        tmp.path()
            .join("content")
            .join("base")
            .join(BANK_IN_LAYER.replace('/', std::path::MAIN_SEPARATOR_STR)),
    )
    .unwrap()
}

fn read_bank(bytes: &[u8]) -> Bank {
    Bank::from_reader(&mut std::io::Cursor::new(bytes)).unwrap()
}

/// The IDs of every event in `bank`.
fn event_ids(bank: &Bank) -> Vec<u32> {
    bank.hierarchy()
        .unwrap()
        .of_kind(ObjectKind::EVENT)
        .map(|event| event.id().0)
        .collect()
}

/// Stories 8 and 12: the converted bank reads back, passes the client's check and keeps
/// its event IDs.
#[test]
fn applying_the_conversion_writes_a_version_145_bank_that_keeps_its_events() {
    let (tmp, files) = project_with(EVENTS_V134, &[BANK_IN_WAD], Some(FakeContent::empty()));
    let problems = found_in(&files);

    let applied = convert(&tmp, &problems);

    assert_eq!(
        applied,
        Applied {
            applied: 1,
            skipped: 0
        }
    );
    let converted = read_bank(&bank_on_disk(&tmp));
    assert_eq!(converted.header().version, BankVersion::CURRENT);
    assert_eq!(converted.check(), Ok(()));
    let events = event_ids(&converted);
    assert!(!events.is_empty());
    assert_eq!(events, event_ids(&read_bank(EVENTS_V134)));
}

/// A bank with media beside its hierarchy gains header padding when it is written, and
/// the conversion still reads back.
#[test]
fn applying_the_conversion_to_a_bank_with_media_writes_a_bank_that_reads_back() {
    let bytes = bank(LEGACY, vec![hierarchy(), media(100)]);
    let (tmp, files) = project_with(&bytes, &[], Some(FakeContent::empty()));
    let problems = found_in(&files);

    assert_eq!(convert(&tmp, &problems).applied, 1);
    let converted = read_bank(&bank_on_disk(&tmp));
    assert_eq!(converted.check(), Ok(()));
    assert_eq!(
        converted.media().unwrap().get(SourceId(1)),
        Some(&[0u8; 100][..])
    );
}

/// Story 9: a conversion refused at the press leaves the mod untouched.
#[test]
fn a_refused_conversion_leaves_the_file_unchanged() {
    let (tmp, files) = project_with(EVENTS_V134, &[], Some(FakeContent::empty()));
    let problems = found_in(&files);
    place(tmp.path(), BANK_IN_LAYER, &music_bank());

    let applied = convert(&tmp, &problems);

    assert_eq!(applied.applied, 0);
    assert_eq!(applied.skipped, 1);
    assert_eq!(bank_on_disk(&tmp), music_bank());
}

/// Story 10: a bank the client accepts is never converted.
#[test]
fn a_bank_the_client_accepts_is_never_converted() {
    let (tmp, files) = project_with(EVENTS_V134, &[], Some(FakeContent::empty()));
    let problems = found_in(&files);
    let accepted = bank(LEGACY, vec![media(64)]);
    place(tmp.path(), BANK_IN_LAYER, &accepted);

    assert_eq!(convert(&tmp, &problems).applied, 0);
    assert_eq!(bank_on_disk(&tmp), accepted);
}

/// Story 11: an archive-storage mod converts through the held run.
#[test]
fn an_archive_converts_through_the_held_run() {
    let archive_dir = tempfile::tempdir().unwrap();
    let archive = archive_dir.path().join("events.fantome");
    make_packed_chunk_fantome_zip(&archive, "Events", BANK_IN_WAD, EVENTS_V134);
    let project = ProjectFiles::in_archive(
        &archive,
        &Config::default(),
        Budget::repair(),
        &resolver_naming(&[BANK_IN_WAD]),
        Some(FakeContent::empty()),
    )
    .unwrap();
    let run = project.checked();
    let problem = run
        .problems
        .iter()
        .find(|problem| problem.rule == ID)
        .unwrap()
        .id
        .clone();

    let (report, held) = crate::apply_alternative_held(
        project,
        Vec::new(),
        &run,
        ChosenAlternative {
            problem: &problem,
            alternative: &AlternativeId::new(CONVERT),
        },
        &Config::default(),
        None,
        Some(FakeContent::empty()),
    )
    .unwrap();

    assert_eq!(report.applied, 1);
    let converted = read_bank(held.bytes("base", BANK_IN_LAYER).unwrap());
    assert_eq!(converted.header().version, BankVersion::CURRENT);
    assert_eq!(converted.check(), Ok(()));
}

/// An alternative that the problem does not offer is never applied.
#[test]
fn an_alternative_the_problem_does_not_offer_is_not_applied() {
    let (tmp, files) = project_with(&music_bank(), &[], Some(FakeContent::empty()));
    let run = files.checked();
    let problem = run.problems[0].id.clone();

    let report = crate::apply_alternative(
        tmp.path(),
        &run,
        ChosenAlternative {
            problem: &problem,
            alternative: &AlternativeId::new(CONVERT),
        },
        &Config::default(),
        None,
        Some(FakeContent::empty()),
    )
    .unwrap();

    assert_eq!(report.applied, 0);
    assert_eq!(bank_on_disk(&tmp), music_bank());
}
