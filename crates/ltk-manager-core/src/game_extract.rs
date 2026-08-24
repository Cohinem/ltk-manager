//! Writing chunks of the installed game's archives out to a folder on disk.
//!
//! The browser's second output, beside a copy into a layer. It reads the same
//! rows the tree shows - a file, a directory, a whole archive - expands them
//! into chunk hashes, groups those by the archive that holds them, and drives
//! [`ltk_wad::WadExtractor`] once per archive.
//!
//! The naming rules, the skip-or-replace policy and the parallel decompress
//! belong to `ltk_wad`. What lives here is everything the crate has no way to
//! know: which chunks a directory row stands for, which archive each one comes
//! out of, that the destination must not be inside the League install, and how
//! to report progress to a UI without one event per chunk.

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use camino::Utf8Path;
use ltk_file::LeagueFileKind;
use ltk_wad::{
    ExistingFilePolicy, ExtractLayout as WadExtractLayout, ExtractReport, Wad, WadExtractor,
    WadHash,
};
use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::error::{AppError, AppResult};
use crate::events::{BackendEvent, EventSink, ExtractProgress};
use crate::game_index::GameIndex;
use crate::game_wads::GameArchives;
use crate::hashtables::WadPathResolver;
use crate::utils::game::GameDir;
use crate::workshop::WorkshopFileKind;

/// How often the run may emit an [`ExtractProgress`].
///
/// The extractor calls back once per chunk, which is 2,646 times for
/// `Aatrox.wad.client` and around 30,000 for `Map11`. A Tauri emit serialises
/// JSON per event, so a bar that updates ten times a second costs nothing and
/// one that updates thirty thousand times costs more than the extraction.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

/// One row of the browser, as a thing to extract.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum ExtractTarget {
    /// One chunk, as a file row of the browser holds it.
    ///
    /// `path_hash` is what gets extracted. `path` and `size_bytes` are the
    /// row's own copy, and only shape the summary and the kind filter, so a
    /// stale row costs an off-by-one in a count rather than the wrong bytes.
    File {
        wad: String,
        path_hash: String,
        path: Option<String>,
        /* The tree holds this as a JS number, and a chunk size never reaches
        the range where that loses a digit. Binding it as `bigint` would only
        make every call site build one that `JSON.stringify` then refuses. */
        #[cfg_attr(feature = "ts", ts(type = "number"))]
        size_bytes: u64,
    },
    /// Every file at or below one directory of the folded index.
    Dir { path: String },
    /// Every chunk of one archive.
    ///
    /// Read out of the archive rather than out of the index, because the fold
    /// keeps one copy of a chunk that several archives carry and drops the
    /// rest. An archive row means the archive, not the part of it the index
    /// happens to attribute to it.
    Archive { wad: String },
}

/// Where each file of an extract lands under the destination.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub enum ExtractLayout {
    /// Each file at its game path, which is what a repack reads back.
    #[default]
    Paths,
    /// Every file in the destination by its name alone.
    Flat,
}

impl From<ExtractLayout> for WadExtractLayout {
    fn from(value: ExtractLayout) -> Self {
        match value {
            ExtractLayout::Paths => Self::Paths,
            ExtractLayout::Flat => Self::Flat,
        }
    }
}

/// What an extract does about a file already sitting where one would land.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub enum ExistingFiles {
    /// Leave it, and count it. The dialog's default, and not the crate's.
    #[default]
    Skip,
    /// Write over it.
    Replace,
}

impl From<ExistingFiles> for ExistingFilePolicy {
    fn from(value: ExistingFiles) -> Self {
        match value {
            ExistingFiles::Skip => Self::Skip,
            ExistingFiles::Replace => Self::Overwrite,
        }
    }
}

/// Everything one extract needs beyond the targets themselves.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ExtractOptions {
    /// The folder to write into. Made if it is not there.
    pub destination: String,
    #[serde(default)]
    pub layout: ExtractLayout,
    /// Put each archive's files under a folder of the archive's own name,
    /// which is the layout a layer holds.
    #[serde(default)]
    pub per_archive_folder: bool,
    #[serde(default)]
    pub existing: ExistingFiles,
    /// The browser's filter chips. `None` writes every kind.
    #[serde(default)]
    pub kinds: Option<Vec<WorkshopFileKind>>,
}

/// What an extract will write, before it writes anything.
///
/// The dialog's summary line reads this, so a user sees the count, the size
/// and the archives before choosing a destination.
#[derive(Debug, Clone, Default, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ExtractPlan {
    pub files: u32,
    /// Uncompressed bytes, which is what lands on disk.
    pub bytes: u64,
    /// The `DATA/FINAL`-relative archives the run reads, in the order it does.
    pub archives: Vec<String>,
}

/// One kind of file an extract wrote, and how many.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ExtractKindCount {
    pub kind: WorkshopFileKind,
    pub count: u32,
}

/// What an extract did, summed over every archive it read.
#[derive(Debug, Clone, Default, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ExtractSummary {
    pub extracted: u32,
    pub skipped_existing: u32,
    pub skipped_by_filter: u32,
    /// Chunks the index named that the archive turned out not to hold, which
    /// means the two disagree rather than that anything failed.
    pub missing: u32,
    pub bytes_written: u64,
    /// Written files by the kind their bytes identify as, most first.
    pub by_kind: Vec<ExtractKindCount>,
    /// The cancel flag was set, so this is a part of what was asked for.
    pub cancelled: bool,
    /// Names the archives' own bins gave chunks no hash table knew.
    pub recovered: u32,
    /// The folder written into, for the report's **Open folder**.
    pub destination: String,
}

/// One archive's share of an extract.
#[derive(Debug)]
struct ArchiveWork {
    /// `DATA/FINAL`-relative name, as [`GameArchives::list`] gives it.
    wad: String,
    /// Chunks a hash table names, already past the kind filter.
    named: Vec<WadHash>,
    /// Chunks nothing names, which only their own bytes can be filtered by.
    unnamed: Vec<WadHash>,
}

impl ArchiveWork {
    fn len(&self) -> usize {
        self.named.len() + self.unnamed.len()
    }
}

/// The targets of one extract, expanded and grouped by archive.
#[derive(Debug, Default)]
pub struct ExtractJob {
    archives: Vec<ArchiveWork>,
    files: u32,
    bytes: u64,
}

impl ExtractJob {
    /// Expand `targets` into the chunks each archive owes, in archive order.
    ///
    /// A [`Dir`](ExtractTarget::Dir) row expands through the index, and an
    /// [`Archive`](ExtractTarget::Archive) row through the archive's own chunk
    /// table, which costs a header and a table read. A chunk named twice - once
    /// on its own row and once under a directory - is extracted once.
    ///
    /// # Errors
    ///
    /// Fails with [`AppError::InvalidPath`] when a target names a directory the
    /// index does not hold or a hash that is not sixteen hex digits, and with
    /// I/O or WAD errors when an archive row's archive cannot be read.
    pub fn plan(
        targets: &[ExtractTarget],
        kinds: Option<&[WorkshopFileKind]>,
        index: &GameIndex,
        archives: &GameArchives,
        resolver: &WadPathResolver,
    ) -> AppResult<Self> {
        let kinds: Option<HashSet<WorkshopFileKind>> =
            kinds.map(|kinds| kinds.iter().copied().collect());

        /* Grouped by archive rather than gathered flat: the run mounts each
        archive once, and a `BTreeMap` also settles the order the dialog lists
        them in and the run reads them in. */
        let mut grouped: BTreeMap<String, ArchiveChunks> = BTreeMap::new();
        let mut job = Self::default();

        for target in targets {
            match target {
                ExtractTarget::File {
                    wad,
                    path_hash,
                    path,
                    size_bytes,
                } => {
                    let hash = parse_hash(path_hash)?;
                    grouped.entry(wad.clone()).or_default().push(
                        hash,
                        path.as_deref(),
                        *size_bytes,
                        kinds.as_ref(),
                        &mut job,
                    );
                }
                ExtractTarget::Dir { path } => {
                    let files = index.files_under(path).ok_or_else(|| {
                        AppError::InvalidPath(format!(
                            "No such directory in the game index: {path}"
                        ))
                    })?;
                    for file in files {
                        let hash = parse_hash(&file.path_hash)?;
                        grouped.entry(file.wad).or_default().push(
                            hash,
                            file.path.as_deref(),
                            file.size_bytes,
                            kinds.as_ref(),
                            &mut job,
                        );
                    }
                }
                ExtractTarget::Archive { wad } => {
                    let entry = grouped.entry(wad.clone()).or_default();
                    let path = archives.archive_path(wad)?;
                    let archive = Wad::mount(BufReader::new(fs::File::open(&path)?))?;
                    let hashes: Vec<WadHash> = archive
                        .chunks()
                        .iter()
                        .map(|chunk| chunk.path_hash())
                        .collect();
                    for (chunk, name) in archive.chunks().iter().zip(resolver.resolve_all(&hashes))
                    {
                        entry.push(
                            chunk.path_hash(),
                            name.as_deref(),
                            chunk.uncompressed_size() as u64,
                            kinds.as_ref(),
                            &mut job,
                        );
                    }
                }
            }
        }

        job.archives = grouped
            .into_iter()
            .map(|(wad, chunks)| ArchiveWork {
                wad,
                named: chunks.named,
                unnamed: chunks.unnamed,
            })
            .filter(|work| work.len() > 0)
            .collect();
        Ok(job)
    }

    /// What this job will write, for the dialog's summary line.
    #[must_use]
    pub fn summary(&self) -> ExtractPlan {
        ExtractPlan {
            files: self.files,
            bytes: self.bytes,
            archives: self.archives.iter().map(|w| w.wad.clone()).collect(),
        }
    }

    /// Whether the job would write nothing at all.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.files == 0
    }

    /// Extract every chunk of the job, one archive at a time.
    ///
    /// Each archive is mounted for the run and dropped after it. The
    /// [`WadCache`](crate::game_wads::WadCache) is deliberately not used: a
    /// mount is a header and a chunk table, milliseconds, where an extraction
    /// holding the cache's lock would block every preview of that archive for
    /// the seconds the run takes.
    ///
    /// One archive at a time, because each run already spreads over up to
    /// eight threads and the install sits on one disk.
    ///
    /// # Errors
    ///
    /// Fails with [`AppError::ValidationFailed`] when `destination` is inside
    /// the League install, with [`AppError::InvalidPath`] when it is not valid
    /// UTF-8, and with I/O or WAD errors from the archives themselves. The
    /// first failing chunk fails the run, and the files written before it stay.
    pub fn run(
        &self,
        options: &ExtractOptions,
        config: &Config,
        archives: &GameArchives,
        resolver: &WadPathResolver,
        events: &dyn EventSink,
        cancel: &AtomicBool,
    ) -> AppResult<ExtractSummary> {
        let destination = PathBuf::from(&options.destination);
        reject_the_install(config, &destination)?;
        fs::create_dir_all(&destination)?;

        let kinds: Option<Vec<LeagueFileKind>> = options.kinds.as_ref().map(|kinds| {
            kinds
                .iter()
                .copied()
                .map(LeagueFileKind::from)
                .collect::<Vec<_>>()
        });

        let mut state = RunState {
            done: 0,
            total: self.files,
            bytes: 0,
            last_emit: None,
        };
        let mut totals = ExtractReport::default();

        for work in &self.archives {
            let out_dir = if options.per_archive_folder {
                destination.join(archive_folder(&work.wad))
            } else {
                destination.clone()
            };
            let out_dir = Utf8Path::from_path(&out_dir)
                .ok_or_else(|| {
                    AppError::InvalidPath(format!(
                        "Extract destination is not valid UTF-8: {}",
                        out_dir.display()
                    ))
                })?
                .to_owned();

            let path = archives.archive_path(&work.wad)?;
            let mut archive = Wad::mount(BufReader::new(fs::File::open(&path)?))?;

            /* Two runs when a kind filter is on and the archive holds chunks
            nothing names. The named ones were filtered by their extension when
            the job was planned, and only the bytes can say what an unnamed one
            is - which is what `with_type_filter` reads, and it reads it for
            every chunk it is given. */
            if !work.named.is_empty() {
                let report = self.extract_some(
                    &mut archive,
                    &work.named,
                    &out_dir,
                    &work.wad,
                    None,
                    options,
                    resolver,
                    events,
                    cancel,
                    &mut state,
                )?;
                merge(&mut totals, report);
            }
            if !work.unnamed.is_empty() {
                let report = self.extract_some(
                    &mut archive,
                    &work.unnamed,
                    &out_dir,
                    &work.wad,
                    kinds.as_deref(),
                    options,
                    resolver,
                    events,
                    cancel,
                    &mut state,
                )?;
                merge(&mut totals, report);
            }

            if cancel.load(Ordering::Relaxed) {
                totals.cancelled = true;
                break;
            }
        }

        if !totals.missing.is_empty() {
            tracing::warn!(
                missing = totals.missing.len(),
                "Extract asked for chunks the archives do not hold, so the index and the install disagree"
            );
        }

        Ok(ExtractSummary {
            extracted: totals.extracted as u32,
            skipped_existing: totals.skipped_existing as u32,
            skipped_by_filter: totals.skipped_by_filter as u32,
            missing: totals.missing.len() as u32,
            bytes_written: totals.bytes_written,
            by_kind: by_kind(&totals.by_kind),
            cancelled: totals.cancelled,
            recovered: totals.recovered.len() as u32,
            destination: options.destination.clone(),
        })
    }

    /// One extractor run over one archive's share of the chunks.
    #[allow(clippy::too_many_arguments)]
    fn extract_some<S: std::io::Read + std::io::Seek>(
        &self,
        archive: &mut Wad<S>,
        hashes: &[WadHash],
        out_dir: &Utf8Path,
        wad: &str,
        kinds: Option<&[LeagueFileKind]>,
        options: &ExtractOptions,
        resolver: &WadPathResolver,
        events: &dyn EventSink,
        cancel: &AtomicBool,
        state: &mut RunState,
    ) -> AppResult<ExtractReport> {
        let mut extractor = WadExtractor::new(resolver)
            .with_layout(options.layout.into())
            .with_existing_file_policy(options.existing.into())
            .with_cancel_flag(cancel)
            /* Left on: it returns before any work when the resolver names every
            chunk, and it is the whole answer for a machine whose hashtable
            cache has never been synced. */
            .with_name_recovery()
            .on_progress(|progress| state.advance(wad, progress, events));

        if let Some(kinds) = kinds {
            extractor = extractor.with_type_filter(kinds.iter().copied());
        }

        Ok(extractor.extract_chunks(archive, hashes.iter().copied(), out_dir)?)
    }
}

/// The counters an emit reads, carried across every archive of one run.
struct RunState {
    done: u32,
    total: u32,
    bytes: u64,
    last_emit: Option<Instant>,
}

impl RunState {
    /// Count one finished chunk, and emit if the throttle allows it.
    ///
    /// Always emits the last chunk of the run, so a bar that stopped short of
    /// the end is a run that stopped short of the end.
    fn advance(
        &mut self,
        wad: &str,
        progress: &ltk_wad::ExtractProgress<'_>,
        events: &dyn EventSink,
    ) {
        self.done += 1;
        self.bytes += progress.bytes();

        let now = Instant::now();
        let due = match self.last_emit {
            Some(last) => now.duration_since(last) >= PROGRESS_INTERVAL,
            None => true,
        };
        if !due && self.done < self.total {
            return;
        }
        self.last_emit = Some(now);

        events.emit(BackendEvent::ExtractProgress(ExtractProgress {
            current: self.done,
            total: self.total,
            current_path: Some(progress.path().to_owned()),
            bytes: self.bytes,
            archive: wad.to_owned(),
        }));
    }
}

/// One archive's chunks, split by whether anything names them.
#[derive(Debug, Default)]
struct ArchiveChunks {
    named: Vec<WadHash>,
    unnamed: Vec<WadHash>,
    seen: HashSet<WadHash>,
}

impl ArchiveChunks {
    /// Take one chunk, unless the kind filter drops it or it is already in.
    fn push(
        &mut self,
        hash: WadHash,
        path: Option<&str>,
        size_bytes: u64,
        kinds: Option<&HashSet<WorkshopFileKind>>,
        job: &mut ExtractJob,
    ) {
        if !self.seen.insert(hash) {
            return;
        }

        match path {
            /* A named chunk is filtered here, by the extension the tree read
            its row's icon off, so the extract writes what the tree showed. */
            Some(path) => {
                if let Some(kinds) = kinds
                    && !kinds.contains(&kind_of(path))
                {
                    return;
                }
                self.named.push(hash);
            }
            None => self.unnamed.push(hash),
        }

        job.files += 1;
        job.bytes += size_bytes;
    }
}

/// The kind a path's extension names, the way the tree reads it.
fn kind_of(path: &str) -> WorkshopFileKind {
    let extension = path.rsplit_once('.').map_or("", |(_, ext)| ext);
    LeagueFileKind::from_extension(extension).into()
}

/// Sixteen hex digits into the hash they spell.
fn parse_hash(hex: &str) -> AppResult<WadHash> {
    hex.parse()
        .map_err(|_| AppError::InvalidPath(format!("Not a chunk path hash: {hex}")))
}

/// The folder one archive's files sit under with **One folder per archive**.
///
/// The archive's own file name and not its `DATA/FINAL`-relative path, because
/// that is the shape a layer holds and the point of the switch is that the
/// folder drops straight onto one.
fn archive_folder(wad: &str) -> &str {
    wad.rsplit_once('/').map_or(wad, |(_, name)| name)
}

/// Fold one archive's report into the run's totals.
///
/// [`ExtractReport`] is `#[non_exhaustive]`, so the totals are built through
/// `Default` and added to field by field rather than destructured.
fn merge(totals: &mut ExtractReport, report: ExtractReport) {
    totals.extracted += report.extracted;
    totals.skipped_existing += report.skipped_existing;
    totals.skipped_by_filter += report.skipped_by_filter;
    totals.bytes_written += report.bytes_written;
    totals.missing.extend(report.missing);
    totals.cancelled |= report.cancelled;
    for (kind, count) in report.by_kind {
        *totals.by_kind.entry(kind).or_default() += count;
    }
    totals.recovered.names.extend(report.recovered.names);
    totals.recovered.bins_scanned += report.recovered.bins_scanned;
    totals.recovered.chunks_sniffed += report.recovered.chunks_sniffed;
}

/// The by-kind counts as the report shows them, most written first.
fn by_kind(counts: &BTreeMap<LeagueFileKind, usize>) -> Vec<ExtractKindCount> {
    let mut out: Vec<ExtractKindCount> = counts
        .iter()
        .map(|(&kind, &count)| ExtractKindCount {
            kind: kind.into(),
            count: count as u32,
        })
        .collect();
    out.sort_by_key(|entry| std::cmp::Reverse(entry.count));
    out
}

/// Refuse a destination inside the League install.
///
/// The manager never writes into the game directory, and an extract is not the
/// exception. An install that is not configured guards nothing, because there
/// is no directory to be inside of.
fn reject_the_install(config: &Config, destination: &Path) -> AppResult<()> {
    if config.league_path.is_none() {
        return Ok(());
    }
    let Ok(game_dir) = GameDir::resolve(config) else {
        return Ok(());
    };

    if is_within(game_dir.path(), destination) {
        return Err(AppError::ValidationFailed(format!(
            "Cannot extract into the League install: {}",
            destination.display()
        )));
    }
    Ok(())
}

/// Whether `path` is `root` or sits under it.
///
/// Compares what the file system resolves rather than the text of either, so a
/// `..` hop or a mapped drive cannot walk into the install unnoticed. A
/// destination that does not exist yet resolves through its deepest ancestor
/// that does, which is the directory it would be made under.
fn is_within(root: &Path, path: &Path) -> bool {
    let Ok(root) = fs::canonicalize(root) else {
        return false;
    };
    let Some(path) = canonicalize_existing(path) else {
        return false;
    };
    path.starts_with(&root)
}

/// `path` with its deepest existing ancestor resolved and the rest re-joined.
fn canonicalize_existing(path: &Path) -> Option<PathBuf> {
    let mut rest = Vec::new();
    let mut cursor = path;

    loop {
        if let Ok(resolved) = fs::canonicalize(cursor) {
            let mut out = resolved;
            for part in rest.iter().rev() {
                out.push(part);
            }
            return Some(out);
        }
        rest.push(cursor.file_name()?);
        cursor = cursor.parent()?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::NullEventSink;
    use ltk_wad::{WadBuilder, WadChunkBuilder};
    use std::io::Write as _;

    fn final_dir(root: &Path) -> PathBuf {
        let dir = root.join("DATA").join("FINAL");
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn build_wad(path: &Path, chunk_paths: &[&str]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut builder = WadBuilder::default();
        for chunk_path in chunk_paths {
            builder = builder.with_chunk(WadChunkBuilder::default().with_path(*chunk_path));
        }
        let mut file = fs::File::create(path).unwrap();
        builder
            .build_to_writer(&mut file, |_path_hash, cursor| {
                cursor.write_all(&[0xAA; 64])?;
                Ok(())
            })
            .unwrap();
    }

    fn names(paths: &[&str]) -> WadPathResolver {
        let mut db = crate::hashtables::LayeredHashDb::new();
        for path in paths {
            db.insert(xxhash_rust::xxh64::xxh64(path.as_bytes(), 0), *path);
        }
        WadPathResolver::new(db)
    }

    fn options(destination: &Path) -> ExtractOptions {
        ExtractOptions {
            destination: destination.to_string_lossy().into_owned(),
            layout: ExtractLayout::Paths,
            per_archive_folder: false,
            existing: ExistingFiles::Skip,
            kinds: None,
        }
    }

    fn hash_of(path: &str) -> String {
        format!("{:016x}", xxhash_rust::xxh64::xxh64(path.as_bytes(), 0))
    }

    #[test]
    fn an_archive_target_takes_every_chunk_of_the_archive() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = final_dir(tmp.path());
        build_wad(
            &dir.join("Aatrox.wad.client"),
            &["assets/one.dds", "assets/two.bin"],
        );
        let archives = GameArchives::at(tmp.path());
        let resolver = names(&["assets/one.dds", "assets/two.bin"]);

        let job = ExtractJob::plan(
            &[ExtractTarget::Archive {
                wad: "Aatrox.wad.client".to_owned(),
            }],
            None,
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &resolver,
        )
        .unwrap();

        assert_eq!(job.summary().files, 2);
        assert_eq!(job.summary().archives, ["Aatrox.wad.client"]);
    }

    #[test]
    fn a_chunk_named_twice_is_planned_once() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = final_dir(tmp.path());
        build_wad(&dir.join("Aatrox.wad.client"), &["assets/one.dds"]);
        let archives = GameArchives::at(tmp.path());
        let resolver = names(&["assets/one.dds"]);

        let job = ExtractJob::plan(
            &[
                ExtractTarget::Archive {
                    wad: "Aatrox.wad.client".to_owned(),
                },
                ExtractTarget::File {
                    wad: "Aatrox.wad.client".to_owned(),
                    path_hash: hash_of("assets/one.dds"),
                    path: Some("assets/one.dds".to_owned()),
                    size_bytes: 64,
                },
            ],
            None,
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &resolver,
        )
        .unwrap();

        assert_eq!(job.summary().files, 1);
    }

    #[test]
    fn the_kind_filter_drops_a_named_chunk_of_another_kind() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = final_dir(tmp.path());
        build_wad(
            &dir.join("Aatrox.wad.client"),
            &["assets/one.dds", "assets/two.bin"],
        );
        let archives = GameArchives::at(tmp.path());
        let resolver = names(&["assets/one.dds", "assets/two.bin"]);

        let job = ExtractJob::plan(
            &[ExtractTarget::Archive {
                wad: "Aatrox.wad.client".to_owned(),
            }],
            Some(&[WorkshopFileKind::TextureDds]),
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &resolver,
        )
        .unwrap();

        assert_eq!(job.summary().files, 1);
    }

    #[test]
    fn extracting_writes_each_chunk_at_its_path() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().join("out");
        let dir = final_dir(tmp.path());
        build_wad(
            &dir.join("Aatrox.wad.client"),
            &["assets/one.dds", "assets/deep/two.bin"],
        );
        let archives = GameArchives::at(tmp.path());
        let resolver = names(&["assets/one.dds", "assets/deep/two.bin"]);

        let job = ExtractJob::plan(
            &[ExtractTarget::Archive {
                wad: "Aatrox.wad.client".to_owned(),
            }],
            None,
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &resolver,
        )
        .unwrap();
        let summary = job
            .run(
                &options(&out),
                &Config::default(),
                &archives,
                &resolver,
                &NullEventSink,
                &AtomicBool::new(false),
            )
            .unwrap();

        assert_eq!(summary.extracted, 2);
        assert_eq!(summary.bytes_written, 128);
        assert!(out.join("assets/one.dds").is_file());
        assert!(out.join("assets/deep/two.bin").is_file());
    }

    #[test]
    fn one_folder_per_archive_names_it_by_the_archive_alone() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().join("out");
        let dir = final_dir(tmp.path());
        build_wad(
            &dir.join("Champions").join("Aatrox.wad.client"),
            &["assets/one.dds"],
        );
        let archives = GameArchives::at(tmp.path());
        let resolver = names(&["assets/one.dds"]);

        let job = ExtractJob::plan(
            &[ExtractTarget::Archive {
                wad: "Champions/Aatrox.wad.client".to_owned(),
            }],
            None,
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &resolver,
        )
        .unwrap();
        let mut options = options(&out);
        options.per_archive_folder = true;
        job.run(
            &options,
            &Config::default(),
            &archives,
            &resolver,
            &NullEventSink,
            &AtomicBool::new(false),
        )
        .unwrap();

        assert!(out.join("Aatrox.wad.client/assets/one.dds").is_file());
    }

    #[test]
    fn skip_leaves_a_file_that_is_already_there() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().join("out");
        fs::create_dir_all(out.join("assets")).unwrap();
        fs::write(out.join("assets/one.dds"), b"mine").unwrap();
        let dir = final_dir(tmp.path());
        build_wad(&dir.join("Aatrox.wad.client"), &["assets/one.dds"]);
        let archives = GameArchives::at(tmp.path());
        let resolver = names(&["assets/one.dds"]);

        let job = ExtractJob::plan(
            &[ExtractTarget::Archive {
                wad: "Aatrox.wad.client".to_owned(),
            }],
            None,
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &resolver,
        )
        .unwrap();
        let summary = job
            .run(
                &options(&out),
                &Config::default(),
                &archives,
                &resolver,
                &NullEventSink,
                &AtomicBool::new(false),
            )
            .unwrap();

        assert_eq!(summary.extracted, 0);
        assert_eq!(summary.skipped_existing, 1);
        assert_eq!(fs::read(out.join("assets/one.dds")).unwrap(), b"mine");
    }

    #[test]
    fn a_chunk_nothing_names_lands_under_its_hex_hash() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().join("out");
        let dir = final_dir(tmp.path());
        build_wad(&dir.join("Aatrox.wad.client"), &["assets/one.dds"]);
        let archives = GameArchives::at(tmp.path());

        let job = ExtractJob::plan(
            &[ExtractTarget::Archive {
                wad: "Aatrox.wad.client".to_owned(),
            }],
            None,
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &names(&[]),
        )
        .unwrap();
        let summary = job
            .run(
                &options(&out),
                &Config::default(),
                &archives,
                &names(&[]),
                &NullEventSink,
                &AtomicBool::new(false),
            )
            .unwrap();

        assert_eq!(summary.extracted, 1);
        let written: Vec<String> = fs::read_dir(&out)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(written, [hash_of("assets/one.dds")]);
    }

    #[test]
    fn a_destination_inside_the_install_is_refused() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = final_dir(tmp.path());
        build_wad(&dir.join("Aatrox.wad.client"), &["assets/one.dds"]);
        let archives = GameArchives::at(tmp.path());
        let resolver = names(&["assets/one.dds"]);
        let config = Config {
            league_path: Some(tmp.path().to_path_buf()),
            ..Config::default()
        };

        let job = ExtractJob::plan(
            &[ExtractTarget::Archive {
                wad: "Aatrox.wad.client".to_owned(),
            }],
            None,
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &resolver,
        )
        .unwrap();
        let err = job
            .run(
                &options(&tmp.path().join("DATA").join("mine")),
                &config,
                &archives,
                &resolver,
                &NullEventSink,
                &AtomicBool::new(false),
            )
            .unwrap_err();

        assert!(matches!(err, AppError::ValidationFailed(_)));
    }

    #[test]
    fn a_cancelled_run_says_so() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().join("out");
        let dir = final_dir(tmp.path());
        build_wad(&dir.join("Aatrox.wad.client"), &["assets/one.dds"]);
        let archives = GameArchives::at(tmp.path());
        let resolver = names(&["assets/one.dds"]);

        let job = ExtractJob::plan(
            &[ExtractTarget::Archive {
                wad: "Aatrox.wad.client".to_owned(),
            }],
            None,
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &resolver,
        )
        .unwrap();
        let summary = job
            .run(
                &options(&out),
                &Config::default(),
                &archives,
                &resolver,
                &NullEventSink,
                &AtomicBool::new(true),
            )
            .unwrap();

        assert!(summary.cancelled);
        assert_eq!(summary.extracted, 0);
    }

    #[test]
    fn a_directory_target_takes_every_file_below_it() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = final_dir(tmp.path());
        build_wad(
            &dir.join("Aatrox.wad.client"),
            &[
                "assets/skins/base/one.dds",
                "assets/skins/two.dds",
                "data/three.bin",
            ],
        );
        let archives = GameArchives::at(tmp.path());
        let mut db = ltk_hashdb::LayeredHashDb::new();
        for path in [
            "assets/skins/base/one.dds",
            "assets/skins/two.dds",
            "data/three.bin",
        ] {
            db.insert(xxhash_rust::xxh64::xxh64(path.as_bytes(), 0), path);
        }
        let index = GameIndex::build(&archives, &db).unwrap();

        let job = ExtractJob::plan(
            &[ExtractTarget::Dir {
                path: "assets/skins".to_owned(),
            }],
            None,
            &index,
            &archives,
            &names(&[
                "assets/skins/base/one.dds",
                "assets/skins/two.dds",
                "data/three.bin",
            ]),
        )
        .unwrap();

        assert_eq!(job.summary().files, 2);
    }

    #[test]
    fn a_directory_the_index_does_not_hold_is_an_invalid_path() {
        let tmp = tempfile::tempdir().unwrap();
        final_dir(tmp.path());
        let archives = GameArchives::at(tmp.path());
        let index = GameIndex::build(&archives, &Default::default()).unwrap();

        let err = ExtractJob::plan(
            &[ExtractTarget::Dir {
                path: "nope/nowhere".to_owned(),
            }],
            None,
            &index,
            &archives,
            &names(&[]),
        )
        .unwrap_err();

        assert!(matches!(err, AppError::InvalidPath(_)));
    }

    #[test]
    fn the_flat_layout_drops_the_directories() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().join("out");
        let dir = final_dir(tmp.path());
        build_wad(&dir.join("Aatrox.wad.client"), &["assets/deep/one.dds"]);
        let archives = GameArchives::at(tmp.path());
        let resolver = names(&["assets/deep/one.dds"]);

        let job = ExtractJob::plan(
            &[ExtractTarget::Archive {
                wad: "Aatrox.wad.client".to_owned(),
            }],
            None,
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &resolver,
        )
        .unwrap();
        let mut options = options(&out);
        options.layout = ExtractLayout::Flat;
        job.run(
            &options,
            &Config::default(),
            &archives,
            &resolver,
            &NullEventSink,
            &AtomicBool::new(false),
        )
        .unwrap();

        assert!(out.join("one.dds").is_file());
    }

    #[test]
    fn a_run_reports_its_last_chunk() {
        struct Counting(std::sync::Mutex<Vec<ExtractProgress>>);
        impl EventSink for Counting {
            fn emit(&self, event: BackendEvent) {
                if let BackendEvent::ExtractProgress(progress) = event {
                    self.0.lock().unwrap().push(progress);
                }
            }
        }

        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().join("out");
        let dir = final_dir(tmp.path());
        build_wad(
            &dir.join("Aatrox.wad.client"),
            &["assets/one.dds", "assets/two.dds"],
        );
        let archives = GameArchives::at(tmp.path());
        let resolver = names(&["assets/one.dds", "assets/two.dds"]);
        let events = Counting(std::sync::Mutex::new(Vec::new()));

        let job = ExtractJob::plan(
            &[ExtractTarget::Archive {
                wad: "Aatrox.wad.client".to_owned(),
            }],
            None,
            &GameIndex::build(&archives, &Default::default()).unwrap(),
            &archives,
            &resolver,
        )
        .unwrap();
        job.run(
            &options(&out),
            &Config::default(),
            &archives,
            &resolver,
            &events,
            &AtomicBool::new(false),
        )
        .unwrap();

        let seen = events.0.lock().unwrap();
        let last = seen.last().expect("the run reports at least one chunk");
        assert_eq!(last.current, 2);
        assert_eq!(last.total, 2);
    }

    #[test]
    fn the_archive_folder_is_the_file_name_alone() {
        assert_eq!(
            archive_folder("Champions/Aatrox.wad.client"),
            "Aatrox.wad.client"
        );
        assert_eq!(archive_folder("Global.wad.client"), "Global.wad.client");
    }

    #[test]
    fn a_path_that_does_not_exist_yet_resolves_through_its_parent() {
        let tmp = tempfile::tempdir().unwrap();

        assert!(is_within(tmp.path(), &tmp.path().join("not/here/yet")));
        assert!(!is_within(&tmp.path().join("a"), &tmp.path().join("b")));
    }
}
