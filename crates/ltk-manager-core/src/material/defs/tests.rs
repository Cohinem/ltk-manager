use std::io::Cursor;

use ltk_meta::{Bin, BinObject};

use super::*;
use crate::material::tests::h;

fn bytes_of(objects: &[&str]) -> Vec<u8> {
    let mut bin = Bin::builder();
    for path in objects {
        bin = bin.object(BinObject::builder(h(path), h("CustomShaderDef")).build());
    }
    let mut out = Cursor::new(Vec::new());
    bin.build().to_writer(&mut out).unwrap();
    out.into_inner()
}

fn asset(path: &str) -> AssetRef {
    AssetRef::File {
        path: path.to_owned(),
    }
}

#[test]
fn the_same_bytes_answer_the_defs_already_parsed() {
    let cache = ShaderDefsCache::default();
    let shaders = asset("shaders.bin");

    let first = cache.defs(&shaders, bytes_of(&["Shaders/A"])).unwrap();
    let second = cache.defs(&shaders, bytes_of(&["Shaders/A"])).unwrap();

    assert!(Arc::ptr_eq(&first, &second));
}

#[test]
fn changed_bytes_are_parsed_again() {
    let cache = ShaderDefsCache::default();
    let shaders = asset("shaders.bin");

    let first = cache.defs(&shaders, bytes_of(&["Shaders/A"])).unwrap();
    let second = cache
        .defs(&shaders, bytes_of(&["Shaders/A", "Shaders/B"]))
        .unwrap();

    assert!(!Arc::ptr_eq(&first, &second));
    assert!(second.object_at(h("Shaders/B")).is_some());
}

#[test]
fn each_asset_keeps_its_own_defs() {
    let cache = ShaderDefsCache::default();
    let game = asset("game/shaders.bin");
    let project = asset("project/shaders.bin");

    let from_game = cache.defs(&game, bytes_of(&["Shaders/A"])).unwrap();
    cache.defs(&project, bytes_of(&["Shaders/B"])).unwrap();
    let again = cache.defs(&game, bytes_of(&["Shaders/A"])).unwrap();

    assert!(Arc::ptr_eq(&from_game, &again));
}

#[test]
fn bytes_that_are_no_bin_are_refused() {
    let cache = ShaderDefsCache::default();

    assert!(cache.defs(&asset("shaders.bin"), b"nope".to_vec()).is_err());
}
