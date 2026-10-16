//! Unit tests for the skin bins the rule reports, the ones it leaves alone, and
//! the file its repair removes.

use std::path::Path;
use std::sync::Arc;

use fs_err as fs;
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject, PropertyValueEnum};

use super::*;
use crate::game::{FakeContent, GameContent};
use ltk_manager_assets::test_util::{make_packed_chunks_fantome_zip, resolver_naming};
use ltk_manager_base::budget::Budget;
use ltk_manager_base::config::Config;
use ltk_manager_base::hashing::named;

const WAD: &str = "Ahri.wad.client";
const SKIN0: &str = "data/characters/ahri/skins/skin0.bin";
const SKIN3: &str = "data/characters/ahri/skins/skin3.bin";

fn object_named(name: &str) -> BinHash {
    BinHash::from(name)
}

/// The two skin objects of skin `id`, the skin linking to its resources, plus a particle
/// object that the base skin keeps under its own name.
fn skin_objects(id: u32, look: u32) -> Vec<BinObject> {
    let skin = format!("Characters/Ahri/Skins/Skin{id}");
    let resources = format!("{skin}/Resources");
    vec![
        BinObject::builder(object_named(&skin), named("SkinCharacterDataProperties"))
            .property(
                named("mResourceResolver"),
                PropertyValueEnum::ObjectLink(values::ObjectLink::new(object_named(&resources))),
            )
            .property(
                named("skinClassification"),
                PropertyValueEnum::Hash(values::Hash::new(BinHash(look))),
            )
            .build(),
        BinObject::builder(object_named(&resources), named("ResourceResolver")).build(),
    ]
}

fn particle() -> BinObject {
    BinObject::builder(
        object_named("Characters/Ahri/Skins/Skin0/Particles/Ahri_Base_Q"),
        named("VfxSystemDefinitionData"),
    )
    .build()
}

fn bytes_of(objects: Vec<BinObject>) -> Vec<u8> {
    let bin = Bin::new(objects, std::iter::empty::<&str>());
    let mut out = std::io::Cursor::new(Vec::new());
    bin.to_writer(&mut out).unwrap();
    out.into_inner()
}

fn base() -> Vec<u8> {
    let mut objects = skin_objects(0, 1);
    objects.push(particle());
    bytes_of(objects)
}

/// Skin 3 as the built-in mod writes it: the base skin's two objects under skin 3's names.
fn renamed_copy() -> Vec<u8> {
    bytes_of(skin_objects(3, 1))
}

/// Skin 3 with a look of its own.
fn own_skin() -> Vec<u8> {
    bytes_of(skin_objects(3, 2))
}

fn in_layer(chunk: &str) -> String {
    format!("{WAD}/{chunk}")
}

fn tree(
    chunks: &[(&str, &[u8])],
    game: Option<Arc<dyn GameContent>>,
) -> (tempfile::TempDir, ProjectFiles) {
    let tmp = tempfile::tempdir().unwrap();
    for (chunk, bytes) in chunks {
        let at = tmp
            .path()
            .join("content")
            .join("base")
            .join(in_layer(chunk).replace('/', std::path::MAIN_SEPARATOR_STR));
        fs::create_dir_all(at.parent().unwrap()).unwrap();
        fs::write(&at, bytes).unwrap();
    }

    let files = ProjectFiles::read(tmp.path(), &Config::default(), game).unwrap();
    (tmp, files)
}

fn found_in(files: &ProjectFiles) -> Vec<Problem> {
    let (problems, failed) = files.report(&[&BinBaseSkinCopy::new()]).finish();
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

#[test]
fn skin_bin_byte_copy_of_skin0_is_reported() {
    let (_tmp, files) = tree(&[(SKIN0, &base()), (SKIN3, &base())], None);

    let problems = found_in(&files);

    assert_eq!(paths(&problems), [in_layer(SKIN3)]);
    assert_eq!(problems[0].rule, ID);
    assert_eq!(problems[0].severity, ProblemSeverity::Warning);
    assert!(problems[0].site.node.is_none());
    assert!(problems[0].fix.is_some());
}

#[test]
fn skin_bin_renamed_copy_of_skin0_is_reported() {
    let (_tmp, files) = tree(&[(SKIN0, &base()), (SKIN3, &renamed_copy())], None);

    assert_eq!(paths(&found_in(&files)), [in_layer(SKIN3)]);
}

#[test]
fn skin_bin_copy_is_reported_against_game_skin0_when_mod_ships_none() {
    let game = FakeContent::containing_bytes(&[(SKIN0, &base())]);
    let (_tmp, files) = tree(&[(SKIN3, &renamed_copy())], Some(game));

    assert_eq!(paths(&found_in(&files)), [in_layer(SKIN3)]);
}

#[test]
fn skin_bin_with_own_look_is_not_reported() {
    let (_tmp, files) = tree(&[(SKIN0, &base()), (SKIN3, &own_skin())], None);

    assert!(found_in(&files).is_empty());
}

#[test]
fn skin_bin_without_skin_object_is_not_reported() {
    let (_tmp, files) = tree(
        &[(SKIN0, &base()), (SKIN3, &bytes_of(vec![particle()]))],
        None,
    );

    assert!(found_in(&files).is_empty());
}

#[test]
fn skin_bin_is_not_reported_without_any_skin0() {
    let (_tmp, files) = tree(&[(SKIN3, &renamed_copy())], Some(FakeContent::empty()));

    assert!(found_in(&files).is_empty());
}

#[test]
fn skin_bin_copy_in_archive_is_reported() {
    let tmp = tempfile::tempdir().unwrap();
    let at = tmp.path().join("skins.fantome");
    make_packed_chunks_fantome_zip(&at, "Skins", &[(SKIN0, &base()), (SKIN3, &renamed_copy())]);

    let files = ProjectFiles::in_archive(
        &at,
        &Config::default(),
        Budget::repair(),
        &resolver_naming(&[SKIN0, SKIN3]),
        None,
    )
    .unwrap();

    assert_eq!(
        paths(&found_in(&files)),
        [format!("Aatrox.wad.client/{SKIN3}")]
    );
}

fn repair(root: &Path, problems: &[Problem]) -> Applied {
    let chosen: Vec<&Problem> = problems.iter().collect();
    let mut run = FixRun::open(root, Vec::new(), None, Config::default(), None);
    let applied = BinBaseSkinCopy::new().fix(&chosen, &mut run).unwrap();
    run.finish().unwrap();
    applied
}

#[test]
fn fix_removes_copy_and_keeps_skin0() {
    let (tmp, files) = tree(&[(SKIN0, &base()), (SKIN3, &renamed_copy())], None);
    let problems = found_in(&files);

    let applied = repair(tmp.path(), &problems);

    assert_eq!(
        applied,
        Applied {
            applied: 1,
            skipped: 0
        }
    );
    let layer = tmp.path().join("content").join("base");
    let on_disk = |chunk: &str| {
        layer
            .join(in_layer(chunk).replace('/', std::path::MAIN_SEPARATOR_STR))
            .exists()
    };
    assert!(!on_disk(SKIN3));
    assert!(on_disk(SKIN0));
}

#[test]
fn fix_skips_skin_bin_changed_since_check() {
    let (tmp, files) = tree(&[(SKIN0, &base()), (SKIN3, &renamed_copy())], None);
    let problems = found_in(&files);
    fs::write(
        tmp.path()
            .join("content")
            .join("base")
            .join(in_layer(SKIN3).replace('/', std::path::MAIN_SEPARATOR_STR)),
        own_skin(),
    )
    .unwrap();

    let applied = repair(tmp.path(), &problems);

    assert_eq!(
        applied,
        Applied {
            applied: 0,
            skipped: 1
        }
    );
}
