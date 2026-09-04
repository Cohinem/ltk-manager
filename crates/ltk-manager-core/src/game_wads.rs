//! Read-only browsing of the game's WAD archives under `DATA/FINAL`.

use std::fmt;
use std::fs;
use std::io::BufReader;
use std::num::NonZeroUsize;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};

use lru::LruCache;
use ltk_hashdb::LayeredHashDb;
use ltk_wad::{Wad, WadHash};
use serde::Serialize;

use crate::config::Config;
use crate::error::{AppError, AppResult, MutexResultExt};
use crate::utils::game::GameDir;
use crate::utils::natural_order::compare_names;
use crate::utils::path::resolve_within;

/// One WAD archive in a game install.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct GameWadSummary {
    /// Path relative to `DATA/FINAL` with forward slashes, e.g.
    /// `Champions/Aatrox.wad.client`.
    pub name: String,
    /// Archive file size on disk, or 0 when it cannot be read.
    pub size_bytes: u64,
}

/// One chunk of a WAD archive.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct GameWadEntry {
    /// Chunk path hash as 16 lowercase hex digits.
    pub path_hash: String,
    /// Resolved chunk path, or `None` when no hashtable knows the hash.
    pub path: Option<String>,
    /// Uncompressed chunk size.
    pub size_bytes: u64,
}

/// Read-only view of the WAD archives under a game's `DATA/FINAL` directory.
#[derive(Debug, Clone)]
pub struct GameArchives {
    final_dir: PathBuf,
}

impl GameArchives {
    /// Resolve from the configured League path.
    ///
    /// # Errors
    ///
    /// Fails with [`AppError::LeagueNotFound`] when no League path is
    /// configured, and with [`AppError::ValidationFailed`] when the configured
    /// path does not look like an install.
    pub fn resolve(config: &Config) -> AppResult<Self> {
        if config.league_path.is_none() {
            return Err(AppError::LeagueNotFound);
        }
        Ok(Self::at(GameDir::resolve(config)?.path()))
    }

    /// View an already-resolved game directory (the one containing `DATA`).
    pub fn at(game_dir: &Path) -> Self {
        Self {
            final_dir: game_dir.join("DATA").join("FINAL"),
        }
    }

    /// Enumerate every `*.wad.client` archive under `DATA/FINAL`, sorted by
    /// name.
    ///
    /// The extension match is case-insensitive. Unreadable subdirectories are
    /// logged and skipped.
    ///
    /// # Errors
    ///
    /// Fails with [`AppError::ValidationFailed`] when `DATA/FINAL` itself does
    /// not exist.
    pub fn list(&self) -> AppResult<Vec<GameWadSummary>> {
        if !self.final_dir.is_dir() {
            return Err(AppError::ValidationFailed(format!(
                "Game DATA/FINAL directory does not exist: {}",
                self.final_dir.display()
            )));
        }

        let mut out = Vec::new();
        for entry in walkdir::WalkDir::new(&self.final_dir).follow_links(false) {
            let entry = match entry {
                Ok(entry) => entry,
                Err(e) => {
                    tracing::warn!("Skipping unreadable game data entry: {e}");
                    continue;
                }
            };
            if !entry.file_type().is_file() {
                continue;
            }
            let Ok(relative) = entry.path().strip_prefix(&self.final_dir) else {
                continue;
            };
            let name = relative
                .components()
                .filter_map(|c| match c {
                    Component::Normal(part) => Some(part.to_string_lossy()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("/");
            if !name.to_ascii_lowercase().ends_with(".wad.client") {
                continue;
            }
            let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(GameWadSummary { name, size_bytes });
        }

        out.sort_by(|a, b| compare_names(&a.name, &b.name));
        Ok(out)
    }

    /// Read the chunk list of one archive, resolving path hashes via
    /// `resolver`.
    ///
    /// `wad_name` is a `DATA/FINAL`-relative name as returned by
    /// [`list`](Self::list). An empty resolver is fine: every path is then
    /// `None`. Entries come back in the archive's chunk order.
    ///
    /// # Errors
    ///
    /// Fails with [`AppError::InvalidPath`] when `wad_name` escapes
    /// `DATA/FINAL`, and with I/O or WAD errors when the archive cannot be
    /// read.
    pub fn read(&self, wad_name: &str, resolver: &LayeredHashDb) -> AppResult<Vec<GameWadEntry>> {
        let mut out = Vec::new();
        self.for_each_chunk(wad_name, resolver, |path_hash, path, size_bytes| {
            out.push(GameWadEntry {
                path_hash: format!("{path_hash:016x}"),
                path: path.map(str::to_owned),
                size_bytes,
            });
        })?;
        Ok(out)
    }

    /// Visit every chunk of one archive as `(path hash, resolved path, size)`.
    ///
    /// The same read as [`read`](Self::read) without the owned per-chunk shape,
    /// for callers that walk every archive of an install and keep only a part
    /// of what they see.
    ///
    /// # Errors
    ///
    /// The same conditions as [`read`](Self::read).
    pub fn for_each_chunk(
        &self,
        wad_name: &str,
        resolver: &LayeredHashDb,
        mut visit: impl FnMut(u64, Option<&str>, u64),
    ) -> AppResult<()> {
        let path = self.archive_path(wad_name)?;
        let file = fs::File::open(&path)?;
        let wad = Wad::mount(BufReader::new(file))?;

        let chunks = wad.chunks().as_slice();
        let hashes: Vec<u64> = chunks.iter().map(|c| c.path_hash().0).collect();
        resolver.for_each_batch(&hashes, |index, path_hash, path| {
            visit(path_hash, path, chunks[index].uncompressed_size() as u64);
        });
        Ok(())
    }

    /// Join `wad_name` under `DATA/FINAL`, rejecting anything that escapes it.
    ///
    /// # Errors
    ///
    /// Fails with [`AppError::InvalidPath`] when the name is absolute, or
    /// climbs out of `DATA/FINAL`, and with an I/O error when neither it nor
    /// the directory it sits in can be resolved.
    pub fn archive_path(&self, wad_name: &str) -> AppResult<PathBuf> {
        resolve_within(&self.final_dir, wad_name)
    }
}

/// One mounted archive, shared by every reader the cache handed it to.
///
/// The mount carries its own lock rather than sitting under the cache's. A
/// chunk read seeks and decompresses, so holding the cache across one would
/// queue every other archive's readers behind a single slow file.
type MountedWad = Arc<Mutex<Wad<BufReader<fs::File>>>>;

/// How many archives stay mounted at once.
///
/// A mount holds an open handle and the archive's whole chunk table, so the
/// cache trades memory for not re-reading that table. Four covers what a modder
/// moves between while working - a champion, its VFX, `UI` and one more - and
/// bounds the resident tables at the same time.
const MOUNT_CAPACITY: NonZeroUsize = NonZeroUsize::new(4).unwrap();

/// A bounded cache of mounted WAD archives.
///
/// [`Wad::mount`] reads an archive's chunk table end to end, which a browser
/// opening one preview after another out of the same archive would otherwise
/// pay on every chunk. Keyed on the resolved archive path, so pointing the app
/// at another install cannot serve a chunk out of the old one's mount.
///
/// Least-recently-used eviction is what bounds it. Releasing a mount with the
/// tab that wanted it would need the webview to report every close, and would
/// still drop the archive the next tab is about to ask for.
pub struct WadCache {
    mounted: Mutex<LruCache<PathBuf, MountedWad>>,
}

impl Default for WadCache {
    fn default() -> Self {
        Self::new(MOUNT_CAPACITY)
    }
}

impl fmt::Debug for WadCache {
    /// Reports how many archives are mounted, a mount being a file handle and a
    /// chunk table rather than anything worth printing.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut out = f.debug_struct("WadCache");
        match self.mounted.lock() {
            Ok(cache) => out.field("mounted", &cache.len()).finish(),
            Err(_) => out.finish_non_exhaustive(),
        }
    }
}

impl WadCache {
    /// A cache that keeps `capacity` archives mounted.
    #[must_use]
    pub fn new(capacity: NonZeroUsize) -> Self {
        Self {
            mounted: Mutex::new(LruCache::new(capacity)),
        }
    }

    /// Read one chunk of one archive, decompressed, mounting it if it is not.
    ///
    /// `wad_name` is a `DATA/FINAL`-relative name as returned by
    /// [`GameArchives::list`], and `path_hash` names one of its chunks.
    ///
    /// # Errors
    ///
    /// Fails with [`AppError::InvalidPath`] when `wad_name` escapes
    /// `DATA/FINAL` or when the archive holds no such chunk, with I/O or WAD
    /// errors when the archive cannot be read, and with
    /// [`AppError::MutexLockFailed`] when a previous holder of a lock panicked.
    pub fn read_chunk(
        &self,
        archives: &GameArchives,
        wad_name: &str,
        path_hash: WadHash,
    ) -> AppResult<Vec<u8>> {
        let mounted = self.mount(archives.archive_path(wad_name)?)?;
        let mut wad = mounted.lock().mutex_err()?;

        let chunk = *wad.chunks().get(path_hash).ok_or_else(|| {
            AppError::InvalidPath(format!("No chunk {path_hash:016x} in {wad_name}"))
        })?;
        Ok(wad.load_chunk_decompressed(&chunk)?.into_vec())
    }

    /// How many archives are mounted right now.
    ///
    /// # Errors
    ///
    /// Fails when a previous holder of the lock panicked.
    pub fn mounted(&self) -> AppResult<usize> {
        Ok(self.mounted.lock().mutex_err()?.len())
    }

    /// Unmount everything, so the next read opens the archive again.
    ///
    /// # Errors
    ///
    /// Fails when a previous holder of the lock panicked.
    pub fn clear(&self) -> AppResult<()> {
        self.mounted.lock().mutex_err()?.clear();
        Ok(())
    }

    /// The mount for `path`, opening the archive when the cache lacks one.
    ///
    /// The cache lock is dropped before the file is opened, so two callers
    /// racing for one archive can both mount it. That costs a duplicate read
    /// and settles on whichever landed last, which is cheaper than holding the
    /// whole cache across an open.
    fn mount(&self, path: PathBuf) -> AppResult<MountedWad> {
        if let Some(mounted) = self.mounted.lock().mutex_err()?.get(&path) {
            return Ok(Arc::clone(mounted));
        }

        let wad = Wad::mount(BufReader::new(fs::File::open(&path)?))?;
        let mounted = Arc::new(Mutex::new(wad));
        self.mounted
            .lock()
            .mutex_err()?
            .put(path, Arc::clone(&mounted));
        Ok(mounted)
    }
}

#[cfg(test)]
mod tests;
