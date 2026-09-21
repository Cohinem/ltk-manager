use std::collections::HashMap;

use ltk_game_data::{Selector, load_declarations};
use ltk_meta::property::{Kind, values};
use ltk_meta::{Bin, BinObject, PropertyValueEnum};

use super::super::tests::{Game, SKIN, declared, h, manifest, project};
use super::super::{DeclareContext, DeclaredDiagnosticKind, SkipReason};
use super::*;
use crate::meta_schema::{self, PatchSchema};

const RESOURCES: &str = "Characters/Teemo/Skins/Skin0/Resources";
const JADE: &str = "Characters/Jade_Teemo/Skins/Skin0/Resources";
const CHUNK: &str = "data/characters/teemo/skins/skin0.bin";
const NAMES: [&str; 8] = [
    RESOURCES,
    JADE,
    "resourceMap",
    "Teemo_Q",
    "Teemo_R",
    "Particles/Q",
    "Particles/R",
    "Particles/Jade_R",
];

fn field(name: &str) -> String {
    format!("{:08x}", *h(name))
}

fn link(key: &str, target: &str) -> (PropertyValueEnum, PropertyValueEnum) {
    (
        values::Hash::new(h(key)).into(),
        values::ObjectLink::new(h(target)).into(),
    )
}

/// A chunk holding `entry` with a resource map of `links`.
fn resources(entry: &str, links: &[(&str, &str)]) -> Vec<u8> {
    let entries = links
        .iter()
        .map(|(key, target)| link(key, target))
        .collect();
    let object = BinObject::builder(h(entry), h("ResourceResolver"))
        .property(
            h("resourceMap"),
            values::Map::new(Kind::Hash, Kind::ObjectLink, entries).unwrap(),
        )
        .build();
    let mut bytes = std::io::Cursor::new(Vec::new());
    Bin::builder()
        .object(object)
        .build()
        .to_writer(&mut bytes)
        .unwrap();
    bytes.into_inner()
}

/// The resources of Teemo as a declared document, over a game that also declares Jade Teemo.
fn teemo(dir: &std::path::Path) -> BinDocument {
    let jade = resources(JADE, &[("Teemo_R", "Particles/Jade_R")]);
    let context = DeclareContext {
        project: project(dir),
        schema: PatchSchema::new(meta_schema::shared(None), None),
        game: Game::declaring(&NAMES, HashMap::from([(h(JADE), jade)])),
    };
    let game = resources(
        RESOURCES,
        &[("Teemo_Q", "Particles/Q"), ("Teemo_R", "Particles/R")],
    );
    BinDocument::declare(game, ltk_game_data::path_hash(CHUNK), context).unwrap()
}

#[test]
fn a_leaf_copies_as_a_module_that_loads_to_one_set() {
    let dir = tempfile::tempdir().unwrap();
    let document = declared(project(dir.path()));
    let path = format!(
        "{}.{}",
        field("skinMeshProperties"),
        field("selfIllumination")
    );
    let names = Game::naming(&[SKIN, "skinMeshProperties", "selfIllumination"]);

    let copied = document.row_declaration(h(SKIN), &path, &*names).unwrap();

    assert_eq!(
        copied.reference.as_deref(),
        Some("Characters/Teemo/Skins/Skin0:skinMeshProperties.selfIllumination")
    );
    let module = copied.declaration.expect("a leaf copies as a declaration");
    let indented: String = module.lines().map(|line| format!("  {line}\n")).collect();
    let loaded = load_declarations(
        "game_data.yaml",
        &format!("version: 1\nmodules:\n{indented}"),
        |_| unreachable!(),
    )
    .unwrap();
    let Selector::Entries(entries) = &loaded.modules[0].selector else {
        panic!("the module is an entries module");
    };
    assert_eq!(loaded.modules.len(), 1);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].properties.len(), 1);
    assert_eq!(entries[0].properties[0].value, Value::Float(0.0));
}

#[test]
fn a_struct_holding_a_nameless_field_copies_its_reference_alone() {
    let dir = tempfile::tempdir().unwrap();
    let document = declared(project(dir.path()));
    /* `texture` is left out of the names, so the embed holds a field nothing spells. */
    let names = Game::naming(&[SKIN, "skinMeshProperties", "selfIllumination"]);

    let copied = document
        .row_declaration(h(SKIN), &field("skinMeshProperties"), &*names)
        .unwrap();

    assert_eq!(copied.declaration, None);
    assert_eq!(
        copied.reference.as_deref(),
        Some("Characters/Teemo/Skins/Skin0:skinMeshProperties")
    );
    assert_eq!(
        document.row_declaration(h(SKIN), "", &*names).unwrap(),
        RowDeclaration::default()
    );
    assert_eq!(
        document
            .row_declaration(h(SKIN), "12345678", &*names)
            .unwrap(),
        RowDeclaration::default()
    );
}

#[test]
fn a_merged_reference_adds_the_games_copy_of_another_entry() {
    let dir = tempfile::tempdir().unwrap();
    let mut document = teemo(dir.path());
    let reference = format!("{JADE}:resourceMap");

    document
        .declare_reference(h(RESOURCES), &field("resourceMap"), &reference, true)
        .unwrap();

    assert!(
        manifest(dir.path(), "base").contains(&format!("+resourceMap: !ref \"{reference}\"")),
        "{}",
        manifest(dir.path(), "base")
    );
    let object = document.object_at(h(RESOURCES)).unwrap();
    let Some(PropertyValueEnum::Map(map)) = object.properties.get(&h("resourceMap")) else {
        panic!("the map is a map");
    };
    assert_eq!(map.entries().len(), 2);
    assert!(map.entries().contains(&link("Teemo_Q", "Particles/Q")));
    assert!(map.entries().contains(&link("Teemo_R", "Particles/Jade_R")));
    let state = document.declared_state().unwrap();
    assert_eq!(
        state.marks[0].reference.as_deref(),
        Some(reference.as_str())
    );

    assert!(document.undo().unwrap());
    assert!(!dir.path().join("content/base/game_data.yaml").exists());
}

#[test]
fn a_pasted_reference_the_game_lacks_draws_its_reason_on_the_row() {
    let dir = tempfile::tempdir().unwrap();
    let mut document = teemo(dir.path());

    document
        .declare_reference(
            h(RESOURCES),
            &field("resourceMap"),
            "Characters/Nobody/Resources:resourceMap",
            false,
        )
        .unwrap();

    let state = document.declared_state().unwrap();
    let skipped = state
        .diagnostics
        .iter()
        .find(|diagnostic| diagnostic.kind == DeclaredDiagnosticKind::PropertyEditSkipped)
        .expect("the reference is skipped");
    assert_eq!(skipped.reason, Some(SkipReason::ReferenceMissingEntry));
    assert_eq!(skipped.path, field("resourceMap"));
}

#[test]
fn text_that_is_no_reference_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let mut document = teemo(dir.path());

    assert!(matches!(
        document.declare_reference(h(RESOURCES), &field("resourceMap"), "nocolon", false),
        Err(BinDocumentError::Declaring(_))
    ));
    assert!(!dir.path().join("content/base/game_data.yaml").exists());
}
