//! Builds the audio index of a few champion WADs of an installed client and prints its measures.
//!
//! The test measures the index and is not a gate. Run it with
//! `LTK_LOL_GAME_DIR=<Game directory> cargo test -p ltk-manager-audio --test live_index -- --ignored --nocapture`.
//! `LTK_AUDIO_CORPUS_CHAMPIONS` is a comma list of champion names, and defaults to the eight
//! champions of the bank back-reference research.

use std::collections::HashSet;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::Instant;

use fs_err::File;
use ltk_hash::{Hash as _, WadHash};
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_audio::{AudioIndex, BinAudio, ObjectId, SiteNames, contextual_names};
use ltk_wad::Wad;
use ltk_wwise::Bank;
use ltk_wwise::hierarchy::ObjectKind;

const GAME_DIR: &str = "LTK_LOL_GAME_DIR";
const CHAMPIONS: &str = "LTK_AUDIO_CORPUS_CHAMPIONS";
const DEFAULT_CHAMPIONS: &str = "Ahri,Annie,Yasuo,Jinx,Lux,Thresh,Ezreal,Sett";

/// Names nothing: the test reads no hash table, so no spell segment composes.
struct NoNames;

impl SiteNames for NoNames {
    fn locate(&self, _: &str) -> Option<AssetRef> {
        None
    }

    fn object_name(&self, _: u32) -> Option<String> {
        None
    }

    fn class_name(&self, _: u32) -> Option<String> {
        None
    }

    fn field_name(&self, _: u32) -> Option<String> {
        None
    }

    fn hash_name(&self, _: u32) -> Option<String> {
        None
    }
}

fn wads(game_dir: &Path, champions: &str) -> Vec<PathBuf> {
    let dir = game_dir.join("DATA/FINAL/Champions");
    champions
        .split(',')
        .map(str::trim)
        .flat_map(|champion| {
            [
                dir.join(format!("{champion}.wad.client")),
                dir.join(format!("{champion}.en_US.wad.client")),
            ]
        })
        .filter(|path| path.is_file())
        .collect()
}

/// Every chunk of `wads`, decompressed, with its path hash.
fn chunks(wads: &[PathBuf]) -> Vec<(WadHash, Vec<u8>)> {
    let mut all = Vec::new();
    for path in wads {
        let mut wad = Wad::mount(File::open(path).expect("open WAD")).expect("mount WAD");
        let listed = wad.chunks().as_slice().to_vec();
        for chunk in &listed {
            if let Ok(data) = wad.load_chunk_decompressed(chunk) {
                all.push((chunk.path_hash(), data.to_vec()));
            }
        }
    }
    all
}

fn build(chunks: &[(WadHash, Vec<u8>)], contextual: bool) -> AudioIndex {
    let mut builder = AudioIndex::builder();
    for (hash, data) in chunks {
        if !(data.starts_with(b"PROP") || data.starts_with(b"PTCH")) {
            continue;
        }
        let Ok(mut audio) = BinAudio::read(data) else {
            continue;
        };
        if !contextual {
            audio.contextual.clear();
        }
        builder.add_bin(&format!("{:016x}.bin", hash.0), audio);
    }
    builder.build()
}

#[test]
#[ignore = "reads an installed client named by LTK_LOL_GAME_DIR"]
fn live_index_measures() {
    let game_dir = std::env::var(GAME_DIR)
        .unwrap_or_else(|_| panic!("set {GAME_DIR} to the client's Game directory"));
    let champions = std::env::var(CHAMPIONS).unwrap_or_else(|_| DEFAULT_CHAMPIONS.to_owned());
    let wads = wads(Path::new(&game_dir), &champions);
    assert!(!wads.is_empty(), "no champion WADs under {game_dir}");
    let chunks = chunks(&wads);

    let started = Instant::now();
    let index = build(&chunks, true);
    let with = started.elapsed();
    let started = Instant::now();
    let without = build(&chunks, false);
    let without_elapsed = started.elapsed();

    let rules: usize = index
        .units()
        .iter()
        .filter_map(|unit| unit.holder.contextual)
        .collect::<HashSet<_>>()
        .iter()
        .filter_map(|object| index.contextual(*object))
        .map(|rules| rules.rules.len())
        .sum();
    let bytes = index.to_bytes("live").len();
    let bytes_without = without.to_bytes("live").len();
    println!(
        "{} units, {} contextual objects, {rules} linked rules",
        index.units().len(),
        index.contextual_count(),
    );
    println!(
        "index {bytes} bytes in {with:?}, {bytes_without} bytes in {without_elapsed:?} without rules"
    );

    let by_hash: std::collections::HashMap<WadHash, &Vec<u8>> =
        chunks.iter().map(|(hash, data)| (*hash, data)).collect();
    let mut paths: Vec<&str> = index
        .units()
        .iter()
        .flat_map(|unit| &unit.unit.bank_path)
        .map(String::as_str)
        .filter(|path| path.to_ascii_lowercase().ends_with("_events.bnk"))
        .collect();
    paths.sort_unstable();
    paths.dedup();

    let (mut events, mut indexed, mut composed) = (0, 0, 0);
    for path in paths {
        let Some(data) = by_hash.get(&WadHash::hash_str(path.to_ascii_lowercase())) else {
            continue;
        };
        let Ok(bank) = Bank::from_reader(&mut Cursor::new(data.as_slice())) else {
            continue;
        };
        let ids: HashSet<ObjectId> = bank
            .hierarchy()
            .into_iter()
            .flat_map(|hierarchy| hierarchy.of_kind(ObjectKind::EVENT))
            .map(|object| object.id())
            .collect();
        let units: Vec<_> = index.units_naming(path).collect();
        let contextual: HashSet<ObjectId> = contextual_names(&units, &[&index], &ids, &NoNames)
            .into_iter()
            .map(|found| found.event)
            .collect();

        events += ids.len();
        indexed += ids.iter().filter(|id| index.name(**id).is_some()).count();
        composed += ids
            .iter()
            .filter(|id| index.name(**id).is_none() && contextual.contains(id))
            .count();
    }
    println!(
        "{events} events: {indexed} named by the index, {composed} more by contextual rules without spell names"
    );
}
