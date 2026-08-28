use super::*;
use crate::mods::index::ModStorage;
use crate::mods::test_support::{
    make_named_fantome_zip, make_test_library, make_test_profile, place_installed_mod,
    place_mod_files,
};
use crate::mods::types::LibraryFolder;
use assert_matches::assert_matches;
use ltk_wad::NoResolver;

fn context(retain_archive: bool) -> InstallContext<'static> {
    InstallContext {
        resolver: &NoResolver,
        retain_archive,
    }
}

fn install(storage: &Path, archive: &Path, retain_archive: bool) -> AppResult<LibraryModEntry> {
    let mut index = LibraryIndex::default();
    let staged = stage_mod_package(storage, archive.to_str().unwrap(), &context(retain_archive))?;
    let mut taken = TakenSlugs::collect(&index, &storage.join("mods"));
    let (entry, _) = register_staged_mod(storage, &mut index, staged, &mut taken)?;
    Ok(entry)
}

/// Whatever a staging run leaves is a directory the startup sweep has to clear
/// and discovery has to ignore, so a refusal has to leave none.
fn staging_dirs(storage: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(storage.join("mods")) else {
        return Vec::new();
    };

    entries
        .flatten()
        .map(|entry| entry.file_name().into_string().unwrap())
        .filter(|name| name.starts_with(STAGING_PREFIX))
        .collect()
}

/// An unpacked tree past the limit is one the user's own tools could not open,
/// so the install is refused rather than written.
#[test]
fn an_install_past_the_path_limit_is_refused_and_stages_nothing() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("full.fantome");
    crate::mods::test_support::make_full_fantome_zip(&archive);

    let _limit = long_paths::test_limit::just_past(&storage.path().join("mods"), 20);
    let result = stage_mod_package(storage.path(), archive.to_str().unwrap(), &context(true))
        .map(|staged| staged.id);

    assert_matches!(result, Err(AppError::ValidationFailed(_)));
    assert_eq!(staging_dirs(storage.path()), Vec::<String>::new());
}

/// A staging directory is a uuid of a fixed length where a slug is whatever the
/// mod is called, so a name longer than the uuid lands the tree deeper than
/// staging ever held it. Measuring staging admits exactly what will not fit.
#[test]
fn an_install_is_measured_against_the_slug_not_the_staging_uuid() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("long-name.fantome");
    let name = "A Mod Whose Name Is Longer Than The Staging Uuid It Unpacks In";
    crate::mods::test_support::make_full_fantome_zip_named(&archive, name);

    let slug = ModSlug::assign(name, &TakenSlugs::default());
    let _limit =
        long_paths::test_limit::just_past(&storage.path().join("mods").join(slug.as_str()), 60);

    assert_matches!(
        install(storage.path(), &archive, false),
        Err(AppError::ValidationFailed(_))
    );

    let leftovers: Vec<String> = fs::read_dir(storage.path().join("mods"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(leftovers, Vec::<String>::new());
}

/// A preflight can only measure a packed WAD at the hex name a chunk gets when
/// nothing resolves it, so a resolver that names them writes paths it never
/// predicted. Clearing the estimate by twenty characters and still being
/// refused is the pass over the written tree doing what the estimate cannot.
#[test]
fn a_resolved_chunk_past_the_limit_is_caught_after_the_unpack() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("packed.fantome");
    crate::mods::test_support::make_long_chunk_fantome_zip(&archive);

    // Measured at the directory the mod actually lands in, so the slug's own
    // length is inside the estimate and only the resolved chunk is left to
    // explain a refusal.
    let mod_dir = storage
        .path()
        .join("mods")
        .join(ModSlug::assign("Long Chunk Mod", &TakenSlugs::default()).as_str());
    let predicted = long_paths::longest_fantome_import_path(&archive, &mod_dir).unwrap();

    let resolver =
        crate::mods::test_support::resolver_naming(&[crate::mods::test_support::LONG_CHUNK_PATH]);
    let context = InstallContext {
        resolver: &resolver,
        retain_archive: false,
    };

    let _limit = long_paths::test_limit::of(predicted + 20);
    let mut index = LibraryIndex::default();
    let result =
        stage_mod_package(storage.path(), archive.to_str().unwrap(), &context).and_then(|staged| {
            let mut taken = TakenSlugs::collect(&index, &storage.path().join("mods"));
            register_staged_mod(storage.path(), &mut index, staged, &mut taken).map(|(e, _)| e.id)
        });

    assert_matches!(result, Err(AppError::ValidationFailed(_)));
    assert_eq!(staging_dirs(storage.path()), Vec::<String>::new());
    assert!(!mod_dir.exists());
}

/// An extension nothing recognizes is read as a fantome, which is what
/// `stage_into` documents. Guessing modpkg instead records `Archive` on a mod
/// with no packed form to read, and a modpkg is not convertible, so nothing
/// afterwards can undo the guess.
#[test]
fn an_archive_whose_extension_names_nothing_is_read_as_a_fantome() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("renamed.bak");
    make_named_fantome_zip(&archive, "Renamed Mod");

    let entry = install(storage.path(), &archive, false).unwrap();

    assert_eq!(entry.format, ModArchiveFormat::Fantome);
    assert_eq!(entry.storage, ModStorage::Project);
    assert!(entry.format.is_convertible());
}

#[test]
fn staging_a_missing_file_fails_before_anything_is_written() {
    let storage = tempfile::tempdir().unwrap();
    let result = stage_mod_package(storage.path(), "/nonexistent/file.fantome", &context(true))
        .map(|staged| staged.id);
    assert_matches!(result, Err(AppError::InvalidPath(_)));
}

#[test]
fn a_staged_fantome_holds_its_content_tree_and_its_archive() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("full.fantome");
    crate::mods::test_support::make_full_fantome_zip(&archive);

    let staged =
        stage_mod_package(storage.path(), archive.to_str().unwrap(), &context(true)).unwrap();

    let base = staged.staging_dir.join("content").join("base");
    assert!(base.join("Aatrox.wad.client").is_dir());
    assert!(base.join("Ashe.wad.client").is_dir());
    assert!(base.join("raw").join("assets").is_dir());
    assert!(staged.staging_dir.join("mod.config.json").exists());

    let staged_archive = staged.staged_archive.as_ref().unwrap();
    assert!(staged_archive.is_file());
    assert_eq!(staged_archive.parent(), staged.staging_dir.parent());
}

/// Fantome tools routinely write CRC32 values that describe nothing, and a
/// reader that trusts them refuses the archive outright — which is the whole
/// install failing on a mod that is perfectly readable.
#[test]
fn a_fantome_installs_despite_checksums_that_describe_nothing() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("bad-crc.fantome");
    crate::mods::test_support::make_bad_crc_fantome_zip(&archive);

    let staged =
        stage_mod_package(storage.path(), archive.to_str().unwrap(), &context(true)).unwrap();

    let base = staged.staging_dir.join("content").join("base");
    assert_eq!(
        fs::read(base.join("Aatrox.wad.client/data/characters/aatrox/skins/skin01.bin")).unwrap(),
        b"aatrox skin bytes"
    );
    assert!(base.join("Ashe.wad.client").is_dir());
    assert_eq!(
        fs::read(base.join("raw/assets/maps/map11/scene.bin")).unwrap(),
        b"raw scene bytes"
    );
}

/// The retained archive is the only place a mod's own names survive until the
/// importer writes declared tables into the project's `hashes/`, so the copy
/// into the library is the preserve: names the resolver cannot recover are
/// embedded on the way in.
#[test]
fn staging_embeds_unrecoverable_names_in_the_retained_archive() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("full.fantome");
    crate::mods::test_support::make_full_fantome_zip(&archive);

    let staged =
        stage_mod_package(storage.path(), archive.to_str().unwrap(), &context(true)).unwrap();

    let staged_archive = staged.staged_archive.as_ref().unwrap();
    let mut reader =
        ltk_fantome::FantomeReader::new(fs::File::open(staged_archive).unwrap()).unwrap();
    let tables = reader.read_hashtables().unwrap();
    assert_eq!(tables.len(), 1);
    assert_eq!(
        tables[0].1.names().collect::<Vec<_>>(),
        ["data/characters/aatrox/skins/skin01.bin"]
    );
}

/// The community tables are the preserve's exclusions: a name they already
/// recover is not worth embedding, and a mod made only of such names keeps
/// its archive byte-identical to what the author shipped.
#[test]
fn a_mod_the_resolver_covers_keeps_its_archive_unrewritten() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("full.fantome");
    crate::mods::test_support::make_full_fantome_zip(&archive);

    let resolver =
        crate::mods::test_support::resolver_naming(&["data/characters/aatrox/skins/skin01.bin"]);
    let context = InstallContext {
        resolver: &resolver,
        retain_archive: true,
    };

    let staged = stage_mod_package(storage.path(), archive.to_str().unwrap(), &context).unwrap();

    assert_eq!(
        fs::read(staged.staged_archive.as_ref().unwrap()).unwrap(),
        fs::read(&archive).unwrap()
    );
}

#[test]
fn registering_puts_the_archive_beside_the_slug_directory() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("test.fantome");
    make_named_fantome_zip(&archive, "Kept Copy");

    let entry = install(storage.path(), &archive, true).unwrap();

    assert_eq!(
        entry.archive_path(storage.path()),
        storage.path().join("mods").join("kept-copy.fantome")
    );
    assert!(entry.archive_path(storage.path()).is_file());
}

/// The archive holds the name as firmly as the directory does, or the next mod
/// slugging the same way would inherit it.
#[test]
fn a_leftover_archive_keeps_its_slug_from_being_reused() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("test.fantome");
    make_named_fantome_zip(&archive, "Orphan");

    let mods_dir = storage.path().join("mods");
    fs::create_dir_all(&mods_dir).unwrap();
    fs::write(mods_dir.join("orphan.fantome"), b"leftover").unwrap();

    let entry = install(storage.path(), &archive, true).unwrap();
    assert_eq!(entry.slug.as_ref().unwrap().as_str(), "orphan-2");
    assert_eq!(
        fs::read(mods_dir.join("orphan.fantome")).unwrap(),
        b"leftover"
    );
}

/// Until the importer writes declared tables into the project's `hashes/`, a
/// rewritten archive is the only record of the embedded names — so a preserve
/// that embedded anything overrides retention being off, and the archive stays.
#[test]
fn a_rewritten_archive_is_kept_even_with_retention_off() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("full.fantome");
    crate::mods::test_support::make_full_fantome_zip(&archive);

    let entry = install(storage.path(), &archive, false).unwrap();

    let kept = entry.archive_path(storage.path());
    assert!(kept.is_file());
    let mut reader = ltk_fantome::FantomeReader::new(fs::File::open(&kept).unwrap()).unwrap();
    assert!(!reader.read_hashtables().unwrap().is_empty());
}

#[test]
fn retention_off_keeps_no_fantome_archive() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("test.fantome");
    make_named_fantome_zip(&archive, "Retention Off");

    let entry = install(storage.path(), &archive, false).unwrap();
    assert!(!entry.archive_path(storage.path()).exists());
    assert!(entry.is_present(storage.path()));
}

/// Names the preserve embedded survive the projectify: the unpacked tree holds
/// the declared table and the manifest names it, so the project carries its own
/// names wherever it goes next.
#[test]
fn harvested_names_land_in_the_projects_hashes_directory() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("full.fantome");
    crate::mods::test_support::make_full_fantome_zip(&archive);

    let entry = install(storage.path(), &archive, true).unwrap();

    let mod_dir = entry.mod_dir(storage.path());
    let table = fs::read_to_string(mod_dir.join("hashes").join("game.hashes.txt")).unwrap();
    assert!(table.contains("data/characters/aatrox/skins/skin01.bin"));

    let project = load_mod_project(&mod_dir).unwrap();
    assert_eq!(project.hashtables.len(), 1);
    assert_eq!(project.hashtables[0].path, "hashes/game.hashes.txt");
}

/// A packed WAD whose only name record is a bin inside it round-trips to a
/// named file: the preserve harvests the name into the archive's table, and
/// the import names the chunk from the mod's own table rather than hex.
#[test]
fn a_packed_chunk_named_only_by_its_own_bin_unpacks_under_that_name() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("packed.fantome");
    let recovered_path = "assets/custom/recovered.tex";
    crate::mods::test_support::make_bin_named_chunk_fantome_zip(&archive, recovered_path);

    let entry = install(storage.path(), &archive, true).unwrap();

    let wad_dir = entry
        .mod_dir(storage.path())
        .join("content")
        .join("base")
        .join("Ashe.wad.client");
    assert!(
        wad_dir.join("assets/custom/recovered.tex").is_file(),
        "chunk should unpack under its harvested name"
    );
}

/// What a preserve found outlives the import: the index remembers it, and the
/// mod the frontend receives carries it. A mod that preserved cleanly and one
/// that arrived already lossy are told apart by `unharvestable` alone.
#[test]
fn the_harvest_is_recorded_on_the_entry_and_the_installed_mod() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("full.fantome");
    crate::mods::test_support::make_full_fantome_zip(&archive);

    let installed = library
        .install_mod_from_package(&config, archive.to_str().unwrap())
        .unwrap();

    let expected = crate::mods::index::HarvestSummary {
        names_added: 1,
        unharvestable: 2,
    };
    assert_eq!(installed.harvest, Some(expected));
    library
        .with_index(&config, |_storage, index| {
            assert_eq!(index.mods[0].harvest, Some(expected));
            Ok(())
        })
        .unwrap();
}

#[test]
fn registering_moves_staging_into_the_slug_directory_and_records_the_mod() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("test.fantome");
    make_named_fantome_zip(&archive, "Dark Cosmic Jhin");

    let mut index = LibraryIndex::default();
    let staged =
        stage_mod_package(storage.path(), archive.to_str().unwrap(), &context(true)).unwrap();
    let mut taken = TakenSlugs::collect(&index, &storage.path().join("mods"));
    let (entry, installed) =
        register_staged_mod(storage.path(), &mut index, staged, &mut taken).unwrap();

    assert_eq!(entry.slug.as_ref().unwrap().as_str(), "dark-cosmic-jhin");
    assert!(
        entry
            .mod_dir(storage.path())
            .join("mod.config.json")
            .exists()
    );
    assert!(
        !storage
            .path()
            .join("mods")
            .join(format!("{STAGING_PREFIX}{}", entry.id))
            .exists()
    );

    assert_eq!(index.mods.len(), 1);
    assert_eq!(installed.display_name, "Dark Cosmic Jhin");
    assert!(installed.enabled);

    let profile = &index.profiles[0];
    assert_eq!(profile.mod_order, vec![entry.id.clone()]);
    assert_eq!(profile.enabled_mods, vec![entry.id.clone()]);
    assert!(index.folders[0].mod_ids.contains(&entry.id));
}

#[test]
fn two_mods_with_one_name_get_distinct_directories() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());

    let mut paths = Vec::new();
    for i in 0..3 {
        let archive = source.path().join(format!("copy-{i}.fantome"));
        make_named_fantome_zip(&archive, "Same Name");
        paths.push(archive.to_str().unwrap().to_string());
    }

    let result = library.install_mods_from_packages(&config, &paths).unwrap();
    assert!(result.failed.is_empty());
    assert_eq!(result.installed.len(), 3);

    let dirs: std::collections::HashSet<String> =
        result.installed.iter().map(|m| m.mod_dir.clone()).collect();
    assert_eq!(dirs.len(), 3);
}

#[test]
fn a_modpkg_always_keeps_its_archive() {
    let storage = tempfile::tempdir().unwrap();
    place_installed_mod(storage.path(), "packed", ModArchiveFormat::Modpkg, true);

    let entry =
        crate::mods::test_support::make_slugged_entry("id-1", "packed", ModArchiveFormat::Modpkg);
    assert!(entry.archive_path(storage.path()).exists());
}

#[test]
fn a_failed_stage_leaves_nothing_behind() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("corrupt.fantome");
    fs::write(&archive, b"not a zip").unwrap();

    assert!(stage_mod_package(storage.path(), archive.to_str().unwrap(), &context(true)).is_err());

    let leftovers: Vec<_> = fs::read_dir(storage.path().join("mods"))
        .into_iter()
        .flatten()
        .flatten()
        .collect();
    assert!(leftovers.is_empty(), "staging directory was left behind");
}

#[test]
fn uninstall_removes_the_mod_directory_and_scrubs_every_reference() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("test.fantome");
    make_named_fantome_zip(&archive, "Doomed");

    let installed = library
        .install_mod_from_package(&config, archive.to_str().unwrap())
        .unwrap();
    let mod_dir = PathBuf::from(&installed.mod_dir);
    let retained = storage.path().join("mods").join("doomed.fantome");
    assert!(mod_dir.is_dir());
    assert!(retained.is_file());

    library
        .set_mod_layers(
            &config,
            &installed.id,
            std::collections::HashMap::from([("base".to_string(), true)]),
        )
        .unwrap();

    library.uninstall_mod_by_id(&config, &installed.id).unwrap();

    assert!(!mod_dir.exists());
    assert!(!retained.exists());
    library
        .with_index(&config, |_storage, index| {
            assert!(index.mods.is_empty());
            assert!(index.profiles[0].mod_order.is_empty());
            assert!(index.profiles[0].enabled_mods.is_empty());
            assert!(index.profiles[0].layer_states.is_empty());
            assert!(index.folders[0].mod_ids.is_empty());
            Ok(())
        })
        .unwrap();
}

#[test]
fn uninstalling_a_legacy_entry_clears_both_of_its_old_paths() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());
    place_mod_files(storage.path(), "legacy", ModArchiveFormat::Modpkg);

    let entry = crate::mods::test_support::make_test_entry("legacy", ModArchiveFormat::Modpkg);
    seed_index(&library, &config, vec![entry.clone()]);

    library.uninstall_mod_by_id(&config, "legacy").unwrap();
    assert!(!entry.mod_dir(storage.path()).exists());
    assert!(!entry.archive_path(storage.path()).exists());
}

#[test]
fn uninstalling_a_faulted_entry_clears_its_quarantine() {
    let storage = tempfile::tempdir().unwrap();
    let (library, config) = make_test_library(storage.path());

    let mut entry = crate::mods::test_support::make_test_entry("broken", ModArchiveFormat::Fantome);
    let quarantine = entry.quarantine_dir(storage.path());
    fs::create_dir_all(&quarantine).unwrap();
    fs::write(quarantine.join("quarantine.json"), "{}").unwrap();
    entry.fault = Some(crate::mods::index::ModFault::ConversionFailed {
        error: "boom".to_string(),
        quarantine_dir: quarantine.display().to_string(),
    });
    seed_index(&library, &config, vec![entry]);

    library.uninstall_mod_by_id(&config, "broken").unwrap();
    assert!(!quarantine.exists());
}

/// Write an index holding exactly `mods`, with one profile that names them all.
fn seed_index(library: &ModLibrary, config: &Config, mods: Vec<LibraryModEntry>) {
    let ids: Vec<String> = mods.iter().map(|m| m.id.clone()).collect();
    let refs: Vec<&str> = ids.iter().map(String::as_str).collect();
    let index = LibraryIndex {
        version: 0,
        mods,
        profiles: vec![make_test_profile(
            "p1",
            "Default",
            refs.clone(),
            refs.clone(),
        )],
        active_profile_id: "p1".to_string(),
        folders: vec![LibraryFolder {
            id: ROOT_FOLDER_ID.to_string(),
            name: String::new(),
            mod_ids: ids,
        }],
        folder_order: vec![ROOT_FOLDER_ID.to_string()],
    };
    let storage_dir = library.storage_dir(config).unwrap();
    crate::mods::index::document::save_library_index(&storage_dir, &index).unwrap();
}

/// The importer resets an imported project to one default layer, which would
/// silently drop a fantome's own layers and every string override on them.
#[test]
fn a_fantome_keeps_the_layers_its_metadata_declares() {
    let storage = tempfile::tempdir().unwrap();
    let source = tempfile::tempdir().unwrap();
    let archive = source.path().join("layered.fantome");
    crate::mods::test_support::make_layered_fantome_zip(&archive);

    let entry = install(storage.path(), &archive, true).unwrap();
    let project = load_mod_project(&entry.mod_dir(storage.path())).unwrap();

    let names: Vec<&str> = project.layers.iter().map(|l| l.name.as_str()).collect();
    assert!(names.contains(&"base"), "the base layer is always present");
    assert!(names.contains(&"high_res"));

    let high_res = project
        .layers
        .iter()
        .find(|l| l.name == "high_res")
        .unwrap();
    assert_eq!(high_res.display_name.as_deref(), Some("High Res"));
    assert_eq!(
        high_res.string_overrides["en_us"]["game_character_displayname_Ashe"],
        "Frost Archer"
    );
}
