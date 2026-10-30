//! Decodes every media of a few champion WADs of an installed client and prints the counts.
//!
//! The test measures the decoder and is not a gate. Run it with
//! `LTK_LOL_GAME_DIR=<Game directory> cargo test -p ltk-manager-audio --test decode_corpus -- --ignored --nocapture`.
//! `LTK_AUDIO_CORPUS_CHAMPIONS` is a comma list of champion names, and defaults to `Ahri,Annie,Yasuo`.

use fs_err::File;
use std::collections::BTreeMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};

use ltk_manager_audio::{DecodeFailure, decode};
use ltk_wad::Wad;
use ltk_wwise::wem::WemInfo;
use ltk_wwise::{Bank, MountedPackage, SourceId};

/// The environment variable that names the `Game` directory of an installed client.
const GAME_DIR: &str = "LTK_LOL_GAME_DIR";

/// The environment variable that lists the champions to read.
const CHAMPIONS: &str = "LTK_AUDIO_CORPUS_CHAMPIONS";

#[derive(Debug, Default)]
struct Counts {
    decoded: u32,
    failed: u32,
}

fn wads(game_dir: &Path, champions: &str) -> Vec<PathBuf> {
    let dir = game_dir.join("DATA/FINAL/Champions");
    let mut wads = Vec::new();
    for champion in champions.split(',').map(str::trim) {
        for name in [
            format!("{champion}.wad.client"),
            format!("{champion}.en_US.wad.client"),
        ] {
            let path = dir.join(name);
            if path.is_file() {
                wads.push(path);
            }
        }
    }
    wads
}

/// Returns every media of the package or bank `data`, or nothing for another file.
fn media_of(data: &[u8]) -> Vec<(SourceId, Vec<u8>)> {
    if data.starts_with(b"r3d2") && data.get(4..8) == Some(&1u32.to_le_bytes()) {
        let Ok(mut package) = MountedPackage::mount(Cursor::new(data)) else {
            return Vec::new();
        };
        let entries = package.entries().to_vec();
        return entries
            .iter()
            .filter_map(|entry| {
                let source = entry.name().split('.').next()?.parse().ok()?;
                Some((SourceId(source), package.read(entry).ok()?))
            })
            .collect();
    }

    if data.starts_with(b"BKHD") {
        let Ok(bank) = Bank::from_reader(&mut Cursor::new(data)) else {
            return Vec::new();
        };
        return bank
            .media()
            .map(|media| {
                media
                    .iter()
                    .map(|(id, bytes)| (id, bytes.to_vec()))
                    .collect()
            })
            .unwrap_or_default();
    }

    Vec::new()
}

#[test]
#[ignore = "reads an installed client named by LTK_LOL_GAME_DIR"]
fn decode_corpus_counts() {
    let game_dir = std::env::var(GAME_DIR)
        .unwrap_or_else(|_| panic!("set {GAME_DIR} to the client's Game directory"));
    let champions = std::env::var(CHAMPIONS).unwrap_or_else(|_| "Ahri,Annie,Yasuo".to_owned());
    let wads = wads(Path::new(&game_dir), &champions);
    assert!(!wads.is_empty(), "no champion WADs under {game_dir}");

    let mut counts: BTreeMap<String, Counts> = BTreeMap::new();
    let mut failures = Vec::new();
    for wad_path in &wads {
        let file = File::open(wad_path).expect("open WAD");
        let mut wad = Wad::mount(file).expect("mount WAD");
        let chunks = wad.chunks().as_slice().to_vec();

        for chunk in &chunks {
            let Ok(data) = wad.load_chunk_decompressed(chunk) else {
                continue;
            };

            for (source, media) in media_of(&data) {
                let codec = WemInfo::from_bytes(&media).map_or_else(
                    |_| "not a WEM".to_owned(),
                    |info| format!("{:#06x}", info.codec.0),
                );
                let entry = counts.entry(codec).or_default();
                match decode(source, &media) {
                    Ok(_) => entry.decoded += 1,
                    Err(e) => {
                        entry.failed += 1;
                        if !matches!(e.reason, DecodeFailure::Codec(_)) {
                            failures.push(e.to_string());
                        }
                    }
                }
            }
        }
    }

    for (codec, count) in &counts {
        println!(
            "{codec}: {} decoded, {} failed",
            count.decoded, count.failed
        );
    }
    for failure in failures.iter().take(20) {
        println!("{failure}");
    }
}
