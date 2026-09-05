//! Unit tests for the bin object index: the build over a synthetic install,
//! the search over it, and the slots the app keeps it in.

use super::*;
use crate::game_index::GameIndex;
use crate::game_wads::GameArchives;
use ltk_hash::Hash as _;
use ltk_hashdb::LayeredHashDb;
use ltk_meta::path::PropertyPath;
use ltk_meta::property::NoMeta;
use ltk_meta::property::values;
use ltk_meta::{Bin, BinObject, BinOverride, PropertyPatch};
use ltk_wad::{WadBuilder, WadChunkBuilder};
use std::collections::HashMap;
use std::fs;
use std::io::{Cursor, Write as _};
use tempfile::TempDir;

/// One chunk of a synthetic archive: its path and its bytes.
type Chunk<'a> = (&'a str, Vec<u8>);

/// The key the `game` table would file this path under.
fn path_hash(path: &str) -> u64 {
    crate::hashtables::Table::Game.key_config().hash(path)
}

/// A `PROP` declaring `objects`, each as `(object path, class name)`.
fn prop(objects: &[(&str, &str)]) -> Vec<u8> {
    let bin = Bin::<NoMeta>::new(
        objects
            .iter()
            .map(|(path, class)| BinObject::new(BinHash::hash_str(path), BinHash::hash_str(class))),
        std::iter::empty::<&str>(),
    );
    let mut out = Cursor::new(Vec::new());
    bin.to_writer(&mut out).unwrap();
    out.into_inner()
}

/// A `PTCH` adding `objects` and carrying one patch record on `patched`.
fn patch(objects: &[(&str, &str)], patched: &str) -> Vec<u8> {
    let mut bin = BinOverride::<NoMeta>::new();
    for (path, class) in objects {
        let object = BinObject::new(BinHash::hash_str(path), BinHash::hash_str(class));
        bin.objects.insert(object.path_hash, object);
    }
    bin.patches.push(PropertyPatch::new(
        BinHash::hash_str(patched),
        PropertyPath::new("mValue").unwrap(),
        values::U32::new(2),
    ));
    let mut out = Cursor::new(Vec::new());
    bin.to_writer(&mut out).unwrap();
    out.into_inner()
}

/// A game directory holding `wads`, each a list of chunks.
fn game_with(wads: &[(&str, &[Chunk<'_>])]) -> TempDir {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("DATA").join("FINAL");
    fs::create_dir_all(&dir).unwrap();

    for (name, chunks) in wads {
        let path = dir.join(name);
        let mut builder = WadBuilder::default();
        for (chunk_path, _) in *chunks {
            builder = builder.with_chunk(WadChunkBuilder::default().with_path(*chunk_path));
        }
        let mut file = fs::File::create(&path).unwrap();
        builder
            .build_to_writer(&mut file, |hash, cursor| {
                let bytes = chunks
                    .iter()
                    .find(|(chunk_path, _)| WadHash::hash_str(chunk_path) == hash)
                    .map(|(_, bytes)| bytes.as_slice())
                    .unwrap();
                cursor.write_all(bytes)?;
                Ok(())
            })
            .unwrap();
    }
    tmp
}

/// Every chunk path of `wads`, which is what the resolver names.
fn paths_of<'a>(wads: &[(&str, &'a [Chunk<'a>])]) -> Vec<&'a str> {
    wads.iter()
        .flat_map(|(_, chunks)| chunks.iter().map(|(path, _)| *path))
        .collect()
}

fn resolver_for(paths: &[&str]) -> LayeredHashDb {
    let mut resolver = LayeredHashDb::new();
    for path in paths {
        resolver.insert(path_hash(path), *path);
    }
    resolver
}

/// The object index over `wads`, built on `workers` threads, with no names.
fn build(wads: &[(&str, &[Chunk<'_>])], workers: usize) -> (TempDir, ObjectIndex) {
    let tmp = game_with(wads);
    let archives = GameArchives::at(tmp.path());
    let game = GameIndex::build(&archives, &resolver_for(&paths_of(wads))).unwrap();
    let index = ObjectIndex::build(&game, &archives, workers, &|| false).unwrap();
    (tmp, index)
}

/// Each row as `(object path, class name, declaring file)`, in row order.
fn declared(index: &ObjectIndex) -> Vec<(BinHash, BinHash, String)> {
    index
        .rows()
        .map(|(object, class, file)| (object, class, file.to_owned()))
        .collect()
}

fn row(object: &str, class: &str, file: &str) -> (BinHash, BinHash, String) {
    (
        BinHash::hash_str(object),
        BinHash::hash_str(class),
        file.to_owned(),
    )
}

#[test]
fn build_reads_a_prop_and_a_patch_and_skips_what_will_not_read() {
    let chunks: &[Chunk<'_>] = &[
        (
            "data/skin0.bin",
            prop(&[
                (
                    "characters/aatrox/skins/skin0",
                    "SkinCharacterDataProperties",
                ),
                (
                    "characters/aatrox/skins/skin0/resources",
                    "ResourceResolver",
                ),
            ]),
        ),
        (
            "data/patch.bin",
            patch(
                &[(
                    "characters/aatrox/skins/skin0/added",
                    "VfxSystemDefinitionData",
                )],
                "characters/aatrox/skins/skin0",
            ),
        ),
        ("data/texture.dds", vec![0xAA; 64]),
        (
            "data/broken.bin",
            b"PROP garbage that is not a bin".to_vec(),
        ),
    ];
    let (_tmp, index) = build(&[("Aatrox.wad.client", chunks)], 2);

    assert_eq!(
        declared(&index),
        [
            row(
                "characters/aatrox/skins/skin0/added",
                "VfxSystemDefinitionData",
                "data/patch.bin"
            ),
            row(
                "characters/aatrox/skins/skin0",
                "SkinCharacterDataProperties",
                "data/skin0.bin"
            ),
            row(
                "characters/aatrox/skins/skin0/resources",
                "ResourceResolver",
                "data/skin0.bin"
            ),
        ],
        "files in the game index's tree order, a patch's added objects as rows, its patch record not"
    );

    let stats = index.stats();
    assert_eq!(stats.archives, 1);
    assert_eq!(stats.files, 3, "every named .bin chunk, read or not");
    assert_eq!(stats.rows, 3);
    assert_eq!(stats.skipped, 1, "the chunk that would not read");
    assert_eq!(stats.workers, 1, "one archive is one job");
}

#[test]
fn an_object_two_files_declare_has_a_row_per_file_in_archive_order() {
    let first: &[Chunk<'_>] = &[("data/a.bin", prop(&[("characters/shared", "Shared")]))];
    let second: &[Chunk<'_>] = &[("data/b.bin", prop(&[("characters/shared", "Shared")]))];
    let (_tmp, index) = build(&[("B.wad.client", second), ("A.wad.client", first)], 2);

    assert_eq!(
        declared(&index),
        [
            row("characters/shared", "Shared", "data/a.bin"),
            row("characters/shared", "Shared", "data/b.bin"),
        ],
        "archives are read in name order and the rows land in that order"
    );
    assert_eq!(index.stats().workers, 2);
}

#[test]
fn a_build_that_was_called_off_stops_rather_than_finishing() {
    let chunks: &[Chunk<'_>] = &[("data/a.bin", prop(&[("characters/aatrox", "Character")]))];
    let tmp = game_with(&[("A.wad.client", chunks)]);
    let archives = GameArchives::at(tmp.path());
    let game = GameIndex::build(&archives, &resolver_for(&["data/a.bin"])).unwrap();

    let built = ObjectIndex::build(&game, &archives, 1, &|| true);
    assert!(built.is_err());
}

/// Names a test hands the index, in place of the mimir tables.
struct TestNames {
    entries: HashMap<BinHash, String>,
    classes: HashMap<BinHash, String>,
}

impl TestNames {
    fn over(entries: &[&str], classes: &[&str]) -> Self {
        Self {
            entries: entries
                .iter()
                .map(|path| (BinHash::hash_str(path), (*path).to_owned()))
                .collect(),
            classes: classes
                .iter()
                .map(|class| (BinHash::hash_str(class), (*class).to_owned()))
                .collect(),
        }
    }
}

impl ObjectNames for TestNames {
    fn for_each_entry(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        for (at, hash) in hashes.iter().enumerate() {
            if let Some(name) = self.entries.get(hash) {
                visit(at, name);
            }
        }
    }

    fn class(&self, hash: BinHash) -> Option<String> {
        self.classes.get(&hash).cloned()
    }
}

/// An index over `objects` as `(object path, class)`, all in one file, named.
fn named_index(objects: &[(&str, &str)]) -> (TempDir, ObjectIndex) {
    let chunks: &[Chunk<'_>] = &[("data/objects.bin", prop(objects))];
    let (tmp, index) = build(&[("Objects.wad.client", chunks)], 1);
    let paths: Vec<&str> = objects.iter().map(|(path, _)| *path).collect();
    let classes: Vec<&str> = objects.iter().map(|(_, class)| *class).collect();
    let index = index.named(&TestNames::over(&paths, &classes));
    (tmp, index)
}

/// The object path of each hit, in the order the search ranked them.
fn ranked(index: &ObjectIndex, query: &str) -> Vec<String> {
    index
        .search(query, || false)
        .hits
        .into_iter()
        .map(|hit| hit.path)
        .collect()
}

#[test]
fn search_ranks_the_last_segment_as_the_name() {
    let (_tmp, index) = named_index(&[
        (
            "characters/aatrox/skins/skin0/resources",
            "ResourceResolver",
        ),
        (
            "characters/aatrox/skins/skin0",
            "SkinCharacterDataProperties",
        ),
        ("characters/aatrox/old_skin0", "SkinCharacterDataProperties"),
    ]);

    assert_eq!(
        ranked(&index, "skin0"),
        [
            "characters/aatrox/skins/skin0",
            "characters/aatrox/old_skin0",
            "characters/aatrox/skins/skin0/resources",
        ],
        "a segment the query opens, then one holding it, then a match reaching the path"
    );
}

#[test]
fn search_marks_the_match_on_the_whole_object_path() {
    let (_tmp, index) = named_index(&[("characters/aatrox/skins/skin0", "Skin")]);

    let hit = &index.search("skin0", || false).hits[0];
    let marked: Vec<&str> = hit
        .ranges
        .iter()
        .map(|&(start, end)| &hit.path[start as usize..end as usize])
        .collect();
    assert_eq!(marked, ["skin0"]);
    assert_eq!(hit.band, 0);
}

#[test]
fn search_names_the_class_and_the_declaring_file() {
    let (_tmp, index) = named_index(&[(
        "characters/aatrox/skins/skin0",
        "SkinCharacterDataProperties",
    )]);

    let hit = &index.search("aatrox", || false).hits[0];
    assert_eq!(hit.class, "SkinCharacterDataProperties");
    assert_eq!(hit.file, "data/objects.bin");
    assert_eq!(
        hit.file_hash,
        format!("{:016x}", path_hash("data/objects.bin"))
    );
    assert_eq!(hit.wad, "Objects.wad.client");
    assert_eq!(
        hit.object_hash,
        hex(BinHash::hash_str("characters/aatrox/skins/skin0"))
    );
}

#[test]
fn search_obeys_the_shared_ranking_fixture() {
    #[derive(serde::Deserialize)]
    struct Fixture {
        cases: Vec<Case>,
    }
    #[derive(serde::Deserialize)]
    struct Case {
        name: String,
        query: String,
        expect: Vec<String>,
        #[serde(default)]
        reject: Vec<String>,
    }

    let raw =
        include_str!("../../../../src/modules/workshop/palette/__tests__/ranking.fixture.json");
    let fixture: Fixture = serde_json::from_str(raw).unwrap();

    for case in fixture.cases {
        let held: Vec<(&str, &str)> = case
            .expect
            .iter()
            .chain(case.reject.iter())
            .map(|path| (path.as_str(), "Object"))
            .collect();
        let (_tmp, index) = named_index(&held);

        assert_eq!(ranked(&index, &case.query), case.expect, "{}", case.name);
    }
}

#[test]
fn eight_hex_digits_find_the_object_by_hash() {
    let (_tmp, index) = named_index(&[
        ("characters/aatrox/skins/skin0", "Skin"),
        ("characters/ahri/skins/skin0", "Skin"),
    ]);
    let wanted = BinHash::hash_str("characters/ahri/skins/skin0");

    assert_eq!(
        ranked(&index, &format!("{:08x}", wanted.0)),
        ["characters/ahri/skins/skin0"]
    );
    assert_eq!(
        ranked(&index, &hex(wanted)),
        ["characters/ahri/skins/skin0"],
        "with the 0x too"
    );
    assert_eq!(
        ranked(&index, &format!("{:08X}", wanted.0)),
        ["characters/ahri/skins/skin0"],
        "either case"
    );
}

#[test]
fn an_object_no_table_names_reads_as_its_hex_and_answers_to_its_hash_alone() {
    let chunks: &[Chunk<'_>] = &[(
        "data/objects.bin",
        prop(&[("characters/secret", "Skin"), ("characters/known", "Skin")]),
    )];
    let (_tmp, index) = build(&[("Objects.wad.client", chunks)], 1);
    let index = index.named(&TestNames::over(&["characters/known"], &[]));
    let secret = BinHash::hash_str("characters/secret");

    let result = index.search("characters", || false);
    assert_eq!(
        result.hits.len(),
        1,
        "a text query never reaches an unnamed object"
    );
    assert!(
        !result.unnamed,
        "one name is enough to say the table is there"
    );

    let hit = &index.search(&hex(secret), || false).hits[0];
    assert_eq!(hit.path, hex(secret));
    assert_eq!(
        hit.class,
        hex(BinHash::hash_str("Skin")),
        "a class no table names reads as its hex"
    );
}

#[test]
fn an_index_no_table_names_says_so() {
    let chunks: &[Chunk<'_>] = &[("data/objects.bin", prop(&[("characters/aatrox", "Skin")]))];
    let (_tmp, index) = build(&[("Objects.wad.client", chunks)], 1);

    let result = index.search("aatrox", || false);
    assert!(result.hits.is_empty());
    assert!(result.unnamed);
}

#[test]
fn an_empty_query_matches_nothing() {
    let (_tmp, index) = named_index(&[("characters/aatrox", "Skin")]);
    assert!(ranked(&index, "  ").is_empty());
}

#[test]
fn naming_again_keeps_the_rows_and_replaces_the_names() {
    let chunks: &[Chunk<'_>] = &[("data/objects.bin", prop(&[("characters/aatrox", "Skin")]))];
    let (_tmp, index) = build(&[("Objects.wad.client", chunks)], 1);
    let index = index.named(&TestNames::over(&[], &[]));
    assert!(index.search("aatrox", || false).hits.is_empty());

    let index = index.named(&TestNames::over(&["characters/aatrox"], &["Skin"]));
    assert_eq!(ranked(&index, "aatrox"), ["characters/aatrox"]);
    assert_eq!(index.stats().rows, 1);
}

mod state {
    use super::*;

    fn ready() -> ObjectIndex {
        let chunks: &[Chunk<'_>] = &[("data/objects.bin", prop(&[("characters/aatrox", "Skin")]))];
        let (_tmp, index) = build(&[("Objects.wad.client", chunks)], 1);
        index
    }

    #[test]
    fn a_state_starts_absent_and_a_build_moves_it_through_building_to_ready() {
        let state = ObjectIndexState::<String>::default();
        assert!(matches!(
            state.snapshot().unwrap(),
            ObjectIndexSnapshot::Absent
        ));

        let ticket = state.begin().unwrap().expect("nothing is building");
        assert!(matches!(
            state.snapshot().unwrap(),
            ObjectIndexSnapshot::Building
        ));
        assert!(state.is_current(ticket));
        assert!(state.begin().unwrap().is_none(), "one build at a time");

        state.finish(ticket, Ok(ready())).unwrap();
        assert!(matches!(
            state.snapshot().unwrap(),
            ObjectIndexSnapshot::Ready(_)
        ));
        assert!(
            state.begin().unwrap().is_none(),
            "a ready index is not rebuilt unasked"
        );
    }

    #[test]
    fn a_failed_build_is_reported_and_can_be_retried() {
        let state = ObjectIndexState::<String>::default();
        let ticket = state.begin().unwrap().unwrap();
        state.finish(ticket, Err("no install".to_owned())).unwrap();

        match state.snapshot().unwrap() {
            ObjectIndexSnapshot::Failed(error) => assert_eq!(error, "no install"),
            other => panic!("expected a failure, got {other:?}"),
        }
        assert!(
            state.begin().unwrap().is_some(),
            "a failure is retried by the next warm"
        );
    }

    #[test]
    fn clearing_drops_the_index_and_the_result_of_a_build_still_running() {
        let state = ObjectIndexState::<String>::default();
        let ticket = state.begin().unwrap().unwrap();

        state.clear().unwrap();
        assert!(
            !state.is_current(ticket),
            "the running build is told to stop"
        );
        assert!(matches!(
            state.snapshot().unwrap(),
            ObjectIndexSnapshot::Absent
        ));

        state.finish(ticket, Ok(ready())).unwrap();
        assert!(
            matches!(state.snapshot().unwrap(), ObjectIndexSnapshot::Absent),
            "a result arriving after a clear is dropped"
        );
    }

    #[test]
    fn a_newer_build_outranks_the_result_of_an_older_one() {
        let state = ObjectIndexState::<String>::default();
        let old = state.begin().unwrap().unwrap();
        state.clear().unwrap();
        let new = state.begin().unwrap().unwrap();

        state.finish(old, Err("late".to_owned())).unwrap();
        assert!(matches!(
            state.snapshot().unwrap(),
            ObjectIndexSnapshot::Building
        ));

        state.finish(new, Ok(ready())).unwrap();
        assert!(matches!(
            state.snapshot().unwrap(),
            ObjectIndexSnapshot::Ready(_)
        ));
    }

    #[test]
    fn renaming_touches_a_ready_index_alone() {
        let state = ObjectIndexState::<String>::default();
        state
            .rename(|index| index.named(&TestNames::over(&[], &[])))
            .unwrap();
        assert!(matches!(
            state.snapshot().unwrap(),
            ObjectIndexSnapshot::Absent
        ));

        let ticket = state.begin().unwrap().unwrap();
        state.finish(ticket, Ok(ready())).unwrap();
        state
            .rename(|index| index.named(&TestNames::over(&["characters/aatrox"], &["Skin"])))
            .unwrap();

        let ObjectIndexSnapshot::Ready(index) = state.snapshot().unwrap() else {
            panic!("renaming keeps the index ready");
        };
        assert_eq!(ranked(&index, "aatrox"), ["characters/aatrox"]);
    }
}

#[test]
fn a_hash_still_finds_its_object_in_an_index_no_table_names() {
    let chunks: &[Chunk<'_>] = &[("data/objects.bin", prop(&[("characters/aatrox", "Skin")]))];
    let (_tmp, index) = build(&[("Objects.wad.client", chunks)], 1);
    let aatrox = BinHash::hash_str("characters/aatrox");

    let result = index.search(&hex(aatrox), || false);
    assert_eq!(result.hits.len(), 1, "the lookup needs no name");
    assert_eq!(result.hits[0].path, hex(aatrox));
    assert!(
        result.unnamed,
        "and the caller is still told the table is missing"
    );
}
