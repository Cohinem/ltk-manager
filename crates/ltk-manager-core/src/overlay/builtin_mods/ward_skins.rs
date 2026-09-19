//! The built-in mod that shows every ward in its own base skin, per ADR-0043.

use super::BuiltinMod;
use super::project::GeneratedProject;
use crate::error::AppResult;
use crate::utils::game::GameDir;
use fs_err as fs;
use ltk_wad::{Wad, WadHash};
use std::io::BufReader;
use std::path::Path;

/// What each ward skin bin is replaced with. No bin starts with these four bytes.
const JUNK: &[u8] = b"JUNK";

/// The highest skin id looked for, a margin over the 267 the game ships at 16.18.
const MAX_SKIN_ID: u32 = 511;

/// The project breaking every ward skin bin the map archives under `game_dir` hold.
///
/// A map archive that does not mount is passed over, as the overlay build passes over it.
///
/// # Errors
///
/// Fails when the maps directory cannot be listed.
pub(super) fn project(game_dir: &GameDir) -> AppResult<GeneratedProject> {
    let skin_bins: Vec<(String, WadHash)> = (1..=MAX_SKIN_ID)
        .map(|id| {
            let path = format!("data/characters/sightward/skins/skin{id}.bin");
            let hash = WadHash::from(path.as_str());
            (path, hash)
        })
        .collect();

    let mut project =
        GeneratedProject::new(BuiltinMod::DefaultWardSkins.slug(), "Default ward skins");
    for (name, path) in game_dir.map_archives()? {
        let wad = match mount(&path) {
            Ok(wad) => wad,
            Err(e) => {
                tracing::warn!("Default ward skins: passing over {}: {e}", path.display());
                continue;
            }
        };
        for (skin_bin, hash) in &skin_bins {
            if wad.chunks().contains(*hash) {
                project.insert(&name, skin_bin, JUNK);
            }
        }
    }
    Ok(project)
}

fn mount(path: &Path) -> AppResult<Wad<BufReader<fs::File>>> {
    Ok(Wad::mount(BufReader::new(fs::File::open(path)?))?)
}
