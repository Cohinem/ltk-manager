use super::*;
use crate::mods::test_support::make_full_fantome_zip;
use ltk_modpkg::Modpkg;

#[test]
fn measures_the_deepest_entry_under_the_target() {
    let dir = tempfile::tempdir().unwrap();
    let archive = dir.path().join("full.fantome");
    make_full_fantome_zip(&archive);

    let target = Path::new("C:\\storage\\mods\\full-mod");
    let longest = longest_fantome_import_path(&archive, target).unwrap();

    // The deepest named entry is the directory-style WAD's file.
    let expected = target
        .join("content")
        .join("base")
        .join("Aatrox.wad.client/data/characters/aatrox/skins/skin01.bin")
        .as_os_str()
        .len();
    assert!(
        longest >= expected,
        "longest {longest} should cover the {expected}-char directory-style entry"
    );
}

#[test]
fn a_packed_wad_is_counted_with_a_chunk_name_it_does_not_hold_yet() {
    let dir = tempfile::tempdir().unwrap();
    let archive = dir.path().join("packed.fantome");
    {
        use std::io::Write as _;
        let file = std::fs::File::create(&archive).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("WAD/Ashe.wad.client", options).unwrap();
        zip.write_all(b"not really a wad").unwrap();
        zip.finish().unwrap();
    }

    let target = Path::new("/storage/mods/packed");
    let longest = longest_fantome_import_path(&archive, target).unwrap();
    let wad_dir = target
        .join("content")
        .join("base")
        .join("Ashe.wad.client")
        .as_os_str()
        .len();

    assert_eq!(longest, wad_dir + 1 + HEX_CHUNK_NAME_LEN);
}

/// `META/info.json` becomes the config through the metadata rather than as a
/// file of its own, so an archive holding nothing else writes nothing to
/// measure.
#[test]
fn an_archive_holding_only_its_metadata_measures_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let archive = dir.path().join("meta-only.fantome");
    crate::mods::test_support::make_fantome_zip(&archive);

    assert_eq!(
        longest_fantome_import_path(&archive, Path::new("/storage/mods/meta-only")).unwrap(),
        0
    );
}

/// The readme and the license are written, at the project root rather than
/// under a layer, so they are measured where they land. They are simply never
/// the longest thing an archive holds.
#[test]
fn the_metadata_files_that_do_land_are_measured_at_the_project_root() {
    let dir = tempfile::tempdir().unwrap();
    let archive = dir.path().join("readme.fantome");
    {
        use std::io::Write as _;
        let file = std::fs::File::create(&archive).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("META/README.md", options).unwrap();
        zip.write_all(b"how it works").unwrap();
        zip.finish().unwrap();
    }

    let target = Path::new("/storage/mods/readme");
    assert_eq!(
        longest_fantome_import_path(&archive, target).unwrap(),
        target.join("README.md").as_os_str().len()
    );
}

/// The preflight is a no-op wherever the limit does not apply, which is every
/// machine the suite runs on that has long paths on (and all non-Windows ones).
#[test]
fn preflight_passes_for_a_shallow_target_whatever_the_machine_says() {
    let dir = tempfile::tempdir().unwrap();
    let archive = dir.path().join("full.fantome");
    make_full_fantome_zip(&archive);

    preflight_fantome_import(&archive, Path::new("/m"), ImportRoot::ModStorage).unwrap();
}

/// What a refusal told the user, or a panic naming what came back instead.
fn refusal(longest: usize, root: ImportRoot) -> String {
    match refuse_if_too_long(longest, MAX_LEGACY_PATH, root) {
        Err(AppError::ValidationFailed(message)) => message,
        other => panic!("expected a refusal of {longest}, got {other:?}"),
    }
}

/// The library writes into mod storage and the workshop into its own
/// directory, so a refusal that named one of them for both would send half its
/// readers to a setting that would not have helped.
#[test]
fn a_refusal_names_the_folder_that_import_writes_into() {
    let past_the_limit = MAX_LEGACY_PATH + 1;

    assert!(refusal(past_the_limit, ImportRoot::ModStorage).contains("your mod storage"));
    assert!(refusal(past_the_limit, ImportRoot::Workshop).contains("your workshop directory"));
}

/// The preflight measures a packed WAD's chunks at a hex name, and a resolver
/// that names them writes paths several times longer, so what landed is the
/// only exact answer.
#[test]
fn a_written_tree_is_measured_at_its_deepest_entry() {
    let dir = tempfile::tempdir().unwrap();
    let deep = dir
        .path()
        .join("content")
        .join("base")
        .join("Aatrox.wad.client")
        .join("data/characters/aatrox/skins");
    std::fs::create_dir_all(&deep).unwrap();
    std::fs::write(deep.join("skin01.bin"), b"x").unwrap();
    std::fs::write(dir.path().join("mod.config.json"), b"{}").unwrap();

    assert_eq!(
        longest_path_at(dir.path(), dir.path()),
        deep.join("skin01.bin").to_string_lossy().chars().count()
    );
}

/// A staged tree is measured at the directory it is renamed onto, so the uuid
/// it was written under never reaches the answer.
#[test]
fn a_staged_tree_is_measured_where_it_will_land() {
    let staged = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(staged.path().join("content/base")).unwrap();
    std::fs::write(staged.path().join("content/base/skin01.bin"), b"x").unwrap();

    let destination = std::path::Path::new(r"D:\mods\ashe");

    assert_eq!(
        longest_path_at(staged.path(), destination),
        r"D:\mods\ashe\content\base\skin01.bin".len()
    );
}

#[test]
fn an_empty_tree_measures_nothing() {
    let dir = tempfile::tempdir().unwrap();

    assert_eq!(longest_path_at(dir.path(), dir.path()), 0);
}

/// `MAX_PATH` is 260 and counts the terminating NUL, so 259 characters is the
/// longest path that fits and 260 is already one too many.
#[test]
fn the_limit_leaves_room_for_the_terminating_null() {
    refuse_if_too_long(259, MAX_LEGACY_PATH, ImportRoot::ModStorage).unwrap();
    assert!(refuse_if_too_long(260, MAX_LEGACY_PATH, ImportRoot::ModStorage).is_err());
}

/// An archive holding one packed WAD under `wad_name`.
fn make_packed_wad_zip(path: &Path, wad_name: &str) {
    use std::io::Write as _;
    let file = std::fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file(format!("WAD/{wad_name}"), options).unwrap();
    zip.write_all(b"not really a wad").unwrap();
    zip.finish().unwrap();
}

/// Windows counts a path in UTF-16 code units where Rust holds it in UTF-8
/// bytes, so measuring the bytes reads a Cyrillic name at twice its true
/// length and a CJK one at three times — and refuses imports that would fit.
///
/// Both halves of the sum are checked, because the prefix comes from an
/// `OsStr` and the entry from a `str` and each counts its own way.
#[test]
fn a_path_is_measured_in_the_characters_windows_counts() {
    let dir = tempfile::tempdir().unwrap();
    let ascii_archive = dir.path().join("ascii.fantome");
    let cyrillic_archive = dir.path().join("cyrillic.fantome");
    make_packed_wad_zip(&ascii_archive, "Aaaaa.wad.client");
    make_packed_wad_zip(&cyrillic_archive, "Ааааа.wad.client");

    let ascii_target = Path::new("/mods/aaaaaa");
    let cyrillic_target = Path::new("/mods/аааааа");

    let baseline = longest_fantome_import_path(&ascii_archive, ascii_target).unwrap();

    assert_eq!(
        longest_fantome_import_path(&ascii_archive, cyrillic_target).unwrap(),
        baseline,
        "the target directory is six characters either way"
    );
    assert_eq!(
        longest_fantome_import_path(&cyrillic_archive, ascii_target).unwrap(),
        baseline,
        "and so is the WAD's name"
    );
}

/// A package names every chunk it holds, so its answer is the length itself
/// rather than the floor a fantome archive's packed WADs make of it.
#[test]
fn a_package_is_measured_at_the_paths_it_names() {
    let dir = tempfile::tempdir().unwrap();
    let package = dir.path().join("packed.modpkg");
    crate::mods::test_support::make_modpkg(&package, "packed-mod");
    let modpkg = Modpkg::mount_from_reader(std::fs::File::open(&package).unwrap()).unwrap();

    let target = Path::new("/workshop/packed-mod");

    assert_eq!(
        longest_modpkg_import_path(&modpkg, target),
        target
            .join("content/base/aatrox.wad.client/data/skin0.bin")
            .as_os_str()
            .len()
    );
}
