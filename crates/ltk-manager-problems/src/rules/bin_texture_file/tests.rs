//! Unit tests for the texture values that the rule reports and the values that it skips.

use fs_err as fs;
use ltk_hash::Hash as _;
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject, PropertyValueEnum};

use super::*;
use crate::ProjectFiles;
use ltk_manager_assets::test_util::bin_bytes;
use ltk_manager_base::config::Config;

const WAD: &str = "Draven.wad.client";
const SKIN_BIN: &str = "data/characters/draven/skins/skin0.bin";
const MESH: &str = "assets/characters/draven/skins/base/particles/axe.scb";
const IMAGE: &str = "assets/characters/draven/skins/base/particles/axe.tex";

fn h(name: &str) -> BinHash {
    BinHash::hash_str(name)
}

/// Returns a bin with one object of `class` that sets `field` to `value`.
fn bin(class: &str, field: &str, value: impl Into<PropertyValueEnum>) -> Vec<u8> {
    bin_bytes(&Bin::new(
        [
            BinObject::builder(h("Characters/Draven/Skins/Skin0"), h(class))
                .property(h(field), value)
                .build(),
        ],
        std::iter::empty::<&str>(),
    ))
}

/// Writes `files` as an unpacked mod, each as `(chunk path, bytes)`, and runs the rule.
fn found(files: &[(&str, &[u8])]) -> Vec<Problem> {
    let tmp = tempfile::tempdir().unwrap();
    for (path, bytes) in files {
        let at = tmp
            .path()
            .join("content")
            .join("base")
            .join(format!("{WAD}/{path}").replace('/', std::path::MAIN_SEPARATOR_STR));
        fs::create_dir_all(at.parent().unwrap()).unwrap();
        fs::write(&at, bytes).unwrap();
    }

    let project = ProjectFiles::read(tmp.path(), &Config::default(), None).unwrap();
    let (problems, failed) = project.report(&[&BinTextureFile::new()]).finish();
    assert!(failed.is_empty(), "the run recorded a failure: {failed:?}");
    problems
}

#[test]
fn texture_reports_mesh_path() {
    let skin = bin(
        "VfxEmitterDefinitionData",
        "texture",
        values::String::from(MESH),
    );

    let problems = found(&[(SKIN_BIN, &skin)]);

    assert_eq!(problems.len(), 1);
    assert_eq!(problems[0].severity, ProblemSeverity::Fatal);
    assert_eq!(
        problems[0].message.as_deref(),
        Some(format!("`{MESH}` is not an image").as_str())
    );
}

#[test]
fn texture_skips_image_path() {
    let skin = bin(
        "VfxEmitterDefinitionData",
        "texture",
        values::String::from(IMAGE),
    );

    assert!(found(&[(SKIN_BIN, &skin)]).is_empty());
}

#[test]
fn texture_skips_path_without_extension() {
    let skin = bin(
        "VfxEmitterDefinitionData",
        "texture",
        values::String::from("assets/characters/draven/axe"),
    );

    assert!(found(&[(SKIN_BIN, &skin)]).is_empty());
}

#[test]
fn mesh_field_skips_mesh_path() {
    let skin = bin(
        "VfxMeshDefinitionData",
        "mSimpleMeshName",
        values::String::from(MESH),
    );

    assert!(found(&[(SKIN_BIN, &skin)]).is_empty());
}

#[test]
fn file_value_reports_mod_mesh() {
    let link = values::WadChunkLink::new(WadHash::hash_str(MESH));
    let skin = bin(
        "SkinCharacterDataProperties",
        "iconCircle",
        values::Optional::from(link),
    );

    let problems = found(&[(SKIN_BIN, &skin), (MESH, b"r3d2Mesh")]);

    assert_eq!(problems.len(), 1);
    assert_eq!(
        problems[0].message.as_deref(),
        Some(format!("`{MESH}` is not an image").as_str())
    );
}

#[test]
fn file_value_skips_hash_without_mod_file() {
    let link = values::WadChunkLink::new(WadHash::hash_str(MESH));
    let skin = bin("SkinMeshDataProperties", "texture", link);

    assert!(found(&[(SKIN_BIN, &skin)]).is_empty());
}
