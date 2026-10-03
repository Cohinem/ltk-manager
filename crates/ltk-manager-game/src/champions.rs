//! The champions an install ships, each read out of its own archive in `DATA/FINAL/Champions`.

use fs_err as fs;
use ltk_hash::{BinHash, Hash as _};
use ltk_manager_assets::preview::AssetRef;
use ltk_manager_base::error::AppResult;
use ltk_manager_base::utils::game::{GameDir, archive_stem};
use ltk_manager_base::utils::natural_order::compare_names;
use ltk_manager_bin::bin_document::{AssetLookup, GameCopy, RowNames};
use ltk_wad::{Wad, WadHash};
use parking_lot::Mutex;
use rayon::prelude::*;
use std::collections::HashMap;
use std::io::BufReader;
use std::path::Path;

/// The champion archives of an install, mounted to read each champion's record, base skin and
/// the icons they name.
///
/// A champion's own archive holds all of them, so a read through this needs neither the object
/// index nor the game index. An archive that does not mount or holds no character record, such
/// as `TFTChampion.wad.client`, is passed over.
pub struct ChampionArchives {
    archives: Vec<Archive>,
    /// The archive holding each champion's record and base skin, by object path hash, and the
    /// chunk each is declared in.
    objects: HashMap<BinHash, (usize, WadHash)>,
}

struct Archive {
    /// The champion the archive is named after, such as `MonkeyKing`.
    id: String,
    /// The archive's `DATA/FINAL`-relative name.
    wad: String,
    mount: Mutex<Wad<BufReader<fs::File>>>,
}

impl ChampionArchives {
    /// The unlocalized archives in `DATA/FINAL/Champions` under `game_dir`, mounted.
    ///
    /// # Errors
    ///
    /// Fails when the champions directory cannot be listed.
    pub fn mount(game_dir: &GameDir) -> AppResult<Self> {
        let mut archives: Vec<Archive> = game_dir
            .champion_archives()?
            .into_par_iter()
            .filter_map(|(name, path)| {
                let id = archive_stem(&name).to_owned();
                let wad = match mount(&path) {
                    Ok(wad) => wad,
                    Err(e) => {
                        tracing::warn!("Champions: passing over {}: {e}", path.display());
                        return None;
                    }
                };
                if !wad.chunks().contains(record_chunk(&id)) {
                    return None;
                }

                Some(Archive {
                    id,
                    wad: format!("Champions/{name}"),
                    mount: Mutex::new(wad),
                })
            })
            .collect();
        archives.sort_by(|a, b| compare_names(&a.id, &b.id));

        let objects = archives
            .iter()
            .enumerate()
            .flat_map(|(index, archive)| {
                let id = &archive.id;
                let folder = id.to_ascii_lowercase();
                [
                    (
                        format!("Characters/{id}/CharacterRecords/Root"),
                        record_chunk(id),
                    ),
                    (
                        format!("Characters/{id}/Skins/Skin0"),
                        WadHash::hash_str(format!("data/characters/{folder}/skins/skin0.bin")),
                    ),
                ]
                .map(|(object, chunk)| (BinHash::hash_str(object), (index, chunk)))
            })
            .collect();

        Ok(Self { archives, objects })
    }

    /// Each champion, as its archive names it, such as `Ahri` or `MonkeyKing`, in natural order.
    #[must_use]
    pub fn ids(&self) -> Vec<String> {
        self.archives
            .iter()
            .map(|archive| archive.id.clone())
            .collect()
    }

    /// The first archive whose chunk table holds `hash`, as an asset.
    fn holding(&self, hash: WadHash) -> Option<AssetRef> {
        let archive = self
            .archives
            .iter()
            .find(|archive| archive.mount.lock().chunks().contains(hash))?;

        Some(AssetRef::GameChunk {
            wad: archive.wad.clone(),
            path_hash: format!("{:016x}", hash.0),
        })
    }
}

/// The chunk declaring the record of the champion `id`.
fn record_chunk(id: &str) -> WadHash {
    let folder = id.to_ascii_lowercase();
    WadHash::hash_str(format!("data/characters/{folder}/{folder}.bin"))
}

fn mount(path: &Path) -> AppResult<Wad<BufReader<fs::File>>> {
    Ok(Wad::mount(BufReader::new(fs::File::open(path)?))?)
}

impl GameCopy for ChampionArchives {
    fn declaring_chunk(&self, entry: BinHash) -> AppResult<Option<Vec<u8>>> {
        let Some(&(index, hash)) = self.objects.get(&entry) else {
            return Ok(None);
        };

        let mut wad = self.archives[index].mount.lock();
        let Some(chunk) = wad.chunks().get(hash).copied() else {
            return Ok(None);
        };
        Ok(Some(wad.load_chunk_decompressed(&chunk)?.into_vec()))
    }

    fn with_names(&self, read: &mut dyn FnMut(&dyn RowNames)) {
        read(&());
    }
}

impl AssetLookup for ChampionArchives {
    fn locate(&self, path: &str) -> Option<AssetRef> {
        self.holding(WadHash::hash_str(path))
    }

    fn locate_chunk(&self, hash: WadHash) -> Option<AssetRef> {
        self.holding(hash)
    }
}

#[cfg(test)]
mod tests;
