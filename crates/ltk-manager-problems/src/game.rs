//! Installed game content, for a rule to compare a mod against.
//!
//! Compare against, never take parts out of. Reading the install for parts is a
//! separate decision, recorded where it is made.
//!
//! **The hash tables are not this.** Mimir's tables are a superset across
//! patches, so they still name a path Riot removed. Trusting them here deletes
//! a file whose backing is gone.

#[cfg(test)]
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;

use ltk_hash::BinHash;
use ltk_hashdb::LayeredHashDb;
use ltk_wad::WadHash;

use ltk_manager_assets::game_index::GameIndex;
use ltk_manager_assets::game_wads::{GameArchives, WadCache, mount_wad};
use ltk_manager_assets::hashtables::HashtableCache;
use ltk_manager_base::budget::files_at_once;
use ltk_manager_base::config::Config;
use ltk_manager_bin::object_index::ObjectIndex;

/// The chunks of the installed game.
///
/// Taken by a run rather than built by one, so a library sweep shares one
/// index.
pub trait GameContent: std::fmt::Debug + Send + Sync {
    /// Whether any installed archive contains this chunk.
    fn contains(&self, path: WadHash) -> bool;

    /// The chunk's decompressed size, or `None` where no archive contains it.
    ///
    /// Read from the table of contents, without decompressing the chunk.
    fn size(&self, path: WadHash) -> Option<u64>;

    /// The chunk's decompressed bytes, or `None` where no archive contains it.
    ///
    /// For comparing what a mod ships against what it overrides. Not a parts
    /// source for a repair.
    ///
    /// # Errors
    ///
    /// An archive that would not mount, or a chunk that would not decompress,
    /// as one sentence a panel can draw.
    fn read(&self, path: WadHash) -> Result<Option<Vec<u8>>, String>;

    /// Returns the installed chunks that declare the bin object `object`.
    ///
    /// Returns `None` if the bin objects of the install cannot be indexed. The
    /// default implementation returns `None`.
    fn declaring_chunks(&self, object: BinHash) -> Option<Vec<WadHash>> {
        let _ = object;
        None
    }

    /// Build whatever the content keeps lazily, ahead of the first ask.
    ///
    /// The default builds nothing. Content that builds an index keeps it for
    /// later calls.
    fn warm(&self) {}
}

/// The installed game's archives, indexed by chunk hash on first use.
///
/// Lazy because most runs never ask, and the walk costs seconds.
#[derive(Debug)]
pub struct InstalledContent {
    archives: GameArchives,
    chunks: OnceLock<ChunkIndex>,
    /// The bin objects of the install, or `None` if the build failed.
    objects: OnceLock<Option<ObjectIndex>>,
    mounts: WadCache,
}

/// The archive and decompressed size of each installed chunk.
///
/// Names sit apart from the map: a few hundred archives against a few hundred
/// thousand chunks, so a string per chunk would store each name over and
/// over.
#[derive(Debug, Default)]
struct ChunkIndex {
    /// Every archive the walk read, in walk order.
    names: Vec<String>,
    /// Each chunk's entry, sorted by hash.
    ///
    /// A path in more than one archive keeps the last archive walked. Two
    /// copies that differ are a separate defect.
    entries: Vec<ChunkEntry>,
}

/// One chunk from an installed archive's table of contents.
#[derive(Debug, Clone, Copy)]
struct ChunkEntry {
    hash: WadHash,
    /// The decompressed size, which a table of contents records in 32 bits.
    size: u32,
    /// The archive that contains the chunk, as an index into `ChunkIndex::names`.
    archive: u32,
}

impl ChunkIndex {
    /// Returns the entry of the chunk `path`, or `None` if no archive contains it.
    fn get(&self, path: WadHash) -> Option<&ChunkEntry> {
        let at = self
            .entries
            .binary_search_by_key(&path.0, |entry| entry.hash.0)
            .ok()?;
        Some(&self.entries[at])
    }
}

impl InstalledContent {
    /// The install `config` points at, or `None` for no install.
    #[must_use]
    pub fn resolve(config: &Config) -> Option<Self> {
        GameArchives::resolve(config).ok().map(Self::over)
    }

    /// An index over already-resolved archives.
    #[must_use]
    pub fn over(archives: GameArchives) -> Self {
        Self {
            archives,
            chunks: OnceLock::new(),
            objects: OnceLock::new(),
            mounts: WadCache::default(),
        }
    }

    /// The install rooted at `game_dir`, the directory that contains `DATA`.
    #[must_use]
    pub fn at(game_dir: &Path) -> Self {
        Self::over(GameArchives::at(game_dir))
    }

    /// Every chunk's archive, walked once.
    ///
    /// Tables of contents only, so hundreds of gigabytes cost the few megabytes
    /// their chunk tables come to. An archive that will not mount is logged and
    /// skipped: skipping one costs a removal refused, which is the safe
    /// direction.
    fn index(&self) -> &ChunkIndex {
        self.chunks.get_or_init(|| {
            let started = std::time::Instant::now();
            let mut index = ChunkIndex::default();

            let archives = match self.archives.list() {
                Ok(archives) => archives,
                Err(e) => {
                    tracing::warn!("Could not list the installed game's archives: {e}");
                    return index;
                }
            };

            for archive in &archives {
                match self.chunks_in(&archive.name) {
                    Ok(chunks) => {
                        let at = index.names.len() as u32;
                        index.names.push(archive.name.clone());
                        index
                            .entries
                            .extend(chunks.into_iter().map(|(hash, size)| ChunkEntry {
                                hash,
                                size: u32::try_from(size).unwrap_or(u32::MAX),
                                archive: at,
                            }));
                    }
                    Err(e) => {
                        tracing::warn!("Skipping {}, which would not mount: {e}", archive.name)
                    }
                }
            }

            // The sort is stable, so the last archive walked is the later of two copies.
            index.entries.sort_by_key(|entry| entry.hash.0);
            index.entries.dedup_by(|later, kept| {
                let same = later.hash == kept.hash;
                if same {
                    *kept = *later;
                }
                same
            });
            index.entries.shrink_to_fit();

            tracing::debug!(
                "Indexed {} chunks across {} game archives in {:?}",
                index.entries.len(),
                archives.len(),
                started.elapsed()
            );
            index
        })
    }

    /// Each chunk's hash and decompressed size in one archive's table of
    /// contents.
    fn chunks_in(&self, wad_name: &str) -> ltk_manager_base::error::AppResult<Vec<(WadHash, u64)>> {
        let wad = mount_wad(&self.archives.archive_path(wad_name)?)?;
        Ok(wad
            .chunks()
            .as_slice()
            .iter()
            .map(|chunk| (chunk.path_hash, chunk.uncompressed_size as u64))
            .collect())
    }

    /// Returns the bin object index of the install, and builds it on the first call.
    ///
    /// Returns `None` if no hashtable is synced or if the build fails. The failure
    /// is logged once, and later calls return `None` without a new build.
    fn objects(&self) -> Option<&ObjectIndex> {
        self.objects
            .get_or_init(|| {
                let cache = HashtableCache::shared()
                    .inspect_err(|e| {
                        tracing::warn!(
                            "Could not open the hashtable cache, so bin objects are not indexed: {e}"
                        );
                    })
                    .ok()?;
                if cache.generation().is_none() {
                    tracing::warn!(
                        "Bin objects are not indexed because no hashtable is synced. Sync the hashtables in Settings."
                    );
                    return None;
                }

                index_objects(&self.archives, &cache.wad_tables())
                    .inspect_err(|e| {
                        tracing::warn!("Could not index the installed game's bin objects: {e}");
                    })
                    .ok()
            })
            .as_ref()
    }
}

/// Builds the index of the bin objects that the bins of `archives` declare.
///
/// `tables` resolves chunk hashes to paths. The build reads the first bytes of
/// every chunk whose hash `tables` does not resolve, so an empty `tables`
/// causes a prefix read of every chunk of the install.
///
/// Fails if the archives cannot be listed or if the build fails.
fn index_objects(archives: &GameArchives, tables: &LayeredHashDb) -> Result<ObjectIndex, String> {
    let game = GameIndex::build(archives, tables).map_err(|e| e.to_string())?;
    ObjectIndex::build(&game, archives, files_at_once(), &|| false).map_err(|e| e.to_string())
}

impl GameContent for InstalledContent {
    fn contains(&self, path: WadHash) -> bool {
        self.index().get(path).is_some()
    }

    fn size(&self, path: WadHash) -> Option<u64> {
        self.index().get(path).map(|chunk| u64::from(chunk.size))
    }

    fn declaring_chunks(&self, object: BinHash) -> Option<Vec<WadHash>> {
        Some(self.objects()?.declaring_chunks(object).collect())
    }

    fn warm(&self) {
        self.index();
    }

    /// Read through a cached mount.
    ///
    /// One table of contents parse per archive, not per chunk.
    fn read(&self, path: WadHash) -> Result<Option<Vec<u8>>, String> {
        let index = self.index();
        let Some(name) = index
            .get(path)
            .and_then(|chunk| index.names.get(chunk.archive as usize))
        else {
            return Ok(None);
        };

        self.mounts
            .read_chunk(&self.archives, name, path)
            .map(Some)
            .map_err(|e| e.to_string())
    }
}

/// An install that contains only the chunks a test gives it.
///
/// The second adapter, which is what makes [`GameContent`] a seam: a unit test
/// cannot depend on a League install.
#[cfg(test)]
#[derive(Debug, Default)]
pub(crate) struct FakeContent {
    chunks: HashMap<WadHash, Vec<u8>>,
    /// The chunks that declare each bin object, or `None` for an install that indexes nothing.
    objects: Option<HashMap<BinHash, Vec<WadHash>>>,
}

#[cfg(test)]
impl FakeContent {
    /// An install that contains `paths`, each with empty bytes.
    pub(crate) fn containing(paths: &[&str]) -> std::sync::Arc<dyn GameContent> {
        Self::of(paths.iter().map(|path| (*path, [].as_slice())))
    }

    /// An install that contains `entries`, each with the bytes a rule reads.
    pub(crate) fn containing_bytes(entries: &[(&str, &[u8])]) -> std::sync::Arc<dyn GameContent> {
        Self::of(entries.iter().copied())
    }

    /// An install with no chunks.
    pub(crate) fn empty() -> std::sync::Arc<dyn GameContent> {
        Self::of(std::iter::empty())
    }

    /// Returns an install that contains `bins`, each as `(chunk path, bytes)`, with its bin
    /// objects indexed.
    pub(crate) fn with_bins(bins: &[(&str, &[u8])]) -> std::sync::Arc<dyn GameContent> {
        use ltk_hash::Hash as _;
        let mut objects: HashMap<BinHash, Vec<WadHash>> = HashMap::new();
        let mut chunks = HashMap::new();

        for (path, bytes) in bins {
            let chunk = WadHash::hash_str(path);
            ltk_manager_assets::bin_source::for_each_declaration(
                std::io::Cursor::new(bytes),
                |declared| objects.entry(declared.object).or_default().push(chunk),
            )
            .expect("a fixture bin reads");
            chunks.insert(chunk, bytes.to_vec());
        }

        std::sync::Arc::new(Self {
            chunks,
            objects: Some(objects),
        })
    }

    fn of<'e>(
        entries: impl Iterator<Item = (&'e str, &'e [u8])>,
    ) -> std::sync::Arc<dyn GameContent> {
        use ltk_hash::Hash as _;
        std::sync::Arc::new(Self {
            chunks: entries
                .map(|(path, bytes)| (WadHash::hash_str(path), bytes.to_vec()))
                .collect(),
            objects: None,
        })
    }
}

#[cfg(test)]
impl GameContent for FakeContent {
    fn contains(&self, path: WadHash) -> bool {
        self.chunks.contains_key(&path)
    }

    fn size(&self, path: WadHash) -> Option<u64> {
        self.chunks.get(&path).map(|bytes| bytes.len() as u64)
    }

    fn read(&self, path: WadHash) -> Result<Option<Vec<u8>>, String> {
        Ok(self.chunks.get(&path).cloned())
    }

    fn declaring_chunks(&self, object: BinHash) -> Option<Vec<WadHash>> {
        let objects = self.objects.as_ref()?;
        Some(objects.get(&object).cloned().unwrap_or_default())
    }
}

#[cfg(test)]
mod tests;
