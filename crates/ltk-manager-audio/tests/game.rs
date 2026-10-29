//! The audio index read from the archives of an installed game.

mod common;

use common::fixture;
use ltk_hash::{Hash as _, WadHash};
use ltk_manager_assets::game_wads::GameArchives;
use ltk_manager_assets::test_util::place_game_wad;
use ltk_manager_audio::{GameFile, ObjectId, SourceId, read_game};
use ltk_manager_base::budget::Budget;
use ltk_manager_base::hashing::named;
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject};

const WAD: &str = "Map22.wad.client";
const BIN: &str = "data/maps/shipping/map22/map22.bin";
const PACKAGE: &str = "assets/sounds/wwise2016/sfx/shared/map22_sfx_audio.wpk";
const MEDIA: &str = "assets/sounds/wwise2016/sfx/shared/map22_sfx_audio.bnk";

fn bin_naming(event: &str) -> Vec<u8> {
    let system = BinObject::builder(1u32, named("VfxSystemDefinitionData"))
        .property(
            named("soundPersistentDefault"),
            values::String::new(event.to_owned()),
        )
        .build();
    let mut out = std::io::Cursor::new(Vec::new());
    Bin::new([system], std::iter::empty::<&str>())
        .to_writer(&mut out)
        .expect("write bin");
    out.into_inner()
}

fn file(path: &str) -> GameFile {
    GameFile {
        wad: WAD.to_owned(),
        path_hash: WadHash::hash_str(path).0,
        path: path.to_owned(),
    }
}

#[test]
fn read_game_indexes_bins_packages_and_media_banks_of_archives() {
    let root = tempfile::tempdir().unwrap();
    let bin = bin_naming("Play_sfx_Map22_Ambience");
    let package = fixture("package.wpk");
    let media = fixture("media_v145.bnk");
    place_game_wad(
        root.path(),
        WAD,
        &[(BIN, &bin), (PACKAGE, &package), (MEDIA, &media)],
    );
    let archives = GameArchives::at(&root.path().join("league").join("Game"));

    let index = read_game(
        &archives,
        &[file(BIN), file(PACKAGE), file(MEDIA)],
        2,
        &Budget::sweep(),
    );

    assert_eq!(
        index.name(ObjectId::from_name("Play_sfx_Map22_Ambience")),
        Some("Play_sfx_Map22_Ambience")
    );
    for source in common::packaged_sources() {
        assert!(index.uses_source(source), "{source:?}");
    }
    let banked = common::bank("media_v145.bnk");
    for (source, _) in banked.media().unwrap().iter() {
        assert!(index.uses_source(source), "{source:?}");
    }
    assert!(!index.uses_source(SourceId(1)));
}

#[test]
fn read_game_skips_archive_that_does_not_mount() {
    let root = tempfile::tempdir().unwrap();
    let archives = GameArchives::at(root.path());

    let index = read_game(&archives, &[file(BIN)], 1, &Budget::sweep());

    assert_eq!(index.name_count(), 0);
}
