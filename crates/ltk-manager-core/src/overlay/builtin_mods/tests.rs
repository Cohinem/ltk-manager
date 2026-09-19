//! Unit tests for the built-in mods and the projects they write.

use super::*;
use ltk_overlay::ModContentProvider as _;
use ltk_wad::{WadBuilder, WadChunkBuilder};
use std::io::Write as _;
use std::path::PathBuf;

fn maps_dir(game: &Path) -> PathBuf {
    game.join("DATA")
        .join("FINAL")
        .join("Maps")
        .join("Shipping")
}

fn build_wad(path: &Path, chunk_paths: &[&str]) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let mut builder = WadBuilder::default();
    for chunk_path in chunk_paths {
        builder = builder.with_chunk(WadChunkBuilder::default().with_path(*chunk_path));
    }
    let mut file = fs::File::create(path).unwrap();
    builder
        .build_to_writer(&mut file, |_path_hash, cursor| {
            cursor.write_all(b"PROP")?;
            Ok(())
        })
        .unwrap();
}

fn files(project: &GeneratedProject) -> Vec<(String, Vec<u8>)> {
    project
        .files()
        .map(|(path, bytes)| (path.as_str().replace('\\', "/"), bytes.to_vec()))
        .collect()
}

#[test]
fn ward_skins_break_every_skin_bin_a_map_archive_holds() {
    let game = tempfile::tempdir().unwrap();
    build_wad(
        &maps_dir(game.path()).join("Map11.wad.client"),
        &[
            "data/characters/sightward/skins/skin0.bin",
            "data/characters/sightward/skins/skin1.bin",
            "data/characters/sightward/skins/skin267.bin",
            "data/characters/sru_dragon/skins/skin1.bin",
        ],
    );
    build_wad(
        &maps_dir(game.path()).join("Map12.wad.client"),
        &["data/characters/sightward/skins/skin3.bin"],
    );

    let project = BuiltinMod::DefaultWardSkins
        .project(&GameDir::from_path(game.path()))
        .unwrap();

    assert_eq!(
        files(&project),
        [
            (
                "Map11.wad.client/data/characters/sightward/skins/skin1.bin".to_string(),
                b"JUNK".to_vec()
            ),
            (
                "Map11.wad.client/data/characters/sightward/skins/skin267.bin".to_string(),
                b"JUNK".to_vec()
            ),
            (
                "Map12.wad.client/data/characters/sightward/skins/skin3.bin".to_string(),
                b"JUNK".to_vec()
            ),
        ]
    );
}

#[test]
fn ward_skins_leave_archives_outside_the_maps_alone() {
    let game = tempfile::tempdir().unwrap();
    build_wad(
        &game
            .path()
            .join("DATA")
            .join("FINAL")
            .join("Global.wad.client"),
        &["data/characters/sightward/skins/skin1.bin"],
    );

    let project = BuiltinMod::DefaultWardSkins
        .project(&GameDir::from_path(game.path()))
        .unwrap();

    assert_eq!(files(&project), []);
}

#[test]
fn ward_skins_pass_over_a_map_archive_that_does_not_mount() {
    let game = tempfile::tempdir().unwrap();
    fs::create_dir_all(maps_dir(game.path())).unwrap();
    fs::write(maps_dir(game.path()).join("Map11.wad.client"), b"not a wad").unwrap();
    build_wad(
        &maps_dir(game.path()).join("Map12.wad.client"),
        &["data/characters/sightward/skins/skin3.bin"],
    );

    let project = BuiltinMod::DefaultWardSkins
        .project(&GameDir::from_path(game.path()))
        .unwrap();

    assert_eq!(
        files(&project),
        [(
            "Map12.wad.client/data/characters/sightward/skins/skin3.bin".to_string(),
            b"JUNK".to_vec()
        )]
    );
}

#[test]
fn a_skin_bin_path_hashes_to_the_chunk_the_game_ships() {
    let hash = ltk_wad::WadHash::from("data/characters/sightward/skins/skin1.bin");
    assert_eq!(hash.0, 0x3352_aa5f_60c7_fbd0);
}

fn ward_project(skins: &[(&str, u32)]) -> GeneratedProject {
    let mut project = GeneratedProject::new("default-ward-skins", "Default ward skins");
    for (wad, id) in skins {
        project.insert(
            wad,
            &format!("data/characters/sightward/skins/skin{id}.bin"),
            b"JUNK".as_slice(),
        );
    }
    project
}

fn overrides(dir: &Path) -> Vec<(String, String, Vec<u8>)> {
    let mut content = ltk_overlay::FsModContent::new(dir.to_path_buf().try_into().unwrap());
    let mut out = Vec::new();
    for wad in content.list_layer_wads("base").unwrap() {
        for (path, bytes) in content.read_wad_overrides("base", &wad).unwrap() {
            out.push((wad.clone(), path.as_str().replace('\\', "/"), bytes));
        }
    }
    out.sort();
    out
}

#[test]
fn a_written_project_reads_back_as_a_mod() {
    let dir = tempfile::tempdir().unwrap();

    ward_project(&[("Map11.wad.client", 1), ("Map12.wad.client", 3)])
        .write(dir.path())
        .unwrap();

    let mut content = ltk_overlay::FsModContent::new(dir.path().to_path_buf().try_into().unwrap());
    assert_eq!(content.mod_project().unwrap().name, "default-ward-skins");
    assert_eq!(
        overrides(dir.path()),
        [
            (
                "Map11.wad.client".to_string(),
                "data/characters/sightward/skins/skin1.bin".to_string(),
                b"JUNK".to_vec()
            ),
            (
                "Map12.wad.client".to_string(),
                "data/characters/sightward/skins/skin3.bin".to_string(),
                b"JUNK".to_vec()
            ),
        ]
    );
}

#[test]
fn rewriting_an_unchanged_project_keeps_its_fingerprint() {
    let dir = tempfile::tempdir().unwrap();
    let project = ward_project(&[("Map11.wad.client", 1)]);
    project.write(dir.path()).unwrap();

    let long_ago = filetime::FileTime::from_unix_time(1_000_000_000, 0);
    for entry in walkdir::WalkDir::new(dir.path()) {
        let entry = entry.unwrap();
        if entry.file_type().is_file() {
            filetime::set_file_mtime(entry.path(), long_ago).unwrap();
        }
    }
    let content = ltk_overlay::FsModContent::new(dir.path().to_path_buf().try_into().unwrap());
    let before = content.content_fingerprint().unwrap();

    project.write(dir.path()).unwrap();

    let content = ltk_overlay::FsModContent::new(dir.path().to_path_buf().try_into().unwrap());
    let after = content.content_fingerprint().unwrap();
    assert!(before.is_some());
    assert_eq!(before, after);
}

#[test]
fn a_rewrite_drops_what_the_project_no_longer_holds() {
    let dir = tempfile::tempdir().unwrap();
    ward_project(&[
        ("Map11.wad.client", 1),
        ("Map11.wad.client", 2),
        ("Map12.wad.client", 3),
    ])
    .write(dir.path())
    .unwrap();

    ward_project(&[("Map11.wad.client", 1)])
        .write(dir.path())
        .unwrap();

    assert_eq!(
        overrides(dir.path()),
        [(
            "Map11.wad.client".to_string(),
            "data/characters/sightward/skins/skin1.bin".to_string(),
            b"JUNK".to_vec()
        )]
    );
    assert!(
        !dir.path()
            .join("content")
            .join("base")
            .join("Map12.wad.client")
            .exists()
    );
}

fn config_with_ward_skins(on: bool) -> Config {
    Config {
        builtin_mods: BuiltinMods {
            default_ward_skins: on,
        },
        ..Config::default()
    }
}

#[test]
fn a_built_in_mod_turned_on_is_written_and_injected() {
    let game = tempfile::tempdir().unwrap();
    build_wad(
        &maps_dir(game.path()).join("Map11.wad.client"),
        &["data/characters/sightward/skins/skin1.bin"],
    );
    let storage = tempfile::tempdir().unwrap();

    let mods = sync(
        storage.path(),
        &config_with_ward_skins(true),
        &GameDir::from_path(game.path()),
    )
    .unwrap();

    let ids: Vec<&str> = mods.iter().map(|m| m.id.as_str()).collect();
    assert_eq!(ids, ["builtin:default-ward-skins"]);
    assert_eq!(
        overrides(&storage.path().join("builtin").join("default-ward-skins")),
        [(
            "Map11.wad.client".to_string(),
            "data/characters/sightward/skins/skin1.bin".to_string(),
            b"JUNK".to_vec()
        )]
    );
}

#[test]
fn a_built_in_mod_turned_off_is_removed() {
    let game = tempfile::tempdir().unwrap();
    let storage = tempfile::tempdir().unwrap();
    let game_dir = GameDir::from_path(game.path());
    sync(storage.path(), &config_with_ward_skins(true), &game_dir).unwrap();

    let mods = sync(storage.path(), &config_with_ward_skins(false), &game_dir).unwrap();

    assert!(mods.is_empty());
    assert!(
        !storage
            .path()
            .join("builtin")
            .join("default-ward-skins")
            .exists()
    );
}

#[test]
fn a_game_without_maps_generates_an_empty_project() {
    let game = tempfile::tempdir().unwrap();

    let project = BuiltinMod::DefaultWardSkins
        .project(&GameDir::from_path(game.path()))
        .unwrap();

    assert_eq!(files(&project), []);
}
