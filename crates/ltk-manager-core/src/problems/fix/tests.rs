//! Unit tests for what a fix run writes, what it refuses, and what it reports.

use super::*;

use assert_matches::assert_matches;
use std::ffi::OsStr;

const BASE: &str = "base";
const SKIN: &str = "data/characters/smolder/skins/skin0.bin";

/// A project holding one layer file, which every test writes through.
fn project(bytes: &[u8]) -> tempfile::TempDir {
    let project = tempfile::tempdir().expect("a temp dir");
    let file = source(project.path());
    fs::create_dir_all(file.parent().expect("a layer directory")).expect("the layer");
    fs::write(&file, bytes).expect("the file");
    project
}

fn source(project_root: &Path) -> PathBuf {
    project_root.join(CONTENT_DIR).join(BASE).join(SKIN)
}

fn open(project_root: &Path) -> FixRun<'static> {
    FixRun::open(
        project_root,
        vec!["16.17.8087655".to_owned()],
        None,
        Config::default(),
        None,
    )
}

#[test]
fn a_read_reports_the_bytes_on_disk() {
    let project = project(b"before");
    let run = open(project.path());

    assert_eq!(run.read(BASE, SKIN).expect("the file"), b"before");
}

#[test]
fn a_write_lands_the_new_bytes() {
    let project = project(b"before");
    let mut run = open(project.path());

    run.write(BASE, SKIN, b"after", 14, 0).expect("the write");

    assert_eq!(
        fs::read(source(project.path())).expect("the file"),
        b"after"
    );
}

#[test]
fn two_writes_to_one_file_read_as_one_row() {
    let project = project(b"before");
    let mut run = open(project.path());

    run.write(BASE, SKIN, b"once", 4, 1).expect("the write");
    run.write(BASE, SKIN, b"twice", 3, 2).expect("the write");
    let report = run.finish().expect("a report");

    assert_eq!(report.files.len(), 1);
    assert_eq!(report.applied, 7);
    assert_eq!(report.skipped, 3);
}

#[test]
fn a_path_that_leaves_the_layer_is_rejected_and_writes_nothing() {
    let project = project(b"before");
    let mut run = open(project.path());

    assert_matches!(
        run.write(BASE, "../../escaped.bin", b"owned", 1, 0),
        Err(FixError::Escapes(_))
    );

    assert!(!project.path().join("escaped.bin").exists());
    assert_eq!(
        fs::read(source(project.path())).expect("the file"),
        b"before"
    );
}

#[test]
fn a_path_holding_a_current_directory_segment_is_rejected() {
    let project = project(b"before");
    let run = open(project.path());

    assert_matches!(
        run.read(BASE, "data/./characters/smolder/skins/skin0.bin"),
        Err(FixError::Escapes(_))
    );
}

/// Only a Windows path can name a root inside one segment. Splitting on `/`
/// leaves a POSIX absolute path no segment to be absolute in.
#[test]
#[cfg(windows)]
fn a_path_holding_an_absolute_segment_is_rejected() {
    let project = project(b"before");
    let mut run = open(project.path());

    assert_matches!(
        run.write(
            BASE,
            r"C:\Windows\System32\drivers\etc\hosts",
            b"owned",
            1,
            0
        ),
        Err(FixError::Escapes(_))
    );
    assert_matches!(
        run.read(BASE, r"\\server\share\skin0.bin"),
        Err(FixError::Escapes(_))
    );
}

#[test]
fn a_layer_that_leaves_the_content_directory_is_rejected() {
    let project = project(b"before");
    let run = open(project.path());

    assert_matches!(run.read("..", SKIN), Err(FixError::Escapes(_)));
}

#[test]
fn a_skipped_file_is_recorded_and_never_written() {
    let project = project(b"before");
    let mut run = open(project.path());

    run.skipped(BASE, SKIN, 3);
    let report = run.finish().expect("a report");

    assert_eq!(
        report.files,
        vec![FileOutcome {
            layer: BASE.to_owned(),
            path: SKIN.to_owned(),
            applied: 0,
            skipped: 3,
            change: FileChange::Written,
        }]
    );
    assert_eq!(report.applied, 0);
    assert_eq!(
        fs::read(source(project.path())).expect("the file"),
        b"before"
    );
}

#[test]
fn a_write_leaves_no_temp_file_beside_the_file_it_wrote() {
    let project = project(b"before");
    let mut run = open(project.path());

    run.write(BASE, SKIN, b"after", 1, 0).expect("the write");

    let dir = source(project.path());
    let dir = dir.parent().expect("a layer directory");
    let names: Vec<_> = fs::read_dir(dir)
        .expect("the directory")
        .map(|entry| entry.expect("an entry").file_name())
        .collect();
    assert_eq!(names, vec![OsStr::new("skin0.bin")]);
}

/// A report names the tables it applied, because a mod repaired under one
/// migration table is a different claim from one repaired under another.
#[test]
fn a_report_names_the_tables_the_run_applied() {
    let project = project(b"before");
    let mut run = open(project.path());

    run.write(BASE, SKIN, b"after", 14, 0).expect("the write");
    run.skipped(BASE, "data/characters/smolder/smolder.bin", 2);
    let report = run.finish().expect("a report");

    assert_eq!(report.tables, vec!["16.17.8087655".to_owned()]);
    assert_eq!(report.files.len(), 2);
    assert_eq!(report.applied, 14);
    assert_eq!(report.skipped, 2);
}

/// A repair leaves nothing behind to reverse it with. Losslessness is the
/// mod's own hashtable now - ADR-0006.
#[test]
fn a_fix_run_writes_no_restore_point() {
    let project = project(b"before");
    let mut run = open(project.path());

    run.write(BASE, SKIN, b"after", 1, 0).expect("the write");
    run.finish().expect("a report");

    assert!(!project.path().join(".ltk").exists());
}

/// A run that holds its writes, over an archive read where it lies.
mod held {
    use super::*;

    use crate::mods::test_support::{
        STALE_BIN_IN_WAD, bin_bytes, make_packed_bin_fantome_zip, resolver_naming, stale_bin,
    };
    use crate::problems::{Budget, Preserved};

    const CHUNK: &str = "Aatrox.wad.client/data/skin0.bin";
    const ICON: &str = "ASSETS/Characters/Smolder/HUD/Smolder_Circle.dds";

    /// A packed fantome holding the stale bin, read where it lies.
    fn archived() -> (tempfile::TempDir, ProjectFiles) {
        let dir = tempfile::tempdir().expect("a temp dir");
        let archive = dir.path().join("mod.fantome");
        make_packed_bin_fantome_zip(
            &archive,
            "packed-mod",
            &stale_bin(),
            zip::CompressionMethod::Stored,
        );
        let files = ProjectFiles::in_archive(
            &archive,
            &Config::default(),
            Budget::repair(),
            &resolver_naming(&[STALE_BIN_IN_WAD]),
            None,
        )
        .expect("the archive");
        (dir, files)
    }

    fn held(files: ProjectFiles) -> FixRun<'static> {
        FixRun::held(files, Vec::new(), Vec::new(), None, Config::default(), None)
    }

    #[test]
    fn a_read_reports_the_bytes_in_the_archive() {
        let (_dir, files) = archived();
        let run = held(files);

        assert_eq!(
            run.read(BASE, CHUNK).expect("the chunk"),
            bin_bytes(&stale_bin())
        );
    }

    /// Story: the property-type fix wrote a bin, and the audio fix that runs
    /// after it reads the mod as the run has left it, while the archive on
    /// disk is as it was.
    #[test]
    fn a_write_is_read_back_by_the_rules_that_follow_and_lands_nowhere() {
        let (dir, files) = archived();
        let mut run = held(files);
        let before = fs::read(dir.path().join("mod.fantome")).expect("the archive");

        run.write(BASE, CHUNK, b"after", 1, 0).expect("the write");

        assert_eq!(run.read(BASE, CHUNK).expect("the chunk"), b"after");
        let project = run.project().expect("the files");
        let handle = project
            .files()
            .find(|handle| handle.path() == CHUNK)
            .expect("the listing");
        assert_eq!(handle.bytes().expect("the chunk"), b"after");
        assert_eq!(handle.size_bytes(), 5);
        assert_eq!(
            fs::read(dir.path().join("mod.fantome")).expect("the archive"),
            before
        );
    }

    #[test]
    fn a_removal_drops_the_file_from_the_listing() {
        let (_dir, files) = archived();
        let mut run = held(files);

        run.remove(BASE, CHUNK, 1).expect("the removal");

        assert!(
            run.project()
                .expect("the files")
                .files()
                .all(|handle| handle.path() != CHUNK)
        );
        assert_matches!(run.read(BASE, CHUNK), Err(FixError::File { .. }));
    }

    #[test]
    fn a_write_to_a_file_the_mod_does_not_hold_is_refused() {
        let (_dir, files) = archived();
        let mut run = held(files);

        assert_matches!(
            run.write(BASE, "Aatrox.wad.client/data/skin1.bin", b"new", 1, 0),
            Err(FixError::File { .. })
        );
        assert!(run.finish_held().expect("the writes").0.files.is_empty());
    }

    #[test]
    fn finishing_hands_back_what_was_written_and_the_names_kept() {
        let (_dir, files) = archived();
        let mut run = held(files);
        run.write(BASE, CHUNK, b"after", 1, 0).expect("the write");
        assert_eq!(run.kept_names().keep(ICON), Preserved::Kept);

        let (report, held) = run.finish_held().expect("the writes");

        assert_eq!(report.applied, 1);
        assert_eq!(report.names_kept, 1);
        assert_eq!(held.bytes(BASE, CHUNK), Some(&b"after"[..]));
        let table = held.table().expect("the table");
        assert!(table.into.is_none(), "the fixture declares no table");
        assert!(String::from_utf8_lossy(&table.bytes).contains(ICON));
    }

    #[test]
    fn a_run_over_a_tree_has_nothing_held_to_hand_back() {
        let project = project(b"before");
        let run = open(project.path());

        assert!(run.finish_held().is_err());
    }
}
