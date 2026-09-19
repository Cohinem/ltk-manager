//! The skin bins the mods below a built-in mod ship, read once per mod content and layer
//! selection.

use super::game_skins::GameSkins;
use super::skin_bin::SkinBin;
use crate::error::AppResult;
use camino::{Utf8Path, Utf8PathBuf};
use fs_err as fs;
use ltk_overlay::{ContentHash, EnabledMod};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, btree_map};
use std::path::Path;

/// The file in a built-in mod's cache directory holding what each mod held when last read.
const CACHE_FILE: &str = "shipped-skins.json";

/// The skin bins the mods below a built-in mod ship, per ADR-0043, readable out of the mod.
///
/// A mod ships a skin bin when a layer it has turned on holds the bin with bytes other than the
/// game's. A bin two mods ship is the first one's, as in the overlay.
pub(super) struct ModSkins<'m> {
    mods: &'m mut [EnabledMod],
    shipped: BTreeMap<SkinBin, Shipped>,
}

/// Where one mod holds a skin bin it ships.
struct Shipped {
    /// The mod's index in the mods the skin bins were read out of.
    mod_index: usize,
    file: ModFile,
}

/// Where a mod holds a file, to read it again.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
enum ModFile {
    Layer {
        layer: String,
        wad: String,
        rel_path: Utf8PathBuf,
    },
    Raw {
        rel_path: Utf8PathBuf,
    },
}

/// What each mod held when last read, under any profile, named against that read's roster.
#[derive(Debug, Default, Serialize, Deserialize)]
struct Cache {
    roster: Vec<String>,
    mods: BTreeMap<String, CachedMod>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CachedMod {
    fingerprint: u64,
    skin_bins: Vec<(SkinBin, ContentHash, ModFile)>,
}

impl<'m> ModSkins<'m> {
    /// Every skin bin one of `mods` ships over `game`, caching what each mod holds in
    /// `cache_dir`.
    ///
    /// A mod whose [`EnabledMod::cache_fingerprint`] matches the cache is not read again, and a
    /// mod that cannot be read is passed over, since the overlay build reports it.
    pub(super) fn load(
        mods: &'m mut [EnabledMod],
        game: &mut GameSkins<'_>,
        cache_dir: &Path,
    ) -> Self {
        let path = cache_dir.join(CACHE_FILE);
        let mut cache = read_cache(&path)
            .filter(|cache| cache.roster == game.roster())
            .unwrap_or_else(|| Cache {
                roster: game.roster().to_vec(),
                mods: BTreeMap::new(),
            });
        let mut changed = false;

        let mut held = BTreeMap::new();
        for (mod_index, enabled_mod) in mods.iter_mut().enumerate() {
            let fingerprint = enabled_mod.cache_fingerprint();
            let cached = fingerprint.and_then(|fingerprint| {
                cache
                    .mods
                    .get(&enabled_mod.id)
                    .filter(|cached| cached.fingerprint == fingerprint)
            });
            let skin_bins = match cached {
                Some(cached) => cached.skin_bins.clone(),
                None => match skin_bins_of(enabled_mod, game) {
                    Ok(skin_bins) => skin_bins,
                    Err(e) => {
                        tracing::warn!("Built-in mods: passing over mod {}: {e}", enabled_mod.id);
                        continue;
                    }
                },
            };

            for (bin, content, file) in &skin_bins {
                if let btree_map::Entry::Vacant(entry) = held.entry(bin.clone()) {
                    entry.insert((
                        *content,
                        Shipped {
                            mod_index,
                            file: file.clone(),
                        },
                    ));
                }
            }
            if cached.is_none() {
                changed = true;
                match fingerprint {
                    Some(fingerprint) => cache.mods.insert(
                        enabled_mod.id.clone(),
                        CachedMod {
                            fingerprint,
                            skin_bins,
                        },
                    ),
                    None => cache.mods.remove(&enabled_mod.id),
                };
            }
        }

        if changed && let Err(e) = write_cache(&path, &cache) {
            tracing::warn!("Built-in mods: cannot cache {}: {e}", path.display());
        }

        let shipped = held
            .into_iter()
            .filter(|(bin, (content, _))| {
                game.read(bin)
                    .is_none_or(|bytes| ContentHash::of(&bytes) != *content)
            })
            .map(|(bin, (_, shipped))| (bin, shipped))
            .collect();
        Self { mods, shipped }
    }

    pub(super) fn ships(&self, bin: &SkinBin) -> bool {
        self.shipped.contains_key(bin)
    }

    /// Every skin bin the mods ship, in order.
    pub(super) fn iter(&self) -> impl Iterator<Item = &SkinBin> {
        self.shipped.keys()
    }

    /// The bytes of `bin` out of the mod shipping it, where one does and it reads.
    pub(super) fn read(&mut self, bin: &SkinBin) -> Option<Vec<u8>> {
        let Shipped { mod_index, file } = self.shipped.get(bin)?;
        let content = &mut self.mods[*mod_index].content;
        let bytes = match file {
            ModFile::Layer {
                layer,
                wad,
                rel_path,
            } => content.read_wad_override_file(layer, wad, rel_path),
            ModFile::Raw { rel_path } => content.read_raw_override_file(rel_path),
        };
        bytes
            .inspect_err(|e| tracing::warn!("Built-in mods: cannot read {}: {e}", bin.path()))
            .ok()
    }
}

/// The skin bins `enabled_mod` holds, read out of each layer it has turned on and its raw files.
fn skin_bins_of(
    enabled_mod: &mut EnabledMod,
    game: &GameSkins<'_>,
) -> ltk_overlay::Result<Vec<(SkinBin, ContentHash, ModFile)>> {
    let project = enabled_mod.content.mod_project()?;
    let mut files = Files::default();
    for layer in &project.layers {
        if !enabled_mod.is_layer_active(&layer.name) {
            continue;
        }
        for wad in enabled_mod.content.list_layer_wads(&layer.name)? {
            enabled_mod
                .content
                .visit_wad_override(&layer.name, &wad, &mut |rel_path, bytes| {
                    let file = ModFile::Layer {
                        layer: layer.name.clone(),
                        wad: wad.clone(),
                        rel_path: rel_path.clone(),
                    };
                    files.push(&rel_path, &bytes, file)
                })?;
        }
    }
    enabled_mod
        .content
        .visit_raw_override(&mut |rel_path, bytes| {
            let file = ModFile::Raw {
                rel_path: rel_path.clone(),
            };
            files.push(&rel_path, &bytes, file)
        })?;
    Ok(files.into_skin_bins(game))
}

/// The files of one mod as they are read, named by path or kept by hash to name in one pass.
#[derive(Default)]
struct Files {
    named: Vec<(SkinBin, ContentHash, ModFile)>,
    hashed: Vec<(ltk_wad::WadHash, ContentHash, ModFile)>,
}

impl Files {
    fn push(
        &mut self,
        rel_path: &Utf8Path,
        bytes: &[u8],
        file: ModFile,
    ) -> ltk_overlay::Result<()> {
        let content = ContentHash::of(bytes);
        match SkinBin::parse(rel_path.as_str()) {
            Some(bin) => self.named.push((bin, content, file)),
            None => self.hashed.push((
                ltk_overlay::utils::resolve_chunk_hash(rel_path, bytes)?,
                content,
                file,
            )),
        }
        Ok(())
    }

    fn into_skin_bins(mut self, game: &GameSkins<'_>) -> Vec<(SkinBin, ContentHash, ModFile)> {
        let hashes: Vec<_> = self.hashed.iter().map(|(hash, _, _)| *hash).collect();
        let resolved = game.resolve_all(&hashes).into_iter().zip(self.hashed);
        self.named
            .extend(resolved.filter_map(|(bin, (_, content, file))| Some((bin?, content, file))));
        self.named
    }
}

fn read_cache(path: &Path) -> Option<Cache> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes)
        .inspect_err(|e| tracing::warn!("Built-in mods: ignoring {}: {e}", path.display()))
        .ok()
}

fn write_cache(path: &Path, cache: &Cache) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_vec(cache)?)?;
    Ok(())
}
