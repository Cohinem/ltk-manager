//! A fantome archive as files a rule can read, without unpacking it.
//!
//! A packed WAD is read chunk by chunk where the archive keeps it, and a WAD
//! kept as a directory of entries is read entry by entry. Either way nothing
//! is written: the check that used to unpack a gigabyte of staging to read a
//! few bins now costs the bins.
//!
//! Reads open the archive again rather than sharing one handle. Bins are read
//! on a pool - see [`Budget::map`](crate::problems::Budget::map) - and a zip
//! entry borrows its archive mutably, so one shared handle would serialize the
//! pool. Reopening a stored entry costs the archive's entry table and the
//! WAD's, which is kilobytes.
//!
//! A deflated entry is the exception, and the reason [`ArchiveFiles`] holds
//! bytes at all. Deflate has no random access, so reaching any one chunk costs
//! inflating the whole entry - which reopening would pay once per bin. Such a
//! WAD is inflated once at the scan and kept for the run.
//! [`normalize_archive`](ltk_fantome::normalize_archive) is what stops an
//! archive needing that.

use std::collections::HashMap;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use ltk_fantome::{FantomeEntry, FantomeReader, classify_entry};
use ltk_file::LeagueFileKind;
use ltk_hashtable::{GameResolver, Hashtable, HashtableEntry, HashtableSet};
use ltk_wad::{NameRecovery, PathResolver, Wad, WadChunk, WadHash, hex_name};
use zip::{CompressionMethod, ZipArchive};

use crate::error::{AppError, AppResult};
use crate::workshop::WorkshopFileKind;

use super::{LayerFiles, ProjectFile};

/// The layer every fantome's content lands in, packed or loose.
///
/// The format has no layers of its own, and the tree an unpack writes puts all
/// of it under `base`, which is the name a site has to keep reading.
const ARCHIVE_LAYER: &str = "base";

/// Where an unpack puts a fantome's `RAW/` entries inside the layer.
const RAW_DIR: &str = "raw";

/// One fantome archive, and the bytes of the files inside it on demand.
#[derive(Debug)]
pub(super) struct ArchiveFiles {
    archive: PathBuf,
    /// The WADs this archive deflated, inflated once and held for the run,
    /// under their lower-cased names. A stored WAD is not here: it is read
    /// where it lies.
    inflated: HashMap<String, Arc<[u8]>>,
}

/// What one scan of an archive found.
///
/// The layer and the tables come back together because both are read in the
/// same pass, and a caller wanting one always wants the other: the tables are
/// what name the hashes the layer's bins hold.
#[derive(Debug)]
pub(super) struct ArchiveScan {
    /// The one layer the archive holds, reading back through the archive.
    pub layer: LayerFiles,
    /// The tables the archive declares, for the names it alone holds.
    pub tables: Vec<(HashtableEntry, Hashtable)>,
}

/// One packed WAD entry, and whether it can be read where it lies.
struct PackedWad {
    name: String,
    /// Taken from the entry's own record, so deciding costs no decompression.
    stored: bool,
}

impl ArchiveFiles {
    /// Every file of `archive` a rule can see, and the names it declares.
    ///
    /// `resolver` names the chunks of a packed WAD, exactly as it does for an
    /// unpack, so a site addresses the same path either way. A chunk it does
    /// not name is listed under its hash and identified by its magic, because
    /// a bin the panel cannot name is still a bin the panel has to report.
    ///
    /// # Errors
    ///
    /// Reports an archive that cannot be opened or whose entry table cannot be
    /// read. A single WAD that cannot be mounted is logged and skipped, since
    /// one damaged WAD is no reason to say nothing about the rest.
    pub(super) fn scan(archive: &Path, resolver: &dyn PathResolver) -> AppResult<ArchiveScan> {
        let (mut files, packed) = Self::loose_files(archive)?;
        let mut reader = FantomeReader::new(std::fs::File::open(archive)?)
            .map_err(|e| AppError::Fantome(e.to_string()))?;

        // Read before the WADs are scanned, and propagated rather than shrugged
        // off: the mod's own tables name its chunks ahead of the caller's
        // resolver, exactly as they do for an unpack, so an archive whose
        // manifest names a table it does not hold resolves to names neither
        // side can reproduce. The import refuses such an archive; so does this.
        let declared = reader
            .read_hashtables()
            .map_err(|e| AppError::Fantome(e.to_string()))?;
        let own_names = HashtableSet::build(declared.iter().cloned());
        let chained = Chained {
            own: GameResolver::new(&own_names),
            fallback: resolver,
        };

        let mut inflated = HashMap::new();
        for wad in packed {
            match Self::packed_files(&mut reader, &wad, &chained, &mut inflated) {
                Ok(found) => files.extend(found),
                Err(e) => tracing::warn!(
                    "Skipping {} of {}, which would not mount: {e}",
                    wad.name,
                    archive.display()
                ),
            }
        }

        // The walk sorts each layer, and a site's order is what the panel draws
        // in, so an archive has to arrive sorted too.
        files.sort_by(|a, b| a.path.cmp(&b.path));

        let tables = declared;

        let source = Self {
            archive: archive.to_path_buf(),
            inflated,
        };
        Ok(ArchiveScan {
            layer: LayerFiles::in_archive(ARCHIVE_LAYER, files, source),
            tables,
        })
    }

    /// The bytes of one file the scan listed.
    ///
    /// # Errors
    ///
    /// Reports the file it could not read, as one sentence a panel can draw.
    pub(super) fn read(&self, file: &ProjectFile) -> Result<Vec<u8>, String> {
        match file.chunk {
            Some(hash) => self.read_chunk(&file.path, hash),
            None => self.read_entry(&file.path),
        }
        .map_err(|e| format!("{}: {e}", self.archive.display()))
    }

    /// Every file the archive holds loose, and its packed WAD entries.
    ///
    /// Only the entry table is read, so listing an archive costs no
    /// decompression however much content it holds.
    fn loose_files(archive: &Path) -> AppResult<(Vec<ProjectFile>, Vec<PackedWad>)> {
        let mut zip = open_zip(archive)?;

        let mut files = Vec::new();
        let mut packed = Vec::new();
        for index in 0..zip.len() {
            let entry = zip.by_index_raw(index)?;
            let (name, size) = (entry.name().to_owned(), entry.size());

            if let Some(FantomeEntry::PackedWad(wad_name)) = classify_entry(&name) {
                packed.push(PackedWad {
                    name: wad_name.to_owned(),
                    stored: entry.compression() == CompressionMethod::Stored,
                });
                continue;
            }
            if let Some(path) = layer_path(&name) {
                files.push(ProjectFile {
                    kind: kind_of_path(&path),
                    path,
                    size_bytes: size,
                    chunk: None,
                });
            }
        }

        Ok((files, packed))
    }

    /// Every chunk of one packed WAD, under the paths `resolver` names.
    ///
    /// A WAD the archive deflated is inflated here and left in `inflated`, so
    /// the reads that follow do not each inflate it again.
    fn packed_files(
        reader: &mut FantomeReader<std::fs::File>,
        wad: &PackedWad,
        resolver: &dyn PathResolver,
        inflated: &mut HashMap<String, Arc<[u8]>>,
    ) -> AppResult<Vec<ProjectFile>> {
        if wad.stored {
            tracing::debug!("Reading {} where the archive stores it", wad.name);
            let Some(source) = reader
                .packed_wad_source(&wad.name)
                .map_err(|e| AppError::Fantome(e.to_string()))?
            else {
                return Ok(Vec::new());
            };
            return scan_wad(&mut mounted(source)?, &wad.name, resolver);
        }

        let Some(bytes) = reader
            .read_packed_wad(&wad.name)
            .map_err(|e| AppError::Fantome(e.to_string()))?
        else {
            return Ok(Vec::new());
        };
        // The size is the run's to hold until it ends, so it is worth saying.
        tracing::debug!(
            "Holding {} inflated, {} MB, which the archive deflated",
            wad.name,
            bytes.len() / (1024 * 1024)
        );

        let bytes: Arc<[u8]> = Arc::from(bytes);
        let found = scan_wad(
            &mut mounted(Cursor::new(Arc::clone(&bytes)))?,
            &wad.name,
            resolver,
        )?;
        inflated.insert(wad.name.to_ascii_lowercase(), bytes);
        Ok(found)
    }

    /// One chunk of the packed WAD the first segment of `path` names.
    fn read_chunk(&self, path: &str, hash: WadHash) -> AppResult<Vec<u8>> {
        let wad_name = path.split('/').next().unwrap_or(path);

        if let Some(bytes) = self.inflated.get(&wad_name.to_ascii_lowercase()) {
            return chunk_of(
                &mut mounted(Cursor::new(Arc::clone(bytes)))?,
                wad_name,
                hash,
            );
        }

        let mut reader = FantomeReader::new(std::fs::File::open(&self.archive)?)
            .map_err(|e| AppError::Fantome(e.to_string()))?;
        let mut wad = reader
            .mount_packed_wad(wad_name)
            .map_err(|e| AppError::Fantome(e.to_string()))?
            .ok_or_else(|| AppError::Fantome(format!("{wad_name} is no longer packed")))?;
        chunk_of(&mut wad, wad_name, hash)
    }

    /// One loose entry, found the same way the scan placed it.
    ///
    /// Through [`layer_path`] rather than by rebuilding a prefix, so an entry
    /// is read back under whatever casing and whichever of the two prefixes
    /// the archive spelled it with.
    fn read_entry(&self, path: &str) -> AppResult<Vec<u8>> {
        let mut zip = open_zip(&self.archive)?;
        let name = zip
            .file_names()
            .find(|name| layer_path(name).is_some_and(|at| at.eq_ignore_ascii_case(path)))
            .map(str::to_owned)
            .ok_or_else(|| AppError::Fantome(format!("{path} is no longer in the archive")))?;

        let mut bytes = Vec::new();
        std::io::Read::read_to_end(&mut zip.by_name(&name)?, &mut bytes)?;
        Ok(bytes)
    }
}

fn open_zip(archive: &Path) -> AppResult<ZipArchive<std::fs::File>> {
    ZipArchive::new(std::fs::File::open(archive)?).map_err(|e| AppError::Fantome(e.to_string()))
}

/// A WAD over `source`, with its own error mapped onto the app's.
fn mounted<S: std::io::Read + std::io::Seek>(source: S) -> AppResult<Wad<S>> {
    Wad::mount(source).map_err(|e| AppError::Fantome(e.to_string()))
}

/// Every chunk of `wad` as a file of the layer, under `wad_name`.
///
/// The paths are what an unpack would have written the chunks to, which is
/// what a site's path has always named.
fn scan_wad<S: std::io::Read + std::io::Seek>(
    wad: &mut Wad<S>,
    wad_name: &str,
    resolver: &dyn PathResolver,
) -> AppResult<Vec<ProjectFile>> {
    // The names a mod's own bins spell for its chunks, which no table holds:
    // the author invented those paths, and an unpack recovers them before it
    // writes. A scan skipping this lists under a hash what the tree lists
    // under a path.
    let recovered = NameRecovery::new()
        .run(wad, resolver)
        .map_err(|e| AppError::Fantome(e.to_string()))?;
    let resolver = recovered.over(resolver);

    let chunks: Vec<WadChunk> = wad.chunks().iter().copied().collect();
    let hashes: Vec<WadHash> = chunks.iter().map(|chunk| chunk.path_hash).collect();
    let named = resolver.resolve_all(&hashes);

    Ok(chunks
        .iter()
        .zip(named)
        .map(|(chunk, name)| {
            // Sixteen hex digits and no extension, which is what the
            // import writes a nameless chunk as: it runs under
            // NamingPolicy::Lossless, and that policy invents none.
            // Identifying the chunk by its magic instead would read better and
            // be wrong - the tree takes a kind from the extension alone, so a
            // bin named that way is one the check reports and the repair,
            // which still unpacks, cannot see.
            let path = name.unwrap_or_else(|| hex_name(chunk.path_hash));
            ProjectFile {
                kind: kind_of_path(&path),
                path: format!("{wad_name}/{path}"),
                size_bytes: chunk.uncompressed_size as u64,
                chunk: Some(chunk.path_hash),
            }
        })
        .collect())
}

/// The archive's own declared tables, then whatever the caller supplied.
///
/// The order an unpack resolves in: a mod's tables are the record of the paths
/// its author invented, and the caller's resolver holds the game's. Naming a
/// chunk differently from the unpack puts a problem at a site the repair
/// cannot find.
struct Chained<'a> {
    own: GameResolver<'a>,
    fallback: &'a dyn PathResolver,
}

impl PathResolver for Chained<'_> {
    fn resolve(&self, path_hash: WadHash) -> Option<String> {
        self.own
            .resolve(path_hash)
            .or_else(|| self.fallback.resolve(path_hash))
    }

    fn is_known(&self, path_hash: WadHash) -> bool {
        self.own.is_known(path_hash) || self.fallback.is_known(path_hash)
    }
}

/// The decompressed bytes of one chunk of `wad`.
fn chunk_of<S: std::io::Read + std::io::Seek>(
    wad: &mut Wad<S>,
    wad_name: &str,
    hash: WadHash,
) -> AppResult<Vec<u8>> {
    let chunk = *wad
        .chunks()
        .get(hash)
        .ok_or_else(|| AppError::Fantome(format!("{wad_name} holds no chunk {hash}")))?;
    wad.load_chunk_decompressed(&chunk)
        .map(Vec::from)
        .map_err(|e| AppError::Fantome(e.to_string()))
}

/// Where the entry named `entry_name` lands inside the layer, or `None` for
/// an entry that is not the layer's content at all.
///
/// The one place the mapping is written, so a scan and a read cannot disagree
/// about which entry a site's path names. It follows `ltk_mod_project`'s own
/// fantome layout, because the tree an unpack writes is what a site's path has
/// always named - `RAW/` entries included, which land under the layer rather
/// than beside it.
fn layer_path(entry_name: &str) -> Option<String> {
    let path = match classify_entry(entry_name)? {
        FantomeEntry::WadFile(relative) => relative.to_owned(),
        FantomeEntry::Raw(relative) => format!("{RAW_DIR}/{relative}"),
        _ => return None,
    };

    // The walk filters every entry under the layer root whose name begins with
    // a dot, so an archive listing one lists a file the tree does not - and a
    // problem raised against it is one the repair, reading the tree, can never
    // apply a fix to.
    let hidden = path.split('/').any(|part| part.starts_with('.'));
    (!hidden).then_some(path)
}

/// The kind a path's extension claims, which is what the walk reads too.
fn kind_of_path(path: &str) -> WorkshopFileKind {
    let extension = camino::Utf8Path::new(path).extension().unwrap_or_default();
    WorkshopFileKind::from(LeagueFileKind::from_extension(extension))
}
