//! Unit tests for the files the rule reports, the projects it does not report
//! on, and the file its repair writes.

use std::path::Path;

use fs_err as fs;

use super::*;

use crate::problems::ProjectFiles;
use crate::workshop::RECOMMENDED_IGNORE_RULES;
use ltk_manager_base::config::Config;

/// Write `contents` to `relative` under `root`, creating every directory above it.
fn touch(root: &Path, relative: &str, contents: &[u8]) {
    let at = root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    fs::create_dir_all(at.parent().unwrap()).unwrap();
    fs::write(at, contents).unwrap();
}

/// A project holding a texture, a Photoshop source and a Maya swatch folder.
fn project() -> tempfile::TempDir {
    let tmp = tempfile::tempdir().unwrap();
    touch(tmp.path(), "content/base/skin.tex", b"tex");
    touch(tmp.path(), "content/base/skin.psd", b"psd");
    touch(
        tmp.path(),
        "content/base/.mayaSwatches/skin.ma.swatches",
        b"swatch",
    );
    tmp
}

fn workshop(root: &Path) -> ProjectFiles {
    ProjectFiles::read(root, &Config::default(), None)
        .unwrap()
        .in_workshop()
}

fn found_in(files: &ProjectFiles) -> Vec<Problem> {
    let (problems, failed) = files.report(&[&WorkingFile::new()]).finish();
    assert!(
        failed.is_empty(),
        "the fixture should read cleanly: {failed:?}"
    );
    problems
}

fn paths(problems: &[Problem]) -> Vec<&str> {
    problems
        .iter()
        .map(|problem| problem.site.path.as_str())
        .collect()
}

fn repair(root: &Path, problems: &[Problem]) -> Applied {
    let chosen: Vec<&Problem> = problems.iter().collect();
    let mut run = FixRun::open(root, Vec::new(), None, Config::default(), None);
    let applied = WorkingFile::new().fix(&chosen, &mut run).unwrap();
    run.finish().unwrap();
    applied
}

#[test]
fn each_file_the_recommended_rules_exclude_is_a_warning() {
    let tmp = project();

    let problems = found_in(&workshop(tmp.path()));

    assert_eq!(
        paths(&problems),
        [".mayaSwatches/skin.ma.swatches", "skin.psd"]
    );
    for problem in &problems {
        assert_eq!(problem.rule, ID);
        assert_eq!(problem.severity, ProblemSeverity::Warning);
        assert_eq!(problem.site.layer, "base");
    }
}

#[test]
fn the_preview_names_the_pattern_that_excludes_the_file() {
    let tmp = project();

    let problems = found_in(&workshop(tmp.path()));

    let psd = problems
        .iter()
        .find(|problem| problem.site.path == "skin.psd")
        .unwrap();
    let note = psd.fix.as_ref().and_then(|fix| fix.note.as_deref());
    assert_eq!(
        note,
        Some("Excluded by *.psd in the recommended .modignore")
    );
}

#[test]
fn a_project_with_no_file_the_recommended_rules_exclude_reports_nothing() {
    let tmp = tempfile::tempdir().unwrap();
    touch(tmp.path(), "content/base/skin.tex", b"tex");

    assert!(found_in(&workshop(tmp.path())).is_empty());
}

#[test]
fn a_project_with_an_empty_modignore_reports_nothing() {
    let tmp = project();
    touch(tmp.path(), ".modignore", b"");

    assert!(found_in(&workshop(tmp.path())).is_empty());
}

#[test]
fn a_project_with_only_a_nested_modignore_reports_nothing() {
    let tmp = project();
    touch(tmp.path(), "content/base/.modignore", b"*.tmp\n");

    assert!(found_in(&workshop(tmp.path())).is_empty());
}

/// The user does not edit a library mod's rules. A library repair would write
/// the file into the mod's storage.
#[test]
fn a_library_mod_reports_nothing() {
    let tmp = project();

    let files = ProjectFiles::read(tmp.path(), &Config::default(), None).unwrap();

    assert!(found_in(&files).is_empty());
}

#[test]
fn the_repair_writes_the_recommended_rules_and_a_second_run_is_clean() {
    let tmp = project();
    let problems = found_in(&workshop(tmp.path()));

    let applied = repair(tmp.path(), &problems);

    assert_eq!(applied.applied, 2);
    assert_eq!(applied.skipped, 0);
    assert_eq!(
        fs::read_to_string(tmp.path().join(".modignore")).unwrap(),
        RECOMMENDED_IGNORE_RULES
    );
    assert!(found_in(&workshop(tmp.path())).is_empty());
}

#[test]
fn the_repair_does_not_change_rules_written_after_the_check() {
    let tmp = project();
    let problems = found_in(&workshop(tmp.path()));
    touch(tmp.path(), ".modignore", b"*.psd\n");

    let applied = repair(tmp.path(), &problems);

    assert_eq!(applied.applied, 0);
    assert_eq!(applied.skipped, 2);
    assert_eq!(
        fs::read_to_string(tmp.path().join(".modignore")).unwrap(),
        "*.psd\n"
    );
}
