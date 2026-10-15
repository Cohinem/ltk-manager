//! Unit tests for object edits of a document that writes its own bytes: create, remove, undo
//! and the save.

use std::io::Cursor;

use fs_err as fs;
use ltk_hash::{BinHash, Hash as _};
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject};

use super::*;

const SYSTEM: &str = "Characters/Ahri/Skins/Skin0/Particles/Ahri_Q";

fn bytes_of(bin: &Bin) -> Vec<u8> {
    let mut out = Cursor::new(Vec::new());
    bin.to_writer(&mut out).unwrap();
    out.into_inner()
}

fn base() -> Vec<u8> {
    let system = BinObject::builder(
        BinHash::hash_str(SYSTEM),
        BinHash::hash_str("VfxSystemDefinitionData"),
    )
    .property(
        BinHash::hash_str("particlePath"),
        values::String::from(SYSTEM),
    )
    .property(BinHash::hash_str("selfIllumination"), values::F32::new(0.5))
    .build();
    bytes_of(&Bin::new([system], std::iter::empty::<&str>()))
}

fn clone_of_system() -> NewObject {
    NewObject::Clone {
        source: hex(BinHash::hash_str(SYSTEM)),
    }
}

#[test]
fn create_object_clones_an_object_of_an_owned_document() {
    let mut document = BinDocument::parse(base()).unwrap();

    let entry = document
        .create_object("Mods/Test/Ahri_Q2", &clone_of_system())
        .unwrap();

    let copy = document.object_at(entry).unwrap();
    assert_eq!(
        copy.class_hash,
        BinHash::hash_str("VfxSystemDefinitionData")
    );
    assert_eq!(copy.properties.len(), 2);
    assert!(document.is_dirty());
}

#[test]
fn create_object_refuses_a_name_the_document_holds() {
    let mut document = BinDocument::parse(base()).unwrap();

    let refused = document.create_object(SYSTEM, &clone_of_system());

    assert!(matches!(
        refused,
        Err(BinDocumentError::EditRejected {
            rejection: EditRejection::ObjectExists,
            ..
        })
    ));
}

#[test]
fn create_object_and_remove_object_undo_and_redo() {
    let mut document = BinDocument::parse(base()).unwrap();
    let entry = document
        .create_object(
            "Mods/Test/Blank",
            &NewObject::Class {
                class: "VfxSystemDefinitionData".to_owned(),
            },
        )
        .unwrap();

    assert!(document.undo().unwrap());
    assert!(document.object_at(entry).is_none());
    assert!(document.redo().unwrap());
    assert!(document.object_at(entry).is_some());

    let original = BinHash::hash_str(SYSTEM);
    document.remove_object(original).unwrap();
    assert!(document.object_at(original).is_none());
    assert!(document.undo().unwrap());
    assert_eq!(document.file.objects().get_index_of(&original), Some(0));
}

#[test]
fn a_save_appends_a_new_object_and_drops_a_removed_one() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("skin0.bin");
    fs::write(&path, base()).unwrap();
    let mut document = BinDocument::parse(base()).unwrap();

    let entry = document
        .create_object("Mods/Test/Ahri_Q2", &clone_of_system())
        .unwrap();
    document.remove_object(BinHash::hash_str(SYSTEM)).unwrap();
    document.save_to(&path).unwrap();

    let saved = BinDocument::parse(fs::read(&path).unwrap()).unwrap();
    let objects: Vec<BinHash> = saved.file.objects().keys().copied().collect();
    assert_eq!(objects, [entry]);
}

#[test]
fn create_object_refuses_a_copy_from_the_game() {
    let mut document = BinDocument::parse(base()).unwrap();

    let refused = document.create_object(
        "Mods/Test/Copy",
        &NewObject::Copy {
            source: hex(BinHash::hash_str(SYSTEM)),
        },
    );

    assert!(matches!(refused, Err(BinDocumentError::Declaring(_))));
}
