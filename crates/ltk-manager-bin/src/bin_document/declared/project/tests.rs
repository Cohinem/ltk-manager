use fs_err as fs;
use ltk_meta::path::PropertyPath;
use ltk_meta::{Bin, PropertyValueEnum};

use super::super::tests::{Game, SKIN, game_bin, h, project};
use super::*;
use crate::meta_schema;

const CHUNK: &str = "data/characters/teemo/skins/skin0.bin";

fn declarations(dir: &std::path::Path, manifest: &str) -> ProjectDeclarations {
    let project = project(dir);
    fs::write(dir.join("content/base/game_data.yaml"), manifest).unwrap();
    ProjectDeclarations::load(
        &project,
        PatchSchema::new(meta_schema::shared(None), None),
        Game::naming(&[SKIN]),
    )
    .unwrap()
}

fn glow(bytes: Vec<u8>) -> f32 {
    let bin = Bin::from_reader(&mut Cursor::new(bytes)).unwrap();
    let path = PropertyPath::new("skinMeshProperties.selfIllumination").unwrap();
    match bin.objects[&h(SKIN)].resolve(&path).unwrap() {
        PropertyValueEnum::F32(value) => value.value,
        other => panic!("the glow is {other:?}"),
    }
}

#[test]
fn a_chunk_an_entries_module_names_comes_back_declared() {
    let dir = tempfile::tempdir().unwrap();
    let declarations = declarations(
        dir.path(),
        &format!(
            "version: 1\nmodules:\n  - entries:\n      {SKIN}:\n        skinMeshProperties.selfIllumination: 0.37\n"
        ),
    );

    let applied = declarations
        .apply(&game_bin(), ltk_game_data::path_hash(CHUNK))
        .unwrap()
        .unwrap();

    assert!((glow(applied) - 0.37).abs() < f32::EPSILON);
}

#[test]
fn a_chunk_no_declaration_reaches_is_none() {
    let dir = tempfile::tempdir().unwrap();
    let declarations = declarations(
        dir.path(),
        "version: 1\nmodules:\n  - entries:\n      Characters/Ahri/Skins/Skin0:\n        championSkinName: Ahri\n",
    );

    let applied = declarations
        .apply(&game_bin(), ltk_game_data::path_hash(CHUNK))
        .unwrap();

    assert_eq!(applied, None);
}
