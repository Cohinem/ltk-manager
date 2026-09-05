//! Every bin object the install declares, and the file that declares it.
//!
//! The locations half of the palette's object search. The names half is the
//! `binentries` table, resolved once the rows are built and held beside them.
//! Fed by the built [`GameIndex`], which already folded the install's chunks
//! and numbered its archives, so no table of contents is walked twice.
//!
//! Per "The bin object index" in `docs/ux/PROJECT_EDITOR.md`, and section 10 of
//! `docs/research/bin-object-index.md`.

use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};
use std::fs;
use std::io::{BufReader, Cursor};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering as AtomicOrdering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use ltk_hash::BinHash;
use ltk_meta::BinOverride;
use ltk_meta::stream::BinStream;
use ltk_wad::{Wad, WadHash, hex_name};
use serde::Serialize;

use crate::error::{AppError, AppResult, MutexResultExt};
use crate::game_index::{GameIndex, SEARCH_LIMIT, SearchGeneration};
use crate::game_wads::GameArchives;
use crate::hashtables::BinHashTables;
use crate::matcher::{EXACT_SCORE, Query, Range, letter_mask, mask_covers};
use crate::problems::names::hex;

/// The magic a `PTCH` opens with, which the streaming reader refuses.
const PATCH_MAGIC: [u8; 4] = *b"PTCH";

/// How many rows a scan reads between two tests of the generation.
const STALE_CHECK_INTERVAL: u32 = 4096;

/// One row a search matched, with the runs its path marks.
///
/// The object's whole path is the row's title, so `ranges` are byte offsets
/// into `path`. An object or a class no table names reads as its hex.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ObjectSearchHit {
    /// The object's path hash, as `0x` and eight hex digits.
    pub object_hash: String,
    /// The object's path, or its hash when no table names it.
    pub path: String,
    pub ranges: Vec<Range>,
    /// The class the object declares, or its hash when no table names it.
    pub class: String,
    /// The declaring chunk's path hash as 16 lowercase hex digits.
    pub file_hash: String,
    /// The declaring chunk's path.
    pub file: String,
    /// The `DATA/FINAL`-relative archive the declaring chunk was read from.
    pub wad: String,
    /// 0 is a name the query opens, 1 a name holding it, 2 a match reaching the path.
    pub band: u8,
    pub score: f64,
}

/// What one search of the object index found.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ObjectSearchResult {
    /// The best rows, best first, capped at [`SEARCH_LIMIT`].
    pub hits: Vec<ObjectSearchHit>,
    /// How many rows matched in all, which the cap trimmed.
    pub total: u32,
    /// A newer search started before this one finished, so it gave up early.
    pub superseded: bool,
    /// No table named a single object, so only a hash can match.
    pub unnamed: bool,
}

/// What a build measured.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ObjectIndexStats {
    /// Archives holding at least one named `.bin` chunk.
    pub archives: u32,
    /// Named `.bin` chunks the build read, whether or not they read.
    pub files: u32,
    /// Declarations, one per object per declaring file.
    pub rows: u32,
    /// Chunks that would not read, which never fail the build.
    pub skipped: u32,
    /// Decompressed bytes read.
    pub bytes: u64,
    pub elapsed: Duration,
    /// Threads the build ran on.
    pub workers: u32,
}

/// The names the index resolves its hashes through.
///
/// The mimir tables in the app, and whatever a test hands in.
pub trait ObjectNames {
    /// Visit the path of every object in `hashes` a table names, with its index.
    fn for_each_entry(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str));

    /// The name of a class, or `None` when no table names it.
    fn class(&self, hash: BinHash) -> Option<String>;
}

impl ObjectNames for BinHashTables {
    fn for_each_entry(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        BinHashTables::for_each_entry(self, hashes, visit);
    }

    fn class(&self, hash: BinHash) -> Option<String> {
        BinHashTables::class(self, hash)
    }
}

/// One declaration: an object, its class, and the chunk that declares it.
///
/// The chunk is its WAD path hash, which survives a rebuild of the game index.
#[derive(Debug, Clone, Copy)]
struct Row {
    object: BinHash,
    class: BinHash,
    file: WadHash,
}

/// One `.bin` chunk the build read, which a row's file hash resolves to.
#[derive(Debug)]
struct DeclaringFile {
    path_hash: WadHash,
    path: Box<str>,
    /// Index into [`Declarations::wads`].
    wad: u32,
}

/// What a build fills, and what a renaming shares untouched.
#[derive(Debug, Default)]
struct Declarations {
    /// In archive order, and in the game index's tree order within one.
    rows: Vec<Row>,
    files: Vec<DeclaringFile>,
    /// A declaring chunk's index in `files`, by its path hash.
    by_file: HashMap<WadHash, u32>,
    /// Archive names, in the game index's order.
    wads: Vec<String>,
    stats: ObjectIndexStats,
}

/// One object's resolved path, with its letters for the mask to reject on.
#[derive(Debug)]
struct Named {
    name: Box<str>,
    mask: u32,
}

/// The names resolved for one index, resident while it is.
#[derive(Debug, Default)]
struct Names {
    objects: HashMap<BinHash, Named>,
    classes: HashMap<BinHash, Box<str>>,
}

/// Every bin object the install declares, searchable by path or by hash.
///
/// Built once a session behind the Objects switch, and renamed in place when
/// the hash tables move, because the rows are the install's and the names
/// are the tables'.
#[derive(Debug)]
pub struct ObjectIndex {
    declared: Arc<Declarations>,
    names: Names,
}

impl ObjectIndex {
    /// Read every named `.bin` chunk of the install for what it declares.
    ///
    /// One job per archive in the game index's order, each mounting its
    /// archive itself, on at most `workers` threads, with the rows landing in
    /// that order. A chunk that will not read is skipped and counted.
    ///
    /// `called_off` is tested before each archive, so a build nobody wants
    /// stops at the next one rather than decompressing the rest.
    ///
    /// The index comes back unnamed. [`named`](Self::named) resolves it.
    ///
    /// # Errors
    ///
    /// Fails when the build was called off, and when the archives cannot be
    /// resolved. An archive that will not mount is skipped and logged.
    pub fn build(
        game: &GameIndex,
        archives: &GameArchives,
        workers: usize,
        called_off: &(impl Fn() -> bool + Sync),
    ) -> AppResult<Self> {
        let started = Instant::now();
        let wads = game.wads().to_vec();

        let mut per_archive: Vec<Vec<(WadHash, Box<str>)>> =
            (0..wads.len()).map(|_| Vec::new()).collect();
        game.for_each_named_file(|hash, path, wad| {
            if is_bin(path) {
                per_archive[wad as usize].push((WadHash(hash), path.into()));
            }
        });

        let jobs: Vec<ArchiveJob<'_>> = per_archive
            .into_iter()
            .enumerate()
            .filter(|(_, chunks)| !chunks.is_empty())
            .map(|(ordinal, chunks)| ArchiveJob {
                ordinal: ordinal as u32,
                name: &wads[ordinal],
                chunks,
            })
            .collect();
        let workers = workers.clamp(1, jobs.len().max(1));

        let outcomes = map_bounded(&jobs, workers, called_off, |job| job.read(archives));

        let mut declared = Declarations::default();
        let mut stats = ObjectIndexStats {
            archives: jobs.len() as u32,
            workers: workers as u32,
            ..ObjectIndexStats::default()
        };

        for (job, outcome) in jobs.iter().zip(outcomes) {
            let Some(outcome) = outcome else {
                return Err(AppError::Other(
                    "The object index build was called off".to_owned(),
                ));
            };
            stats.files += job.chunks.len() as u32;
            match outcome {
                Ok(read) => {
                    stats.rows += read.rows.len() as u32;
                    stats.skipped += read.skipped;
                    stats.bytes += read.bytes;
                    declared.rows.extend(read.rows);
                    for file in read.files {
                        declared
                            .by_file
                            .insert(file.path_hash, declared.files.len() as u32);
                        declared.files.push(file);
                    }
                }
                Err(e) => {
                    stats.skipped += job.chunks.len() as u32;
                    tracing::warn!("Skipping unreadable game archive {}: {e}", job.name);
                }
            }
        }
        drop(jobs);

        stats.elapsed = started.elapsed();
        tracing::info!(
            archives = stats.archives,
            files = stats.files,
            rows = stats.rows,
            skipped = stats.skipped,
            bytes = stats.bytes,
            elapsed_ms = stats.elapsed.as_millis() as u64,
            workers = stats.workers,
            "Built the bin object index"
        );

        declared.wads = wads;
        declared.stats = stats;
        Ok(Self {
            declared: Arc::new(declared),
            names: Names::default(),
        })
    }

    /// This index with its names resolved through `names`, rows untouched.
    ///
    /// Every distinct object and class hash is looked up once, and the
    /// answers stay resident with the index. Called at warm, and again when a
    /// hashtable sync replaces the tables.
    pub fn named(&self, names: &impl ObjectNames) -> Self {
        let started = Instant::now();
        let rows = &self.declared.rows;

        let mut objects: Vec<BinHash> = rows.iter().map(|row| row.object).collect();
        objects.sort_unstable();
        objects.dedup();
        let mut resolved: HashMap<BinHash, Named> = HashMap::with_capacity(objects.len());
        names.for_each_entry(&objects, &mut |at, name| {
            resolved.insert(
                objects[at],
                Named {
                    mask: letter_mask(name),
                    name: name.into(),
                },
            );
        });

        let mut classes: Vec<BinHash> = rows.iter().map(|row| row.class).collect();
        classes.sort_unstable();
        classes.dedup();
        let classes: HashMap<BinHash, Box<str>> = classes
            .into_iter()
            .filter_map(|class| Some((class, names.class(class)?.into_boxed_str())))
            .collect();

        tracing::debug!(
            objects = objects.len(),
            named = resolved.len(),
            classes = classes.len(),
            elapsed_ms = started.elapsed().as_millis() as u64,
            "Resolved the bin object index's names"
        );

        Self {
            declared: Arc::clone(&self.declared),
            names: Names {
                objects: resolved,
                classes,
            },
        }
    }

    /// What the build measured.
    pub fn stats(&self) -> ObjectIndexStats {
        self.declared.stats
    }

    /// The best rows of the index for one query, best first.
    ///
    /// A query of eight hex digits, with or without `0x`, is looked up as a
    /// hash rather than matched. Anything else is ranked on the shared rule,
    /// with the last `/` segment of the object's path taking the name's band.
    ///
    /// `is_overtaken` is tested every few thousand rows, the contract
    /// [`GameIndex::search`] sets. An empty query matches nothing.
    pub fn search(&self, query: &str, is_overtaken: impl Fn() -> bool) -> ObjectSearchResult {
        let rows = &self.declared.rows;
        let unnamed = self.names.objects.is_empty() && !rows.is_empty();

        if let Some(hash) = parse_hash(query) {
            return self.by_hash(hash, unnamed);
        }

        let Some(query) = Query::parse(query) else {
            return ObjectSearchResult {
                hits: Vec::new(),
                total: 0,
                superseded: false,
                unnamed,
            };
        };

        let mask = query.mask();
        let mut heap: BinaryHeap<Hit<'_>> = BinaryHeap::with_capacity(SEARCH_LIMIT + 1);
        let mut total = 0u32;
        let mut since_check = 0u32;
        let mut overtaken = false;

        for (at, row) in rows.iter().enumerate() {
            since_check += 1;
            if since_check >= STALE_CHECK_INTERVAL {
                since_check = 0;
                overtaken = is_overtaken();
                if overtaken {
                    break;
                }
            }

            let Some(named) = self.names.objects.get(&row.object) else {
                continue;
            };
            if !mask_covers(named.mask, mask) {
                continue;
            }
            let Some((band, score, _)) = rank(&query, &named.name) else {
                continue;
            };

            total += 1;
            let file = self.declared.file(row.file);
            let hit = Hit {
                band,
                score,
                length: named.name.len() as u32,
                wad: file.map_or(0, |file| file.wad),
                name: &named.name,
                file: file.map_or("", |file| &file.path),
                at: at as u32,
            };
            if heap.len() < SEARCH_LIMIT {
                heap.push(hit);
            } else if heap.peek().is_some_and(|worst| hit < *worst) {
                heap.pop();
                heap.push(hit);
            }
        }

        let hits = heap
            .into_sorted_vec()
            .into_iter()
            .map(|hit| {
                /* Recomputed for the rows that survived, which is cheaper than
                keeping a run list per candidate the heap then drops. */
                let ranges = rank(&query, hit.name).map_or_else(Vec::new, |(_, _, ranges)| ranges);
                self.hit(hit.at as usize, hit.band, hit.score, ranges)
            })
            .collect();

        ObjectSearchResult {
            hits,
            total,
            superseded: overtaken,
            unnamed,
        }
    }

    /// Every declaration of one object, in row order.
    fn by_hash(&self, hash: BinHash, unnamed: bool) -> ObjectSearchResult {
        let rows = &self.declared.rows;
        let total = rows.iter().filter(|row| row.object == hash).count() as u32;
        let hits = rows
            .iter()
            .enumerate()
            .filter(|(_, row)| row.object == hash)
            .take(SEARCH_LIMIT)
            .map(|(at, _)| self.hit(at, 0, EXACT_SCORE, Vec::new()))
            .collect();

        ObjectSearchResult {
            hits,
            total,
            superseded: false,
            unnamed,
        }
    }

    /// The wire shape of the row at `at`.
    fn hit(&self, at: usize, band: u8, score: f64, ranges: Vec<Range>) -> ObjectSearchHit {
        let row = &self.declared.rows[at];
        let (file, wad) = self.declared.file(row.file).map_or_else(
            || (hex_name(row.file), ""),
            |file| {
                (
                    file.path.to_string(),
                    self.declared.wads[file.wad as usize].as_str(),
                )
            },
        );

        ObjectSearchHit {
            object_hash: hex(row.object),
            path: self
                .names
                .objects
                .get(&row.object)
                .map_or_else(|| hex(row.object), |named| named.name.to_string()),
            ranges,
            class: self
                .names
                .classes
                .get(&row.class)
                .map_or_else(|| hex(row.class), ToString::to_string),
            file_hash: hex_name(row.file),
            file,
            wad: wad.to_owned(),
            band,
            score,
        }
    }

    /// Every row as `(object, class, declaring file path)`, in row order.
    #[cfg(test)]
    fn rows(&self) -> impl Iterator<Item = (BinHash, BinHash, &str)> {
        self.declared.rows.iter().map(|row| {
            let file = self.declared.file(row.file).map_or("", |file| &file.path);
            (row.object, row.class, file)
        })
    }
}

impl Declarations {
    fn file(&self, path_hash: WadHash) -> Option<&DeclaringFile> {
        self.by_file
            .get(&path_hash)
            .map(|&at| &self.files[at as usize])
    }
}

/// Band, score and marked runs for one object path, or `None` for no match.
///
/// The last `/` segment is the name: a query that opens it is band 0, one it
/// holds is band 1, and a query the rest of the path is needed for is band 2.
/// The runs are offsets into the whole path either way.
fn rank(query: &Query, path: &str) -> Option<(u8, f64, Vec<Range>)> {
    let cut = path.rfind('/').map_or(0, |at| at + 1);
    let name = &path[cut..];

    if let Some(matched) = query.matches(name) {
        let band = u8::from(!query.starts(name));
        let cut = cut as u32;
        let ranges = matched
            .ranges
            .into_iter()
            .map(|(start, end)| (start + cut, end + cut))
            .collect();
        return Some((band, matched.score, ranges));
    }

    if cut == 0 {
        return None;
    }
    let matched = query.matches(path)?;
    Some((2, matched.score, matched.ranges))
}

/// The object hash a query of eight hex digits names, `0x` or not.
fn parse_hash(query: &str) -> Option<BinHash> {
    let digits = query.trim();
    let digits = digits
        .strip_prefix("0x")
        .or_else(|| digits.strip_prefix("0X"))
        .unwrap_or(digits);
    if digits.len() != 8 || !digits.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    u32::from_str_radix(digits, 16).ok().map(BinHash)
}

/// Whether a chunk path names a bin by its extension.
fn is_bin(path: &str) -> bool {
    path.len() >= 4
        && path
            .get(path.len() - 4..)
            .is_some_and(|tail| tail.eq_ignore_ascii_case(".bin"))
}

/// One kept row, ordered worst first so a bounded heap drops the right one.
#[derive(Debug)]
struct Hit<'a> {
    band: u8,
    score: f64,
    /// The length of the object path, so the shorter one wins a tie.
    length: u32,
    /// The archive's ordinal, so two declarations tie in archive order.
    wad: u32,
    name: &'a str,
    file: &'a str,
    at: u32,
}

impl Ord for Hit<'_> {
    /// Greater is worse: a higher band, a lower score, a longer path, a later
    /// archive, a later path, a later declaring file, and then a later row.
    fn cmp(&self, other: &Self) -> Ordering {
        self.band
            .cmp(&other.band)
            .then_with(|| other.score.total_cmp(&self.score))
            .then_with(|| self.length.cmp(&other.length))
            .then_with(|| self.wad.cmp(&other.wad))
            .then_with(|| self.name.cmp(other.name))
            .then_with(|| self.file.cmp(other.file))
            .then_with(|| self.at.cmp(&other.at))
    }
}

impl PartialOrd for Hit<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for Hit<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for Hit<'_> {}

/// One archive's share of the build: the named `.bin` chunks it carries.
#[derive(Debug)]
struct ArchiveJob<'a> {
    ordinal: u32,
    name: &'a str,
    chunks: Vec<(WadHash, Box<str>)>,
}

/// What one archive job read.
#[derive(Debug, Default)]
struct ArchiveRead {
    rows: Vec<Row>,
    files: Vec<DeclaringFile>,
    skipped: u32,
    bytes: u64,
}

impl ArchiveJob<'_> {
    /// Mount the archive and read every chunk of the job for its declarations.
    ///
    /// # Errors
    ///
    /// Fails when the archive cannot be opened or mounted. A chunk that will
    /// not read is skipped and counted rather than failing the job.
    fn read(&self, archives: &GameArchives) -> AppResult<ArchiveRead> {
        let path = archives.archive_path(self.name)?;
        let mut wad = Wad::mount(BufReader::new(fs::File::open(path)?))?;
        let mut read = ArchiveRead::default();

        for (path_hash, chunk_path) in &self.chunks {
            read.files.push(DeclaringFile {
                path_hash: *path_hash,
                path: chunk_path.clone(),
                wad: self.ordinal,
            });

            let bytes = match wad.chunks().get(*path_hash).copied() {
                Some(chunk) => wad.load_chunk_decompressed(&chunk),
                None => {
                    read.skipped += 1;
                    tracing::debug!("Skipping {}/{chunk_path}: not in the archive", self.name);
                    continue;
                }
            };
            let bytes = match bytes {
                Ok(bytes) => bytes,
                Err(e) => {
                    read.skipped += 1;
                    tracing::debug!("Skipping {}/{chunk_path}: {e}", self.name);
                    continue;
                }
            };
            read.bytes += bytes.len() as u64;

            let before = read.rows.len();
            if let Err(e) = declarations(&bytes, *path_hash, &mut read.rows) {
                read.rows.truncate(before);
                read.skipped += 1;
                tracing::debug!("Skipping {}/{chunk_path}: {e}", self.name);
            }
        }
        Ok(read)
    }
}

/// Push a row for every object `bytes` declares.
///
/// A `PROP` is swept through the object table, one 8-byte hop an object. A
/// `PTCH` is read whole, which is the fallback the problems pass carries too
/// while the streaming form of a patch waits upstream.
fn declarations(bytes: &[u8], file: WadHash, out: &mut Vec<Row>) -> Result<(), ltk_meta::Error> {
    if bytes.starts_with(&PATCH_MAGIC) {
        let patch = BinOverride::from_reader(&mut Cursor::new(bytes))?;
        out.extend(patch.objects.values().map(|object| Row {
            object: object.path_hash,
            class: object.class_hash,
            file,
        }));
        return Ok(());
    }

    let mut stream: BinStream<_> = BinStream::mount(Cursor::new(bytes))?;
    for entry in stream.entries() {
        let entry = entry?;
        out.push(Row {
            object: entry.path_hash,
            class: entry.class_hash,
            file,
        });
    }
    Ok(())
}

/// Run `job` over every item of `work` on at most `workers` threads.
///
/// Results come back in `work`'s own order. An item is `None` where the run
/// was called off before reaching it. The shape of `Budget::map` without the
/// budget, because the build is decompression and the budget's weight rule
/// is sized for the eager reader.
fn map_bounded<T, R>(
    work: &[T],
    workers: usize,
    called_off: &(impl Fn() -> bool + Sync),
    job: impl Fn(&T) -> R + Sync,
) -> Vec<Option<R>>
where
    T: Sync,
    R: Send,
{
    let done: Vec<Mutex<Option<R>>> = work.iter().map(|_| Mutex::new(None)).collect();
    let next = AtomicUsize::new(0);

    std::thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                loop {
                    let index = next.fetch_add(1, AtomicOrdering::Relaxed);
                    if index >= work.len() || called_off() {
                        return;
                    }
                    let answer = job(&work[index]);
                    *done[index]
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(answer);
                }
            });
        }
    });

    done.into_iter()
        .map(|slot| {
            slot.into_inner()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
        })
        .collect()
}

/// The newest object search asked for, on a line of its own.
///
/// Apart from [`SearchGeneration`] so a keystroke the game scan answers never
/// gives up a scan the object rows are waiting on, and the other way round.
#[derive(Debug, Default)]
pub struct ObjectSearchGeneration(SearchGeneration);

impl ObjectSearchGeneration {
    /// Take the newest ticket, which every scan already running is now behind.
    pub fn claim(&self) -> u64 {
        self.0.claim()
    }

    /// Whether a later search has claimed a ticket since this one.
    #[must_use]
    pub fn overtook(&self, ticket: u64) -> bool {
        self.0.overtook(ticket)
    }
}

/// One build's claim on the state, which a clear or a newer build revokes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuildTicket(u64);

/// What [`ObjectIndexState`] holds right now, for a search to answer from.
///
/// `E` is the shape a failed build is kept in, which the shell chooses so a
/// failure crosses IPC as it does everywhere else.
#[derive(Debug, Clone)]
pub enum ObjectIndexSnapshot<E> {
    /// Nothing has warmed the index, or the switch that gates it is off.
    Absent,
    /// A build is running.
    Building,
    /// The index, shared rather than locked.
    Ready(Arc<ObjectIndex>),
    /// The last build failed, and the next warm retries it.
    Failed(E),
}

#[derive(Debug)]
enum Slot<E> {
    Absent,
    Building(BuildTicket),
    Ready(Arc<ObjectIndex>),
    Failed(E),
}

/// The app-managed [`ObjectIndex`], in one of four slots.
///
/// Absent until something warms it, building while one does, and then ready
/// or failed. A build claims a ticket, and a result arriving after a clear or
/// under an older ticket is dropped, so a Rebuild or a switch-off mid-build
/// never lands an index nobody asked for.
#[derive(Debug)]
pub struct ObjectIndexState<E> {
    slot: Mutex<Slot<E>>,
    ticket: AtomicU64,
}

impl<E> Default for ObjectIndexState<E> {
    fn default() -> Self {
        Self {
            slot: Mutex::new(Slot::Absent),
            ticket: AtomicU64::new(0),
        }
    }
}

impl<E: Clone> ObjectIndexState<E> {
    /// Claim the state for a build, or `None` when one is running or done.
    ///
    /// A failed slot is claimed again, so the next warm retries it.
    ///
    /// # Errors
    ///
    /// Fails when a previous holder of the lock panicked.
    pub fn begin(&self) -> AppResult<Option<BuildTicket>> {
        let mut slot = self.slot.lock().mutex_err()?;
        if matches!(*slot, Slot::Building(_) | Slot::Ready(_)) {
            return Ok(None);
        }
        let ticket = BuildTicket(self.ticket.fetch_add(1, AtomicOrdering::Relaxed) + 1);
        *slot = Slot::Building(ticket);
        Ok(Some(ticket))
    }

    /// Whether `ticket` is still the build the state is waiting on.
    #[must_use]
    pub fn is_current(&self, ticket: BuildTicket) -> bool {
        self.ticket.load(AtomicOrdering::Relaxed) == ticket.0
    }

    /// Land a build's result, unless the state stopped waiting on it.
    ///
    /// # Errors
    ///
    /// Fails when a previous holder of the lock panicked.
    pub fn finish(&self, ticket: BuildTicket, built: Result<ObjectIndex, E>) -> AppResult<()> {
        let mut slot = self.slot.lock().mutex_err()?;
        if !matches!(*slot, Slot::Building(current) if current == ticket) {
            tracing::debug!("Dropping an object index build the state stopped waiting on");
            return Ok(());
        }
        *slot = match built {
            Ok(index) => Slot::Ready(Arc::new(index)),
            Err(error) => Slot::Failed(error),
        };
        Ok(())
    }

    /// Drop the index, and the result of any build still running.
    ///
    /// # Errors
    ///
    /// Fails when a previous holder of the lock panicked.
    pub fn clear(&self) -> AppResult<()> {
        let mut slot = self.slot.lock().mutex_err()?;
        self.ticket.fetch_add(1, AtomicOrdering::Relaxed);
        *slot = Slot::Absent;
        Ok(())
    }

    /// What the state holds, with the index shared rather than locked.
    ///
    /// # Errors
    ///
    /// Fails when a previous holder of the lock panicked.
    pub fn snapshot(&self) -> AppResult<ObjectIndexSnapshot<E>> {
        let slot = self.slot.lock().mutex_err()?;
        Ok(match &*slot {
            Slot::Absent => ObjectIndexSnapshot::Absent,
            Slot::Building(_) => ObjectIndexSnapshot::Building,
            Slot::Ready(index) => ObjectIndexSnapshot::Ready(Arc::clone(index)),
            Slot::Failed(error) => ObjectIndexSnapshot::Failed(error.clone()),
        })
    }

    /// Replace a ready index with `rename` of it, and leave any other slot alone.
    ///
    /// For a hashtable sync, which changes the names and not the rows.
    ///
    /// # Errors
    ///
    /// Fails when a previous holder of the lock panicked.
    pub fn rename(&self, rename: impl FnOnce(&ObjectIndex) -> ObjectIndex) -> AppResult<()> {
        let mut slot = self.slot.lock().mutex_err()?;
        if let Slot::Ready(index) = &*slot {
            *slot = Slot::Ready(Arc::new(rename(index)));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
