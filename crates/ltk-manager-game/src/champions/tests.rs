use super::*;
use ltk_wad::{WadBuilder, WadChunkBuilder};
use std::io::Write as _;

const ICON: &str = "ASSETS/Characters/MonkeyKing/HUD/MonkeyKing_Square.tex";

fn build_wad(path: &Path, chunks: &[(&str, &[u8])]) {
    let mut builder = WadBuilder::default();
    let mut contents = HashMap::new();
    for (chunk_path, bytes) in chunks {
        builder = builder.with_chunk(WadChunkBuilder::default().with_path(*chunk_path));
        contents.insert(WadHash::hash_str(chunk_path), bytes.to_vec());
    }

    let mut file = fs::File::create(path).unwrap();
    builder
        .build_to_writer(&mut file, |path_hash, cursor| {
            cursor.write_all(&contents[&path_hash])?;
            Ok(())
        })
        .unwrap();
}

fn game() -> tempfile::TempDir {
    let game = tempfile::tempdir().unwrap();
    let champions = game.path().join("DATA").join("FINAL").join("Champions");
    fs::create_dir_all(&champions).unwrap();

    build_wad(
        &champions.join("MonkeyKing.wad.client"),
        &[
            ("data/characters/monkeyking/monkeyking.bin", b"record"),
            ("data/characters/monkeyking/skins/skin0.bin", b"skin"),
            (&ICON.to_lowercase(), b"icon"),
        ],
    );
    build_wad(
        &champions.join("Ahri.wad.client"),
        &[("data/characters/ahri/ahri.bin", b"ahri")],
    );
    build_wad(&champions.join("Ahri.en_US.wad.client"), &[]);
    build_wad(
        &champions.join("TFTChampion.wad.client"),
        &[("data/characters/tftchampion/skins/skin0.bin", b"skin")],
    );
    fs::write(champions.join("Broken.wad.client"), b"not a wad").unwrap();

    game
}

fn mounted(game: &tempfile::TempDir) -> ChampionArchives {
    ChampionArchives::mount(&GameDir::from_path(game.path())).unwrap()
}

#[test]
fn ids_are_the_unlocalized_archives_holding_a_record_in_natural_order() {
    let game = game();

    assert_eq!(mounted(&game).ids(), ["Ahri", "MonkeyKing"]);
}

#[test]
fn a_record_and_base_skin_read_from_the_champions_own_archive() {
    let game = game();
    let archives = mounted(&game);

    let record = BinHash::hash_str("Characters/MonkeyKing/CharacterRecords/Root");
    let skin = BinHash::hash_str("Characters/MonkeyKing/Skins/Skin0");
    assert_eq!(
        archives.declaring_chunk(record).unwrap().as_deref(),
        Some(&b"record"[..])
    );
    assert_eq!(
        archives.declaring_chunk(skin).unwrap().as_deref(),
        Some(&b"skin"[..])
    );
}

#[test]
fn an_object_the_archive_lacks_or_no_champion_names_reads_as_none() {
    let game = game();
    let archives = mounted(&game);

    let missing_skin = BinHash::hash_str("Characters/Ahri/Skins/Skin0");
    let other = BinHash::hash_str("Characters/Ahri/Skins/Skin1");
    assert_eq!(archives.declaring_chunk(missing_skin).unwrap(), None);
    assert_eq!(archives.declaring_chunk(other).unwrap(), None);
}

#[test]
fn an_icon_locates_in_the_archive_holding_it_in_any_case() {
    let game = game();
    let archives = mounted(&game);

    assert_eq!(
        archives.locate(ICON),
        Some(AssetRef::GameChunk {
            wad: "Champions/MonkeyKing.wad.client".to_owned(),
            path_hash: format!("{:016x}", WadHash::hash_str(ICON).0),
        })
    );
    assert_eq!(archives.locate("assets/missing.tex"), None);
}

#[test]
fn an_install_with_no_champions_directory_has_no_champions() {
    let game = tempfile::tempdir().unwrap();

    assert!(mounted(&game).ids().is_empty());
}
