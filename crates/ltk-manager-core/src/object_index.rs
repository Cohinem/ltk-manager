//! Every bin object the install declares, and the file that declares it.
//!
//! The locations half of the palette's object search. The names half is the
//! `binentries` table, resolved once the rows are built and held beside them.
//! Fed by the built [`GameIndex`], which already folded the install's chunks
//! and numbered its archives, so no table of contents is walked twice.
//!
//! Per "The bin object index" in `docs/ux/PROJECT_EDITOR.md`, and section 10 of
//! `docs/research/bin-object-index.md`.

use std::borrow::Cow;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::fs;
use std::io::{BufReader, Cursor, Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering as AtomicOrdering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use ltk_file::{LeagueFileKind, MAX_MAGIC_SIZE};
use ltk_hash::BinHash;
use ltk_meta::BinOverride;
use ltk_meta::stream::BinStream;
use ltk_wad::{ChunkDecoder, Wad, WadHash, hex_name};
use serde::Serialize;

use crate::error::{AppError, AppResult, MutexResultExt};
use crate::game_index::{GameIndex, SEARCH_LIMIT, SearchGeneration};
use crate::game_wads::{GameArchives, chunk_head};
use crate::hashtables::{BinHashTables, WadPathResolver};
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

/// One class an ambiguous `class:` term matched, offered as a completion.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct ObjectClassHit {
    /// The class hash, as `0x` and eight hex digits.
    pub class_hash: String,
    /// The class's name, or its hash when no table names it.
    pub class: String,
    /// How many declarations carry the class.
    pub rows: u32,
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
    /// The classes an ambiguous `class:` term matched, in place of rows.
    pub classes: Vec<ObjectClassHit>,
}

impl ObjectSearchResult {
    /// A search that found nothing.
    fn empty(unnamed: bool) -> Self {
        Self {
            hits: Vec::new(),
            total: 0,
            superseded: false,
            unnamed,
            classes: Vec::new(),
        }
    }
}

/// What a build measured.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ObjectIndexStats {
    /// Archives holding at least one chunk the build read or sniffed.
    pub archives: u32,
    /// Bin chunks the build read, named or sniffed, whether or not they read.
    pub files: u32,
    /// Chunks no table names, each decoded far enough to read its magic.
    pub sniffed: u32,
    /// Of the sniffed, the ones whose magic was a bin's, and so were read.
    pub unnamed_bins: u32,
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

    /// Visit the path of every chunk in `hashes` a table names, with its index.
    ///
    /// For the declaring files the build sniffed unnamed, which a later table
    /// may name.
    fn for_each_file(&self, hashes: &[WadHash], visit: &mut dyn FnMut(usize, &str));
}

/// The shared cache's names: the bin tables for objects and classes, the WAD
/// tables for declaring files.
#[derive(Debug)]
pub struct CacheNames<'a> {
    bin: &'a BinHashTables,
    wad: &'a WadPathResolver,
}

impl<'a> CacheNames<'a> {
    /// Names out of `bin` and `wad`, both already opened by the caller.
    #[must_use]
    pub fn new(bin: &'a BinHashTables, wad: &'a WadPathResolver) -> Self {
        Self { bin, wad }
    }
}

impl ObjectNames for CacheNames<'_> {
    fn for_each_entry(&self, hashes: &[BinHash], visit: &mut dyn FnMut(usize, &str)) {
        self.bin.for_each_entry(hashes, visit);
    }

    fn class(&self, hash: BinHash) -> Option<String> {
        self.bin.class(hash)
    }

    fn for_each_file(&self, hashes: &[WadHash], visit: &mut dyn FnMut(usize, &str)) {
        self.wad.resolve_each(hashes, |at, path| {
            if let Some(path) = path {
                visit(at, path);
            }
        });
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

/// One bin chunk the build read, which a row's file hash resolves to.
#[derive(Debug)]
struct DeclaringFile {
    path_hash: WadHash,
    /// The path the game index named it by, or `None` for a sniffed chunk.
    path: Option<Box<str>>,
    /// Index into [`Declarations::wads`].
    wad: u32,
}

/// What a build fills, and what a renaming shares untouched.
#[derive(Debug, Default)]
struct Declarations {
    /// In archive order, and in the game index's tree order within one, the
    /// sniffed chunks after the named.
    rows: Vec<Row>,
    /// Every distinct object hash, sorted, for a lookup by hash.
    objects: Box<[BinHash]>,
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
    /// The declaring chunks the build sniffed that a table names after all.
    files: HashMap<WadHash, Box<str>>,
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
    /// Read every bin chunk of the install for what it declares.
    ///
    /// One job per archive in the game index's order, each mounting its
    /// archive itself, on at most `workers` threads, with the rows landing in
    /// that order. A named chunk is a bin by its extension. An unnamed one is
    /// decoded far enough to read its magic, and read whole only when the
    /// magic is a bin's. A chunk that will not read is skipped and counted.
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

        let mut named: Vec<Vec<(WadHash, Box<str>)>> =
            (0..wads.len()).map(|_| Vec::new()).collect();
        game.for_each_named_file(|hash, path, wad| {
            if is_bin(path) {
                named[wad as usize].push((WadHash(hash), path.into()));
            }
        });
        let mut unnamed: Vec<Vec<WadHash>> = (0..wads.len()).map(|_| Vec::new()).collect();
        game.for_each_unnamed_file(|hash, wad| unnamed[wad as usize].push(WadHash(hash)));

        let jobs: Vec<ArchiveJob<'_>> = named
            .into_iter()
            .zip(unnamed)
            .enumerate()
            .filter(|(_, (named, unnamed))| !named.is_empty() || !unnamed.is_empty())
            .map(|(ordinal, (named, unnamed))| ArchiveJob {
                ordinal: ordinal as u32,
                name: &wads[ordinal],
                named,
                unnamed,
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
            stats.files += job.named.len() as u32;
            match outcome {
                Ok(read) => {
                    stats.files += read.unnamed_bins;
                    stats.sniffed += read.sniffed;
                    stats.unnamed_bins += read.unnamed_bins;
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
                    stats.skipped += job.named.len() as u32;
                    tracing::warn!("Skipping unreadable game archive {}: {e}", job.name);
                }
            }
        }
        drop(jobs);

        let mut objects: Vec<BinHash> = declared.rows.iter().map(|row| row.object).collect();
        objects.sort_unstable();
        objects.dedup();
        declared.objects = objects.into_boxed_slice();

        stats.elapsed = started.elapsed();
        tracing::info!(
            archives = stats.archives,
            files = stats.files,
            sniffed = stats.sniffed,
            unnamed_bins = stats.unnamed_bins,
            rows = stats.rows,
            objects = declared.objects.len(),
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
    /// Every distinct object and class hash is looked up once, and so is every
    /// declaring chunk the build sniffed, and the answers stay resident with
    /// the index. Called at warm, and again when a hashtable sync replaces the
    /// tables.
    pub fn named(&self, names: &impl ObjectNames) -> Self {
        let started = Instant::now();
        let rows = &self.declared.rows;

        let objects = &self.declared.objects;
        let mut resolved: HashMap<BinHash, Named> = HashMap::with_capacity(objects.len());
        names.for_each_entry(objects, &mut |at, name| {
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

        let sniffed: Vec<WadHash> = self
            .declared
            .files
            .iter()
            .filter(|file| file.path.is_none())
            .map(|file| file.path_hash)
            .collect();
        let mut files: HashMap<WadHash, Box<str>> = HashMap::new();
        names.for_each_file(&sniffed, &mut |at, path| {
            files.insert(sniffed[at], path.into());
        });

        tracing::debug!(
            objects = objects.len(),
            named = resolved.len(),
            classes = classes.len(),
            sniffed_files = sniffed.len(),
            named_files = files.len(),
            elapsed_ms = started.elapsed().as_millis() as u64,
            "Resolved the bin object index's names"
        );

        Self {
            declared: Arc::clone(&self.declared),
            names: Names {
                objects: resolved,
                classes,
                files,
            },
        }
    }

    /// What the build measured.
    pub fn stats(&self) -> ObjectIndexStats {
        self.declared.stats
    }

    /// Whether any file of the install declares `object`.
    #[must_use]
    pub fn declares(&self, object: BinHash) -> bool {
        self.declared.objects.binary_search(&object).is_ok()
    }

    /// The best rows of the index for one query, best first.
    ///
    /// A `class:` term narrows the rows first, to the classes whose name the
    /// term opens or to the one class whose hash it is. While that term is the
    /// last one typed and more than one class matches, the answer is those
    /// classes as completions and no rows.
    ///
    /// A query of eight hex digits, with or without `0x`, is looked up as a
    /// hash rather than matched. Anything else is ranked on the shared rule,
    /// with the last `/` segment of the object's path taking the name's band.
    ///
    /// `is_overtaken` is tested every few thousand rows, the contract
    /// [`GameIndex::search`] sets. An empty query matches nothing, unless a
    /// class term narrowed it, and then every row of the class lists by path.
    pub fn search(&self, query: &str, is_overtaken: impl Fn() -> bool) -> ObjectSearchResult {
        let rows = &self.declared.rows;
        let unnamed = self.names.objects.is_empty() && !rows.is_empty();

        let (class_term, query) = ClassTerm::split(query);
        let classes = match class_term {
            None => None,
            Some(term) => {
                let matched = self.classes_opened_by(term.value);
                if term.last && matched.len() != 1 {
                    return self.class_completions(&matched, unnamed);
                }
                if matched.is_empty() {
                    return ObjectSearchResult::empty(unnamed);
                }
                Some(matched.into_iter().collect::<HashSet<BinHash>>())
            }
        };

        if let Some(hash) = parse_hash(&query) {
            return self.by_hash(hash, classes.as_ref(), unnamed);
        }

        let Some(query) = Query::parse(&query) else {
            return match classes {
                Some(classes) => self.listed(&classes, unnamed),
                None => ObjectSearchResult::empty(unnamed),
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

            if classes
                .as_ref()
                .is_some_and(|classes| !classes.contains(&row.class))
            {
                continue;
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
                file: file.and_then(|file| file.path.as_deref()).unwrap_or(""),
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
            classes: Vec::new(),
        }
    }

    /// Every declaration of one object, in row order, under `classes` if any.
    fn by_hash(
        &self,
        hash: BinHash,
        classes: Option<&HashSet<BinHash>>,
        unnamed: bool,
    ) -> ObjectSearchResult {
        let rows = &self.declared.rows;
        let wanted = |row: &Row| {
            row.object == hash && classes.is_none_or(|classes| classes.contains(&row.class))
        };
        let total = rows.iter().filter(|row| wanted(row)).count() as u32;
        let hits = rows
            .iter()
            .enumerate()
            .filter(|(_, row)| wanted(row))
            .take(SEARCH_LIMIT)
            .map(|(at, _)| self.hit(at, 0, EXACT_SCORE, Vec::new()))
            .collect();

        ObjectSearchResult {
            hits,
            total,
            superseded: false,
            unnamed,
            classes: Vec::new(),
        }
    }

    /// Every row of `classes`, by path, for a class term with nothing after it.
    fn listed(&self, classes: &HashSet<BinHash>, unnamed: bool) -> ObjectSearchResult {
        let rows = &self.declared.rows;
        let mut kept: Vec<(Cow<'_, str>, u32)> = rows
            .iter()
            .enumerate()
            .filter(|(_, row)| classes.contains(&row.class))
            .map(|(at, row)| {
                let name = self.names.objects.get(&row.object).map_or_else(
                    || Cow::Owned(hex(row.object)),
                    |named| Cow::Borrowed(&*named.name),
                );
                (name, at as u32)
            })
            .collect();
        kept.sort_unstable();

        ObjectSearchResult {
            total: kept.len() as u32,
            hits: kept
                .into_iter()
                .take(SEARCH_LIMIT)
                .map(|(_, at)| self.hit(at as usize, 0, 0.0, Vec::new()))
                .collect(),
            superseded: false,
            unnamed,
            classes: Vec::new(),
        }
    }

    /// The classes a `class:` term opens: one by hash, else every named class
    /// whose name starts with it, by name.
    fn classes_opened_by(&self, term: &str) -> Vec<BinHash> {
        if let Some(hash) = parse_hash(term) {
            return vec![hash];
        }
        let mut matched: Vec<(&str, BinHash)> = self
            .names
            .classes
            .iter()
            .filter(|(_, name)| {
                name.get(..term.len())
                    .is_some_and(|head| head.eq_ignore_ascii_case(term))
            })
            .map(|(hash, name)| (&**name, *hash))
            .collect();
        matched.sort_unstable();
        matched.into_iter().map(|(_, hash)| hash).collect()
    }

    /// `classes` as completions, each with the rows it would narrow to.
    fn class_completions(&self, classes: &[BinHash], unnamed: bool) -> ObjectSearchResult {
        let mut counts: HashMap<BinHash, u32> = classes.iter().map(|class| (*class, 0)).collect();
        for row in &self.declared.rows {
            if let Some(count) = counts.get_mut(&row.class) {
                *count += 1;
            }
        }

        ObjectSearchResult {
            hits: Vec::new(),
            total: classes.len() as u32,
            superseded: false,
            unnamed,
            classes: classes
                .iter()
                .take(SEARCH_LIMIT)
                .map(|class| ObjectClassHit {
                    class_hash: hex(*class),
                    class: self.class_name(*class),
                    rows: counts.get(class).copied().unwrap_or(0),
                })
                .collect(),
        }
    }

    /// The object's path, or its hex when no table names it.
    fn object_name(&self, object: BinHash) -> String {
        self.names
            .objects
            .get(&object)
            .map_or_else(|| hex(object), |named| named.name.to_string())
    }

    /// The class's name, or its hex when no table names it.
    fn class_name(&self, class: BinHash) -> String {
        self.names
            .classes
            .get(&class)
            .map_or_else(|| hex(class), ToString::to_string)
    }

    /// The wire shape of the row at `at`.
    fn hit(&self, at: usize, band: u8, score: f64, ranges: Vec<Range>) -> ObjectSearchHit {
        let row = &self.declared.rows[at];
        let (file, wad) = self.declared.file(row.file).map_or_else(
            || (hex_name(row.file), ""),
            |file| {
                (
                    self.file_name(file),
                    self.declared.wads[file.wad as usize].as_str(),
                )
            },
        );

        ObjectSearchHit {
            object_hash: hex(row.object),
            path: self.object_name(row.object),
            ranges,
            class: self.class_name(row.class),
            file_hash: hex_name(row.file),
            file,
            wad: wad.to_owned(),
            band,
            score,
        }
    }

    /// The name a declaring chunk reads as: the game index's, else a table's
    /// resolved since, else its hex.
    fn file_name(&self, file: &DeclaringFile) -> String {
        file.path
            .as_deref()
            .or_else(|| self.names.files.get(&file.path_hash).map(|path| &**path))
            .map_or_else(|| hex_name(file.path_hash), str::to_owned)
    }

    /// Every row as `(object, class, declaring file name)`, in row order.
    #[cfg(test)]
    fn rows(&self) -> impl Iterator<Item = (BinHash, BinHash, String)> {
        self.declared.rows.iter().map(|row| {
            let file = self
                .declared
                .file(row.file)
                .map_or_else(|| hex_name(row.file), |file| self.file_name(file));
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

/// The `class:` term of a query, and whether it was the last term typed.
///
/// Read by the objects source alone. Every other source sees the term as
/// text, which is why it is split off here rather than in the palette.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ClassTerm<'a> {
    /// What follows the colon: a name prefix, a hash, or nothing.
    value: &'a str,
    last: bool,
}

impl<'a> ClassTerm<'a> {
    /// The key a class term opens with, in any case.
    const KEY: &'static str = "class:";

    /// The class term of `query`, if one, and the rest of the query joined back.
    fn split(query: &'a str) -> (Option<Self>, Cow<'a, str>) {
        let terms: Vec<&str> = query.split_whitespace().collect();
        let at = terms.iter().position(|term| {
            term.get(..Self::KEY.len())
                .is_some_and(|head| head.eq_ignore_ascii_case(Self::KEY))
        });
        let Some(at) = at else {
            return (None, Cow::Borrowed(query));
        };

        let class = Self {
            value: &terms[at][Self::KEY.len()..],
            last: at + 1 == terms.len(),
        };
        let rest = terms
            .iter()
            .enumerate()
            .filter(|(index, _)| *index != at)
            .map(|(_, term)| *term)
            .collect::<Vec<&str>>()
            .join(" ");
        (Some(class), Cow::Owned(rest))
    }
}

/// The object hash a query of eight hex digits names, `0x` or not.
#[must_use]
pub fn parse_hash(query: &str) -> Option<BinHash> {
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

/// One archive's share of the build: its named `.bin` chunks, and the chunks
/// no table names, to sniff.
#[derive(Debug)]
struct ArchiveJob<'a> {
    ordinal: u32,
    name: &'a str,
    named: Vec<(WadHash, Box<str>)>,
    unnamed: Vec<WadHash>,
}

/// What one archive job read.
#[derive(Debug, Default)]
struct ArchiveRead {
    rows: Vec<Row>,
    files: Vec<DeclaringFile>,
    skipped: u32,
    sniffed: u32,
    unnamed_bins: u32,
    bytes: u64,
}

/// A mounted game archive, read through a file handle.
type MountedWad = Wad<BufReader<fs::File>>;

impl ArchiveJob<'_> {
    /// Mount the archive and read every chunk of the job for its declarations.
    ///
    /// The named chunks first, in the order given, then the unnamed ones that
    /// sniff as a bin.
    ///
    /// # Errors
    ///
    /// Fails when the archive cannot be opened or mounted. A chunk that will
    /// not read is skipped and counted rather than failing the job.
    fn read(&self, archives: &GameArchives) -> AppResult<ArchiveRead> {
        let path = archives.archive_path(self.name)?;
        let mut wad = Wad::mount(BufReader::new(fs::File::open(path)?))?;
        let mut read = ArchiveRead::default();

        for (path_hash, chunk_path) in &self.named {
            read.files.push(DeclaringFile {
                path_hash: *path_hash,
                path: Some(chunk_path.clone()),
                wad: self.ordinal,
            });
            self.read_chunk(&mut wad, *path_hash, chunk_path, &mut read);
        }

        let mut decoder = ChunkDecoder::new();
        for path_hash in &self.unnamed {
            read.sniffed += 1;
            if !self.sniffs_as_bin(&mut wad, *path_hash, &mut decoder) {
                continue;
            }
            read.unnamed_bins += 1;
            read.files.push(DeclaringFile {
                path_hash: *path_hash,
                path: None,
                wad: self.ordinal,
            });
            self.read_chunk(&mut wad, *path_hash, &hex_name(*path_hash), &mut read);
        }
        Ok(read)
    }

    /// Whether the first bytes of `path_hash` are a bin's magic.
    ///
    /// The head alone is decoded, so a chunk of any other kind costs a prefix
    /// read and nothing more. A chunk that will not decode that far is not a
    /// bin the build could read either.
    fn sniffs_as_bin(
        &self,
        wad: &mut MountedWad,
        path_hash: WadHash,
        decoder: &mut ChunkDecoder,
    ) -> bool {
        let Some(chunk) = wad.chunks().get(path_hash).copied() else {
            return false;
        };
        let head = match chunk_head(wad, &chunk, decoder, MAX_MAGIC_SIZE) {
            Ok(head) => head,
            Err(e) => {
                tracing::debug!("Not sniffing {}/{}: {e}", self.name, hex_name(path_hash));
                return false;
            }
        };
        matches!(
            LeagueFileKind::identify_from_bytes(&head),
            LeagueFileKind::PropertyBin | LeagueFileKind::PropertyBinOverride
        )
    }

    /// Read one chunk whole and push a row for every object it declares.
    ///
    /// A chunk that is missing or will not read is skipped and counted, with
    /// `label` naming it in the log.
    fn read_chunk(
        &self,
        wad: &mut MountedWad,
        path_hash: WadHash,
        label: &str,
        read: &mut ArchiveRead,
    ) {
        let bytes = match wad.chunks().get(path_hash).copied() {
            Some(chunk) => wad.load_chunk_decompressed(&chunk),
            None => {
                read.skipped += 1;
                tracing::debug!("Skipping {}/{label}: not in the archive", self.name);
                return;
            }
        };
        let bytes = match bytes {
            Ok(bytes) => bytes,
            Err(e) => {
                read.skipped += 1;
                tracing::debug!("Skipping {}/{label}: {e}", self.name);
                return;
            }
        };
        read.bytes += bytes.len() as u64;

        let before = read.rows.len();
        if let Err(e) = declarations(&bytes, path_hash, &mut read.rows) {
            read.rows.truncate(before);
            read.skipped += 1;
            tracing::debug!("Skipping {}/{label}: {e}", self.name);
        }
    }
}

/// Push a row for every object `bytes` declares.
fn declarations(bytes: &[u8], file: WadHash, out: &mut Vec<Row>) -> Result<(), ltk_meta::Error> {
    for_each_declaration(Cursor::new(bytes), |declared| {
        out.push(Row {
            object: declared.object,
            class: declared.class,
            file,
        });
    })
}

/// One object a bin declares, and the class it declares it as.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Declaration {
    pub object: BinHash,
    pub class: BinHash,
}

/// Visit every object the bin in `source` declares, in file order, by its magic.
///
/// A `PROP` is swept through the object table, one 8-byte hop an object. A
/// `PTCH` is read whole, which is the fallback the problems pass carries too
/// while the streaming form of a patch waits upstream, and its patch records
/// declare nothing.
///
/// # Errors
///
/// Fails when `source` cannot be read or is not a bin the toolkit reads.
/// Objects before the failure were visited.
pub fn for_each_declaration<R: Read + Seek>(
    mut source: R,
    mut visit: impl FnMut(Declaration),
) -> Result<(), ltk_meta::Error> {
    let mut magic = [0u8; 4];
    source.read_exact(&mut magic)?;
    source.seek(SeekFrom::Start(0))?;

    if magic == PATCH_MAGIC {
        let patch = BinOverride::from_reader(&mut source)?;
        for object in patch.objects.values() {
            visit(Declaration {
                object: object.path_hash,
                class: object.class_hash,
            });
        }
        return Ok(());
    }

    let mut stream: BinStream<_> = BinStream::mount(source)?;
    for entry in stream.entries() {
        let entry = entry?;
        visit(Declaration {
            object: entry.path_hash,
            class: entry.class_hash,
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
