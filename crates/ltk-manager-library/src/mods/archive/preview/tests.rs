use super::*;
use crate::mods::StorageLayout as _;
use crate::mods::index::ModArchiveFormat;
use ltk_manager_assets::test_util::{point_at_installed_build, silent_audio_bank};
use std::time::Duration;

use crate::mods::test_support::{
    make_slugged_entry, make_test_library, make_unpacked_entry,
    place_packed_chunks_archived_fantome, place_unpacked_mod, seed_library,
};

const SKIN: &str = "data/characters/aatrox/skins/skin2.bin";
const SKIN_BYTES: &[u8] = b"PROP skin bytes";
const BANK: &str =
    "assets/sounds/wwise2016/vo/en_us/characters/aatrox/skins/base/aatrox_base_vo_audio.bnk";

/// Points `config` at an install under `root` that ships the champion archives `champions`.
fn install_champions(config: &mut Config, root: &Path, champions: &[&str]) {
    point_at_installed_build(config, root);
    let dir = root.join("league/Game/DATA/FINAL/Champions");
    fs::create_dir_all(&dir).unwrap();
    for champion in champions {
        fs::write(dir.join(format!("{champion}.wad.client")), b"").unwrap();
    }
}

/// Seeds a library under `storage` with one Archive-storage fantome that ships `SKIN` in
/// `Aatrox.wad.client`.
fn skin_mod_library(storage: &Path, champions: &[&str]) -> (ModLibrary, Config) {
    let (library, mut config) = make_test_library(storage);
    install_champions(&mut config, storage, champions);
    place_packed_chunks_archived_fantome(
        storage,
        "skin-mod",
        &[(SKIN, SKIN_BYTES), (BANK, &silent_audio_bank())],
    );
    seed_library(
        &library,
        &config,
        vec![make_slugged_entry(
            "id-1",
            "skin-mod",
            ModArchiveFormat::Fantome,
        )],
    );

    (library, config)
}

fn files_under(dir: &Path) -> Vec<Vec<u8>> {
    let mut found = Vec::new();
    for entry in fs::read_dir(dir).unwrap().flatten() {
        if entry.path().is_dir() {
            found.extend(files_under(&entry.path()));
        } else {
            found.push(fs::read(entry.path()).unwrap());
        }
    }
    found
}

#[test]
fn mod_content_dir_unpacks_archive_storage_mod_once() {
    let storage = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    let (library, config) = skin_mod_library(storage.path(), &["Aatrox"]);

    let copy = library
        .mod_content_dir(&config, "id-1", cache.path())
        .unwrap();

    assert!(copy.starts_with(cache.path()));
    assert!(copy.join("mod.config.json").is_file());
    let wad = copy.join("content/base/aatrox.wad.client");
    assert_eq!(files_under(&wad), vec![SKIN_BYTES.to_vec()]);
    assert_eq!(
        library
            .mod_content_dir(&config, "id-1", cache.path())
            .unwrap(),
        copy
    );
}

#[test]
fn mod_content_dir_skips_archive_of_no_champion() {
    let storage = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    let (library, config) = skin_mod_library(storage.path(), &["Ahri"]);

    let copy = library
        .mod_content_dir(&config, "id-1", cache.path())
        .unwrap();

    assert!(copy.join("mod.config.json").is_file());
    assert!(!copy.join("content/base/aatrox.wad.client").exists());
}

#[test]
fn mod_content_dir_returns_mod_dir_for_project_storage_mod() {
    let storage = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_unpacked_mod(storage.path(), "skin-mod", false);
    seed_library(
        &library,
        &config,
        vec![make_unpacked_entry("id-1", "skin-mod")],
    );

    let dir = library
        .mod_content_dir(&config, "id-1", cache.path())
        .unwrap();

    assert_eq!(dir, storage.path().mods_dir().join("skin-mod"));
}

#[test]
fn join_plain_fails_for_escaping_path() {
    let root = Path::new("cache");

    assert!(join_plain(root, "../outside.bin").is_err());
    assert!(join_plain(root, "/outside.bin").is_err());
    assert_eq!(
        join_plain(root, "data/a.bin").unwrap(),
        root.join("data/a.bin")
    );
}

#[test]
fn named_by_kind_renames_hash_named_chunk() {
    assert_eq!(
        named_by_kind("0123456789abcdef.bin", LeagueFileKind::Png),
        "0123456789abcdef.png"
    );
    assert_eq!(
        named_by_kind("data/a.bin", LeagueFileKind::Png),
        "data/a.bin"
    );
}

#[test]
fn is_champion_archive_returns_false_for_locale_archive() {
    let champions = HashSet::from(["ahri".to_owned()]);

    assert!(is_champion_archive("Ahri.wad.client", &champions));
    assert!(!is_champion_archive("Ahri.en_US.wad.client", &champions));
    assert!(!is_champion_archive("Map11.wad.client", &champions));
}

#[test]
fn prune_keeps_most_recently_used_copies() {
    let cache = tempfile::tempdir().unwrap();
    let now = SystemTime::now();
    for (at, id) in ["old", "older", "recent", "kept"].iter().enumerate() {
        let copy = cache.path().join(id).join("4-0");
        fs::create_dir_all(&copy).unwrap();
        fs::write(copy.join("mod.config.json"), b"{}").unwrap();
        fs::File::options()
            .write(true)
            .open(copy.join("mod.config.json"))
            .unwrap()
            .set_modified(now - Duration::from_secs([20, 30, 10, 40][at]))
            .unwrap();
    }
    fs::create_dir_all(cache.path().join("unpacking/.staging-1")).unwrap();

    prune(cache.path(), "kept");

    let mut left: Vec<String> = fs::read_dir(cache.path())
        .unwrap()
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect();
    left.sort();
    assert_eq!(left, ["kept", "old", "recent", "unpacking"]);
}
