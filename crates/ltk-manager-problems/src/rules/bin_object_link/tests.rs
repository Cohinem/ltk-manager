//! Unit tests for the links that the rule reports and the links that it skips.

use std::sync::Arc;

use fs_err as fs;
use ltk_hash::Hash as _;
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject, PropertyValueEnum};

use super::*;
use crate::game::{FakeContent, GameContent};
use ltk_manager_assets::test_util::{bin_bytes, make_packed_chunks_fantome_zip, resolver_naming};
use ltk_manager_base::budget::Budget;
use ltk_manager_base::config::Config;

const WAD: &str = "Aatrox.wad.client";
const SKIN_BIN: &str = "data/characters/aatrox/skins/skin0.bin";
const OTHER_BIN: &str = "data/characters/aatrox/skins/skin1.bin";

const SKIN: &str = "Characters/Aatrox/Skins/Skin0";
const RESOURCES: &str = "Characters/Aatrox/Skins/Skin0/Resources";
const ABSENT: &str = "Characters/Aatrox/Skins/Skin0/Particles/Absent";

fn h(name: &str) -> BinHash {
    BinHash::hash_str(name)
}

fn link(target: &str) -> values::ObjectLink {
    values::ObjectLink::new(h(target))
}

/// Returns the bytes of a bin that contains `objects`.
fn bin(objects: Vec<BinObject>) -> Vec<u8> {
    bin_bytes(&Bin::new(objects, std::iter::empty::<&str>()))
}

/// Returns a bin with one object `object` whose `resolver` property links to `target`.
fn bin_linking(object: &str, target: &str) -> Vec<u8> {
    bin(vec![
        BinObject::builder(h(object), h("SkinCharacterDataProperties"))
            .property(h("resolver"), link(target))
            .build(),
    ])
}

/// Returns a bin with one object `object` and no property.
fn bin_declaring(object: &str) -> Vec<u8> {
    bin(vec![
        BinObject::builder(h(object), h("VfxSystemDefinitionData")).build(),
    ])
}

/// Writes `bins` as an unpacked mod, each as `(chunk path, bytes)`, and reads it.
fn tree(
    bins: &[(&str, &[u8])],
    game: Option<Arc<dyn GameContent>>,
) -> (tempfile::TempDir, ProjectFiles) {
    let tmp = tempfile::tempdir().unwrap();
    for (path, bytes) in bins {
        let at = tmp
            .path()
            .join("content")
            .join("base")
            .join(format!("{WAD}/{path}").replace('/', std::path::MAIN_SEPARATOR_STR));
        fs::create_dir_all(at.parent().unwrap()).unwrap();
        fs::write(&at, bytes).unwrap();
    }

    let files = ProjectFiles::read(tmp.path(), &Config::default(), game).unwrap();
    (tmp, files)
}

/// Runs the rule over `files`. Panics if the run records a failure.
fn found_in(files: &ProjectFiles) -> Vec<Problem> {
    let (problems, failed) = files.report(&[&BinObjectLink::new()]).finish();
    assert!(failed.is_empty(), "the run recorded a failure: {failed:?}");
    problems
}

#[test]
fn rule_reports_link_to_undefined_object() {
    let (_tmp, files) = tree(
        &[(SKIN_BIN, &bin_linking(SKIN, ABSENT))],
        Some(FakeContent::with_bins(&[])),
    );

    let problems = found_in(&files);

    assert_eq!(problems.len(), 1);
    let problem = &problems[0];
    assert_eq!(problem.rule, ID);
    assert_eq!(problem.severity, ProblemSeverity::Warning);
    assert_eq!(problem.site.layer, "base");
    assert_eq!(problem.site.path, format!("{WAD}/{SKIN_BIN}"));
    let node = problem.site.node.as_ref().expect("a node site");
    assert_eq!(node.entry, h(SKIN));
    assert_eq!(node.path, format!("{:08x}", h("resolver").0));
    let message = problem.message.as_deref().expect("a message");
    assert!(
        message.contains(&format!("0x{:08x}", h(ABSENT).0)),
        "{message}"
    );
    assert_eq!(problem.fix, None);
}

#[test]
fn rule_skips_link_to_object_in_same_bin() {
    let bytes = bin(vec![
        BinObject::builder(h(SKIN), h("SkinCharacterDataProperties"))
            .property(h("resolver"), link(RESOURCES))
            .property(h("own"), link(SKIN))
            .build(),
        BinObject::builder(h(RESOURCES), h("ResourceResolver")).build(),
    ]);
    let (_tmp, files) = tree(&[(SKIN_BIN, &bytes)], Some(FakeContent::with_bins(&[])));

    assert!(found_in(&files).is_empty());
}

#[test]
fn rule_skips_link_to_object_in_other_bin_of_mod() {
    let (_tmp, files) = tree(
        &[
            (SKIN_BIN, &bin_linking(SKIN, ABSENT)),
            (OTHER_BIN, &bin_declaring(ABSENT)),
        ],
        Some(FakeContent::with_bins(&[])),
    );

    assert!(found_in(&files).is_empty());
}

#[test]
fn rule_skips_link_to_object_in_game_bin() {
    let (_tmp, files) = tree(
        &[(SKIN_BIN, &bin_linking(SKIN, ABSENT))],
        Some(FakeContent::with_bins(&[(
            OTHER_BIN,
            &bin_declaring(ABSENT),
        )])),
    );

    assert!(found_in(&files).is_empty());
}

#[test]
fn rule_reports_link_to_object_in_replaced_game_chunk() {
    let theirs = bin(vec![
        BinObject::builder(h(SKIN), h("SkinCharacterDataProperties"))
            .property(h("resolver"), link(ABSENT))
            .build(),
        BinObject::builder(h(ABSENT), h("VfxSystemDefinitionData")).build(),
    ]);
    let (_tmp, files) = tree(
        &[(SKIN_BIN, &bin_linking(SKIN, ABSENT))],
        Some(FakeContent::with_bins(&[(SKIN_BIN, &theirs)])),
    );

    assert_eq!(found_in(&files).len(), 1);
}

#[test]
fn rule_skips_undefined_link_in_game_chunk_declaring_object() {
    let game = || {
        Some(FakeContent::with_bins(&[(
            SKIN_BIN,
            &bin_linking(SKIN, ABSENT),
        )]))
    };
    let (_same, same_chunk) = tree(&[(SKIN_BIN, &bin_linking(SKIN, ABSENT))], game());
    let (_other, other_chunk) = tree(&[(OTHER_BIN, &bin_linking(SKIN, ABSENT))], game());

    assert!(found_in(&same_chunk).is_empty());
    assert!(found_in(&other_chunk).is_empty());
}

#[test]
fn rule_skips_undefined_link_in_game_copy_of_chunk() {
    let (_tmp, files) = tree(
        &[(
            SKIN_BIN,
            &bin_linking("Characters/Aatrox/Skins/Clone", ABSENT),
        )],
        Some(FakeContent::with_bins(&[(
            SKIN_BIN,
            &bin_linking(SKIN, ABSENT),
        )])),
    );

    assert!(found_in(&files).is_empty());
}

#[test]
fn rule_reports_undefined_link_absent_from_game_copy() {
    let (_tmp, files) = tree(
        &[(SKIN_BIN, &bin_linking(SKIN, ABSENT))],
        Some(FakeContent::with_bins(&[(SKIN_BIN, &bin_declaring(SKIN))])),
    );

    assert_eq!(found_in(&files).len(), 1);
}

#[test]
fn rule_skips_null_link() {
    let bytes = bin(vec![
        BinObject::builder(h(SKIN), h("SkinCharacterDataProperties"))
            .property(h("resolver"), values::ObjectLink::new(BinHash(0)))
            .build(),
    ]);
    let (_tmp, files) = tree(&[(SKIN_BIN, &bytes)], Some(FakeContent::with_bins(&[])));

    assert!(found_in(&files).is_empty());
}

#[test]
fn rule_reports_link_at_every_depth() {
    let nested = values::Struct {
        class_hash: h("Part"),
        properties: [(h("inner"), link(ABSENT).into())].into_iter().collect(),
    };
    let lookup = values::Map::new(
        Kind::Hash,
        Kind::ObjectLink,
        vec![(values::Hash::new(h("weapon")).into(), link(ABSENT).into())],
    )
    .unwrap();
    let bytes = bin(vec![
        BinObject::builder(h(SKIN), h("SkinCharacterDataProperties"))
            .property(h("maybe"), values::Optional::from(Some(link(ABSENT))))
            .property(
                h("links"),
                values::Container::from(vec![link(SKIN), link(ABSENT)]),
            )
            .property(h("lookup"), lookup)
            .property(h("pointer"), nested.clone())
            .property(
                h("parts"),
                PropertyValueEnum::Container(vec![values::Embedded(nested)].into()),
            )
            .build(),
    ]);
    let (_tmp, files) = tree(&[(SKIN_BIN, &bytes)], Some(FakeContent::with_bins(&[])));

    let paths: Vec<String> = found_in(&files)
        .into_iter()
        .map(|problem| problem.site.node.expect("a node site").path)
        .collect();

    let field = |name: &str| format!("{:08x}", h(name).0);
    assert_eq!(
        paths,
        [
            field("maybe"),
            format!("{}[1]", field("links")),
            format!("{}{{{:08x}}}", field("lookup"), h("weapon").0),
            format!("{}.{}", field("pointer"), field("inner")),
            format!("{}[0].{}", field("parts"), field("inner")),
        ]
    );
}

#[test]
fn rule_reports_resource_map_link_as_info() {
    let map = values::Map::new(
        Kind::Hash,
        Kind::ObjectLink,
        vec![(values::Hash::new(h("weapon")).into(), link(ABSENT).into())],
    )
    .unwrap();
    let bytes = bin(vec![
        BinObject::builder(h(RESOURCES), RESOURCE_RESOLVER)
            .property(RESOURCE_MAP, map)
            .build(),
    ]);
    let (_tmp, files) = tree(&[(SKIN_BIN, &bytes)], Some(FakeContent::with_bins(&[])));

    let problems = found_in(&files);

    assert_eq!(problems.len(), 1);
    assert_eq!(problems[0].severity, ProblemSeverity::Info);
}

#[test]
fn rule_reports_same_site_for_archive_and_tree() {
    let bytes = bin_linking(SKIN, ABSENT);
    let (_tree, unpacked) = tree(&[(SKIN_BIN, &bytes)], Some(FakeContent::with_bins(&[])));

    let tmp = tempfile::tempdir().unwrap();
    let at = tmp.path().join("skin.fantome");
    make_packed_chunks_fantome_zip(&at, "Skin", &[(SKIN_BIN, &bytes)]);
    let packed = ProjectFiles::in_archive(
        &at,
        &Config::default(),
        Budget::repair(),
        &resolver_naming(&[SKIN_BIN]),
        Some(FakeContent::with_bins(&[])),
    )
    .unwrap();

    let in_tree = found_in(&unpacked);
    let in_archive = found_in(&packed);

    assert_eq!(in_archive.len(), 1);
    assert_eq!(in_archive[0].site, in_tree[0].site);
    assert_eq!(in_archive[0].message, in_tree[0].message);
}

#[test]
fn rule_reports_no_link_if_bin_is_unreadable() {
    let (_tmp, files) = tree(
        &[
            (SKIN_BIN, &bin_linking(SKIN, ABSENT)),
            (OTHER_BIN, b"PROP garbage that is not a bin"),
        ],
        Some(FakeContent::with_bins(&[])),
    );

    let (problems, failed) = files.report(&[&BinObjectLink::new()]).finish();

    assert!(problems.is_empty());
    assert_eq!(failed.len(), 1);
}

#[test]
fn rule_fails_if_game_objects_are_not_indexed() {
    let (_tmp, files) = tree(
        &[(SKIN_BIN, &bin_linking(SKIN, ABSENT))],
        Some(FakeContent::empty()),
    );

    let (problems, failed) = files.report(&[&BinObjectLink::new()]).finish();

    assert!(problems.is_empty());
    assert_eq!(failed.len(), 1);
    assert_eq!(failed[0].site, None);
}

#[test]
fn rule_is_dormant_without_install() {
    let (_tmp, files) = tree(&[(SKIN_BIN, &bin_linking(SKIN, ABSENT))], None);

    assert!(found_in(&files).is_empty());
    let dormancy = BinObjectLink::new()
        .dormant(&files)
        .expect("a dormancy without an install");
    assert_eq!(dormancy.waiting, "A League install");
}
