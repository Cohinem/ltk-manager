//! Every archive of an install, folded into one directory tree.

use std::cmp::Ordering;
use std::collections::{BTreeMap, BinaryHeap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};
use std::sync::{Arc, Mutex};

use ltk_hashdb::LayeredHashDb;
use serde::Serialize;

use crate::error::{AppResult, MutexResultExt};
use crate::game_wads::GameArchives;
use crate::matcher::{FindQuery, Query, Range, letter_mask, mask_covers};

/// The directory id of the group holding chunks no hash table names.
///
/// A resolved WAD path never holds `?`, so the group cannot collide with a
/// directory the game ships.
pub const UNKNOWN_DIR: &str = "?";

/// What one directory of the folded index holds.
#[derive(Debug, Clone, Default, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct GameDirListing {
    /// Subdirectories, sorted by name.
    pub dirs: Vec<GameDirEntry>,
    /// Files directly under this directory, sorted by name.
    pub files: Vec<GameFileEntry>,
}

/// One subdirectory, folded through any chain of single-child directories.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct GameDirEntry {
    /// What [`GameIndex::read_dir`] takes to open this row, forward slashes.
    pub path: String,
    /// What the row reads: the folded chain of segments joined by `/`.
    pub name: String,
    /// Files at or below the directory.
    pub file_count: u32,
}

/// One file of the folded index, in the shape a single archive reads back.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct GameFileEntry {
    /// Chunk path hash as 16 lowercase hex digits.
    pub path_hash: String,
    /// Resolved chunk path, or `None` when no hash table names it.
    pub path: Option<String>,
    /// Uncompressed chunk size.
    pub size_bytes: u64,
    /// The `DATA/FINAL`-relative archive the chunk was read from.
    ///
    /// The fold drops every copy of a chunk after the first, so this names the
    /// archive that copy came from and not every archive that carries it.
    pub wad: String,
}

/// What a built index holds.
#[derive(Debug, Clone, Copy, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct GameIndexStats {
    /// Archives merged, including any that failed to read.
    pub archives: u32,
    /// Files after deduplication.
    pub files: u32,
    /// Directories, not counting the root.
    pub dirs: u32,
}

/// One row a search matched, with the runs its two lines mark.
///
/// Marked runs are byte offsets into `name` and `path`, which the palette
/// slices to lift the matched characters out of the rest.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct GameSearchHit {
    /// Chunk path hash as 16 lowercase hex digits.
    pub path_hash: String,
    /// The path's basename, or the hash when no hash table names the chunk.
    pub name: String,
    /// The directory holding it, empty at the root and for an unnamed chunk.
    pub path: String,
    /// The `DATA/FINAL`-relative archive the chunk was read from.
    pub wad: String,
    /// 0 is a name the query opens, 1 a name holding it, 2 a match reaching the directory.
    pub band: u8,
    pub score: f64,
    pub name_ranges: Vec<Range>,
    pub path_ranges: Vec<Range>,
}

/// What one search of the folded index found.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct GameSearchResult {
    /// The best rows, best first, capped at [`SEARCH_LIMIT`].
    pub hits: Vec<GameSearchHit>,
    /// How many files matched in all, which the cap trimmed.
    pub total: u32,
    /// A newer search started before this one finished, so it gave up early.
    ///
    /// Its rows are whatever it had found, which is not the whole answer. The
    /// caller is expected to be showing the newer query by now.
    pub superseded: bool,
    /// No hash table named a single chunk, so only a hash can match.
    ///
    /// An install whose names never resolved answers every path query with
    /// nothing, which reads exactly like an install that holds no match. The
    /// caller says which of the two it is.
    pub unnamed: bool,
}

/// How many rows a search returns. Nothing sorts a million of them.
pub const SEARCH_LIMIT: usize = 100;

/// One file the full search matched, shaped as an entry a file tree can hold.
///
/// The pattern is matched over the full path, and the marked runs arrive
/// split at the basename: `name_ranges` are byte offsets into `name`, and
/// `path_ranges` are byte offsets into the directory prefix of `path`.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct GameFindHit {
    /// Chunk path hash as 16 lowercase hex digits.
    pub path_hash: String,
    /// Resolved path with forward slashes, or `None` when no hash table names the chunk.
    pub path: Option<String>,
    /// The path's basename, or the hash when no hash table names the chunk.
    pub name: String,
    /// The `DATA/FINAL`-relative archive the chunk was read from.
    pub wad: String,
    /// Uncompressed chunk size.
    pub size_bytes: u64,
    pub name_ranges: Vec<Range>,
    pub path_ranges: Vec<Range>,
}

/// What one full search of the folded index found.
#[derive(Debug, Clone, Serialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(export))]
#[serde(rename_all = "camelCase")]
pub struct GameFindResult {
    /// Every matching row in tree order, capped at [`FIND_LIMIT`].
    pub hits: Vec<GameFindHit>,
    /// How many files matched in all, counted on past the cap.
    pub total: u32,
    /// A newer search started before this one finished, so it gave up early.
    ///
    /// Its rows are whatever it had found, which is not the whole answer. The
    /// caller is expected to be showing the newer pattern by now.
    pub superseded: bool,
    /// No hash table named a single chunk, so only a hash can match.
    pub unnamed: bool,
}

/// How many rows a full search returns.
///
/// The figure VS Code's own search stops at. A broader answer is not one a
/// reader scrolls, and past it the fix is a narrower pattern.
pub const FIND_LIMIT: usize = 20_000;

/// How many files a scan reads between two tests of the generation.
const STALE_CHECK_INTERVAL: u32 = 4096;

/// The newest search asked for, so a scan can see it has been overtaken.
///
/// Without this, a ten-character query runs ten full scans of the install and
/// only the last of them is one anybody wants.
#[derive(Debug, Default)]
pub struct SearchGeneration(AtomicU64);

impl SearchGeneration {
    /// Take the newest ticket, which every scan already running is now behind.
    pub fn claim(&self) -> u64 {
        self.0.fetch_add(1, AtomicOrdering::Relaxed) + 1
    }

    /// Whether a later search has claimed a ticket since this one.
    #[must_use]
    pub fn overtook(&self, ticket: u64) -> bool {
        self.0.load(AtomicOrdering::Relaxed) > ticket
    }
}

/// The newest full search asked for, on its own line apart from the palette's.
///
/// Separate from [`SearchGeneration`] so a keystroke in one box never gives up
/// a scan the other box is waiting on.
#[derive(Debug, Default)]
pub struct FindGeneration(SearchGeneration);

impl FindGeneration {
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

/// Every archive of an install merged into one deduplicated directory tree.
///
/// A chunk several archives carry is one file here. The game ships the same
/// copy of a shared chunk in every archive that needs it, so the first read
/// wins and the rest are dropped.
///
/// Built once and read many times. A build walks every archive of the install
/// and costs seconds, while [`read_dir`](Self::read_dir) is a lookup.
#[derive(Debug)]
pub struct GameIndex {
    /// Directory arena. Index 0 is the root.
    dirs: Vec<Dir>,
    /// Chunks no hash table names, which have no directory to sit in.
    unknown: Vec<File>,
    /// Archive names, in merge order. A file's `wad` indexes this.
    wads: Vec<String>,
}

#[derive(Debug, Default)]
struct Dir {
    /// Sorted by name, which is the order a listing wants.
    children: BTreeMap<String, usize>,
    files: Vec<File>,
    /// Files at or below this directory, filled once the whole tree is in.
    file_count: u32,
    /// Every letter below this directory: its files' names and its descendants'.
    ///
    /// A query whose letters this does not cover cannot match anything under
    /// here, so one `AND` skips the whole subtree. The letters of the path
    /// *down to* this directory are not in it - the walk carries those, which
    /// is what keeps this to one word per directory.
    subtree_mask: u32,
}

#[derive(Debug)]
struct File {
    name: String,
    path_hash: u64,
    size_bytes: u64,
    /// Index into [`GameIndex::wads`].
    wad: u32,
    /// The letters of `name`, which fills the padding this struct already had.
    mask: u32,
}

impl GameIndex {
    /// Merge every archive under `DATA/FINAL` into one tree.
    ///
    /// An archive that cannot be read is logged and skipped, because one
    /// corrupt file in an install is not a reason to show no tree at all.
    ///
    /// # Errors
    ///
    /// Fails when the archives cannot be enumerated, which is the condition
    /// [`GameArchives::list`] reports.
    pub fn build(archives: &GameArchives, resolver: &LayeredHashDb) -> AppResult<Self> {
        let wads = archives.list()?;

        let mut index = Self {
            dirs: vec![Dir::default()],
            unknown: Vec::new(),
            wads: wads.iter().map(|wad| wad.name.clone()).collect(),
        };

        /* By hash rather than by path: an unnamed chunk has no path to compare,
        and the hash is what makes two archives' copies the same file. */
        let mut seen: HashSet<u64> = HashSet::new();

        for (ordinal, wad) in wads.iter().enumerate() {
            let ordinal = ordinal as u32;
            let read = archives.for_each_chunk(&wad.name, resolver, |path_hash, path, size| {
                if seen.insert(path_hash) {
                    index.insert(path_hash, path, size, ordinal);
                }
            });
            if let Err(e) = read {
                tracing::warn!("Skipping unreadable game archive {}: {e}", wad.name);
            }
        }

        index.finalize(0);
        index.unknown.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(index)
    }

    /// List one directory, or `None` when nothing in the index has that path.
    ///
    /// The root is `""` and the group of unnamed chunks is [`UNKNOWN_DIR`].
    pub fn read_dir(&self, path: &str) -> Option<GameDirListing> {
        if path == UNKNOWN_DIR {
            return Some(GameDirListing {
                dirs: Vec::new(),
                files: self
                    .unknown
                    .iter()
                    .map(|file| file.unnamed_entry(self.wad_name(file)))
                    .collect(),
            });
        }

        let index = self.resolve(path)?;
        let dir = &self.dirs[index];

        let mut dirs: Vec<GameDirEntry> = dir
            .children
            .iter()
            .map(|(name, &child)| self.fold(path, name, child))
            .collect();

        /* Last, and only at the root, so the junk drawer never pushes named
        paths down the tree. */
        if path.is_empty() && !self.unknown.is_empty() {
            dirs.push(GameDirEntry {
                path: UNKNOWN_DIR.to_owned(),
                name: "unknown".to_owned(),
                file_count: self.unknown.len() as u32,
            });
        }

        Some(GameDirListing {
            dirs,
            files: dir
                .files
                .iter()
                .map(|file| file.entry(path, self.wad_name(file)))
                .collect(),
        })
    }

    /// The best rows of the whole install for one query, best first.
    ///
    /// `is_overtaken` is tested every few thousand files. A scan that has been
    /// overtaken returns what it has rather than finishing a walk nobody is
    /// waiting for, and says so through [`GameSearchResult::superseded`].
    ///
    /// An empty query matches nothing here. The install is not a list anybody
    /// wants handed to them unasked, and the palette only reaches this source
    /// once something is typed.
    pub fn search(&self, query: &str, is_overtaken: impl Fn() -> bool) -> GameSearchResult {
        let unnamed = self.dirs[0].file_count == 0 && !self.unknown.is_empty();

        let Some(query) = Query::parse(query) else {
            return GameSearchResult {
                hits: Vec::new(),
                total: 0,
                superseded: false,
                unnamed,
            };
        };

        let mut scan = Scan {
            index: self,
            mask: query.mask(),
            query,
            heap: BinaryHeap::with_capacity(SEARCH_LIMIT + 1),
            total: 0,
            path: String::with_capacity(128),
            full: String::with_capacity(160),
            since_check: 0,
            overtaken: false,
        };

        scan.walk(0, 0, &is_overtaken);
        scan.unknown(&is_overtaken);

        GameSearchResult {
            total: scan.total,
            superseded: scan.overtaken,
            unnamed,
            hits: scan
                .heap
                .into_sorted_vec()
                .into_iter()
                .map(|hit| hit.row)
                .collect(),
        }
    }

    /// Every file of the install the pattern matches, in tree order.
    ///
    /// Where [`search`](Self::search) ranks a bounded best-of for the palette,
    /// this returns the whole answer: each match in depth-first tree order,
    /// capped at [`FIND_LIMIT`] rows while the total counts on past it. The
    /// chunks no hash table names come last, matched by their hash.
    ///
    /// `is_overtaken` is tested every few thousand files, the contract
    /// [`search`](Self::search) sets.
    pub fn find(&self, query: &FindQuery, is_overtaken: impl Fn() -> bool) -> GameFindResult {
        self.find_capped(query, FIND_LIMIT, is_overtaken)
    }

    /// [`find`](Self::find) with the cap a test can afford to fill.
    fn find_capped(
        &self,
        query: &FindQuery,
        limit: usize,
        is_overtaken: impl Fn() -> bool,
    ) -> GameFindResult {
        let mut scan = FindScan {
            index: self,
            query,
            hits: Vec::new(),
            limit,
            total: 0,
            path: String::with_capacity(160),
            since_check: 0,
            overtaken: false,
        };

        scan.walk(0, &is_overtaken);
        scan.unknown(&is_overtaken);

        GameFindResult {
            hits: scan.hits,
            total: scan.total,
            superseded: scan.overtaken,
            unnamed: self.dirs[0].file_count == 0 && !self.unknown.is_empty(),
        }
    }

    /// What the index holds, for a caller that reports its size.
    pub fn stats(&self) -> GameIndexStats {
        GameIndexStats {
            archives: self.wads.len() as u32,
            files: self.dirs[0].file_count + self.unknown.len() as u32,
            dirs: (self.dirs.len() - 1) as u32,
        }
    }

    /// Add one chunk under its resolved path, or to the unnamed group.
    ///
    /// `wad` is the ordinal of the archive the chunk was read from, which
    /// indexes [`Self::wads`].
    fn insert(&mut self, path_hash: u64, path: Option<&str>, size_bytes: u64, wad: u32) {
        let Some(path) = path else {
            let name = format!("{path_hash:016x}");
            self.unknown.push(File {
                mask: letter_mask(&name),
                name,
                path_hash,
                size_bytes,
                wad,
            });
            return;
        };

        let mut segments = path.split('/').filter(|s| !s.is_empty()).peekable();
        let mut cursor = 0usize;
        let mut name = None;

        while let Some(segment) = segments.next() {
            if segments.peek().is_none() {
                name = Some(segment);
                break;
            }
            cursor = match self.dirs[cursor].children.get(segment) {
                Some(&child) => child,
                None => {
                    let child = self.dirs.len();
                    self.dirs.push(Dir::default());
                    self.dirs[cursor].children.insert(segment.to_owned(), child);
                    child
                }
            };
        }

        // A path of nothing but separators names no file.
        let Some(name) = name else { return };
        self.dirs[cursor].files.push(File {
            name: name.to_owned(),
            path_hash,
            size_bytes,
            wad,
            mask: letter_mask(name),
        });
    }

    /// The archive a file was read from.
    ///
    /// # Panics
    ///
    /// Panics when the file's ordinal is not one this index handed out, which
    /// is a bug in the build rather than a condition a caller can hit.
    fn wad_name(&self, file: &File) -> &str {
        &self.wads[file.wad as usize]
    }

    /// Sort each directory's files and fill in what the whole subtree holds.
    ///
    /// Returns the recursive file count and the union of every letter below
    /// this directory, which is what lets a search skip a subtree whole.
    fn finalize(&mut self, index: usize) -> (u32, u32) {
        let children: Vec<(String, usize)> = self.dirs[index]
            .children
            .iter()
            .map(|(name, &child)| (name.clone(), child))
            .collect();

        let mut total = self.dirs[index].files.len() as u32;
        let mut mask = self.dirs[index]
            .files
            .iter()
            .fold(0, |mask, file| mask | file.mask);

        for (name, child) in children {
            let (count, subtree) = self.finalize(child);
            total += count;
            mask |= letter_mask(&name) | subtree;
        }

        let dir = &mut self.dirs[index];
        dir.files.sort_by(|a, b| a.name.cmp(&b.name));
        dir.file_count = total;
        dir.subtree_mask = mask;
        (total, mask)
    }

    /// The arena index of `path`, where `""` is the root.
    fn resolve(&self, path: &str) -> Option<usize> {
        let mut cursor = 0usize;
        for segment in path.split('/').filter(|s| !s.is_empty()) {
            cursor = *self.dirs[cursor].children.get(segment)?;
        }
        Some(cursor)
    }

    /// One child row, walked down its chain of single-child directories.
    ///
    /// A run of directories that each hold nothing but the next one is one row,
    /// so a modder scanning a tree of asset paths spends no rows on chains that
    /// carry no choice.
    fn fold(&self, parent: &str, name: &str, child: usize) -> GameDirEntry {
        let mut path = if parent.is_empty() {
            name.to_owned()
        } else {
            format!("{parent}/{name}")
        };
        let mut display = name.to_owned();
        let mut cursor = child;

        loop {
            let dir = &self.dirs[cursor];
            if !dir.files.is_empty() || dir.children.len() != 1 {
                break;
            }
            let Some((next_name, &next)) = dir.children.iter().next() else {
                break;
            };
            path.push('/');
            path.push_str(next_name);
            display.push('/');
            display.push_str(next_name);
            cursor = next;
        }

        GameDirEntry {
            path,
            name: display,
            file_count: self.dirs[cursor].file_count,
        }
    }
}

/// One walk of the index for one query.
///
/// Depth first, pushing and popping a segment on a single `String`, so a path
/// that survives the mask is built without allocating one per file.
struct Scan<'a> {
    index: &'a GameIndex,
    /// Split and lowercased once for every candidate that follows.
    query: Query,
    mask: u32,
    /// The best rows so far, worst at the root so the cap knows what to drop.
    heap: BinaryHeap<Hit>,
    total: u32,
    /// The directory the walk stands in, without a trailing separator.
    path: String,
    /// `path/name`, rebuilt in place for a candidate whose name did not match.
    full: String,
    since_check: u32,
    overtaken: bool,
}

impl Scan<'_> {
    /// Walk one directory, its files first and then its children.
    ///
    /// `path_mask` is every letter of the path down to here. Held on the stack
    /// rather than in each directory, which is what keeps the index's own cost
    /// to one word per directory.
    fn walk(&mut self, dir: usize, path_mask: u32, is_overtaken: &impl Fn() -> bool) {
        if self.overtaken {
            return;
        }

        /* The index outlives the scan, so a directory borrowed from it does not
        borrow the scan and the walk can still take itself mutably. */
        let index = self.index;
        let node = &index.dirs[dir];
        if !mask_covers(path_mask | node.subtree_mask, self.mask) {
            return;
        }

        for file in &node.files {
            if self.tick(is_overtaken) {
                return;
            }
            if !mask_covers(path_mask | file.mask, self.mask) {
                continue;
            }
            self.consider(file);
        }

        for (name, &child) in &node.children {
            let restore = self.path.len();
            if !self.path.is_empty() {
                self.path.push('/');
            }
            self.path.push_str(name);

            self.walk(child, path_mask | letter_mask(name), is_overtaken);

            self.path.truncate(restore);
            if self.overtaken {
                return;
            }
        }
    }

    /// The chunks no hash table names, which sit under no directory.
    ///
    /// Searchable by their hash, because reading one out of a log and asking
    /// the manager where it lives is the reason anybody types sixteen hex
    /// digits.
    fn unknown(&mut self, is_overtaken: &impl Fn() -> bool) {
        let index = self.index;
        self.path.clear();

        for file in &index.unknown {
            if self.tick(is_overtaken) {
                return;
            }
            if mask_covers(file.mask, self.mask) {
                self.consider(file);
            }
        }
    }

    /// Test the generation every so often, and report whether to stop.
    fn tick(&mut self, is_overtaken: &impl Fn() -> bool) -> bool {
        self.since_check += 1;
        if self.since_check >= STALE_CHECK_INTERVAL {
            self.since_check = 0;
            self.overtaken = is_overtaken();
        }
        self.overtaken
    }

    /// Score one file, and keep it when it beats the worst row held.
    ///
    /// The bands are the ranking rule the palette's own matcher obeys: a name
    /// the query opens, then a name that holds it, then a match reaching into
    /// the directory. A name match marks no part of the path, because it never
    /// read one.
    fn consider(&mut self, file: &File) {
        let hit = match self.query.matches(&file.name) {
            Some(matched) => {
                let band = u8::from(!self.query.starts(&file.name));
                self.hit(file, band, matched.score, matched.ranges, Vec::new())
            }
            /* A name holding only some of the terms still gets its path read,
            because the rest of them may be in a directory above it. */
            None if self.path.is_empty() => return,
            None => {
                self.full.clear();
                self.full.push_str(&self.path);
                self.full.push('/');
                self.full.push_str(&file.name);

                let Some(matched) = self.query.matches(&self.full) else {
                    return;
                };
                let boundary = self.path.len() as u32;
                let (path_ranges, name_ranges) = split_ranges(&matched.ranges, boundary);
                self.hit(file, 2, matched.score, name_ranges, path_ranges)
            }
        };

        self.total += 1;
        self.push(hit);
    }

    fn hit(
        &self,
        file: &File,
        band: u8,
        score: f64,
        name_ranges: Vec<Range>,
        path_ranges: Vec<Range>,
    ) -> Hit {
        Hit {
            band,
            score,
            length: (self.path.len() + file.name.len()) as u32,
            row: GameSearchHit {
                path_hash: format!("{:016x}", file.path_hash),
                name: file.name.clone(),
                path: self.path.clone(),
                wad: self.index.wad_name(file).to_owned(),
                band,
                score,
                name_ranges,
                path_ranges,
            },
        }
    }

    /// Keep the row while the cap has room, and past that only when it beats
    /// the worst one held.
    fn push(&mut self, hit: Hit) {
        if self.heap.len() < SEARCH_LIMIT {
            self.heap.push(hit);
            return;
        }
        // `Hit` orders worst first, so the root is the row to drop.
        if self.heap.peek().is_some_and(|worst| hit < *worst) {
            self.heap.pop();
            self.heap.push(hit);
        }
    }
}

/// One walk of the index for one full-search pattern.
///
/// Depth first like [`Scan`], but yes-or-no over the full path rather than
/// ranked, so the rows land in tree order and nothing sorts them. The walk
/// pushes and pops each segment on a single `String`, and a candidate's name
/// rides the same buffer, so a path is never allocated to be rejected.
struct FindScan<'a> {
    index: &'a GameIndex,
    query: &'a FindQuery,
    /// Matching rows in the order the walk met them, full at `limit`.
    hits: Vec<GameFindHit>,
    limit: usize,
    total: u32,
    /// The path the walk stands in, without a trailing separator.
    path: String,
    since_check: u32,
    overtaken: bool,
}

impl FindScan<'_> {
    /// Walk one directory, its files first and then its children.
    fn walk(&mut self, dir: usize, is_overtaken: &impl Fn() -> bool) {
        if self.overtaken {
            return;
        }

        let index = self.index;
        let node = &index.dirs[dir];

        for file in &node.files {
            if self.tick(is_overtaken) {
                return;
            }
            self.consider(file, true);
        }

        for (name, &child) in &node.children {
            let restore = self.path.len();
            if !self.path.is_empty() {
                self.path.push('/');
            }
            self.path.push_str(name);

            self.walk(child, is_overtaken);

            self.path.truncate(restore);
            if self.overtaken {
                return;
            }
        }
    }

    /// The chunks no hash table names, matched by their hash.
    fn unknown(&mut self, is_overtaken: &impl Fn() -> bool) {
        let index = self.index;
        self.path.clear();

        for file in &index.unknown {
            if self.tick(is_overtaken) {
                return;
            }
            self.consider(file, false);
        }
    }

    /// Match one file over its full path, and keep it while the cap has room.
    ///
    /// `named` says a hash table resolved the file, so an unnamed chunk's hash
    /// never masquerades as a path.
    fn consider(&mut self, file: &File, named: bool) {
        let restore = self.path.len();
        if !self.path.is_empty() {
            self.path.push('/');
        }
        self.path.push_str(&file.name);

        if let Some(ranges) = self.query.matches(&self.path) {
            self.total += 1;
            if self.hits.len() < self.limit {
                /* At the root the whole match is the name, and `split_ranges`
                cannot say so - it assumes a separator sits at the boundary. */
                let (path_ranges, name_ranges) = if restore == 0 {
                    (Vec::new(), ranges)
                } else {
                    split_ranges(&ranges, restore as u32)
                };
                self.hits.push(GameFindHit {
                    path_hash: format!("{:016x}", file.path_hash),
                    path: named.then(|| self.path.clone()),
                    name: file.name.clone(),
                    wad: self.index.wad_name(file).to_owned(),
                    size_bytes: file.size_bytes,
                    name_ranges,
                    path_ranges,
                });
            }
        }

        self.path.truncate(restore);
    }

    /// Test the generation every so often, and report whether to stop.
    fn tick(&mut self, is_overtaken: &impl Fn() -> bool) -> bool {
        self.since_check += 1;
        if self.since_check >= STALE_CHECK_INTERVAL {
            self.since_check = 0;
            self.overtaken = is_overtaken();
        }
        self.overtaken
    }
}

/// One kept row, ordered worst first so a bounded heap drops the right one.
#[derive(Debug)]
struct Hit {
    band: u8,
    score: f64,
    /// The length of `path/name`, so the shorter path wins a tie.
    length: u32,
    row: GameSearchHit,
}

impl Ord for Hit {
    /// Greater is worse: a higher band, then a lower score, then a longer path.
    fn cmp(&self, other: &Self) -> Ordering {
        self.band
            .cmp(&other.band)
            .then_with(|| other.score.total_cmp(&self.score))
            .then_with(|| self.length.cmp(&other.length))
            .then_with(|| self.row.path.cmp(&other.row.path))
            .then_with(|| self.row.name.cmp(&other.row.name))
    }
}

impl PartialOrd for Hit {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for Hit {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for Hit {}

/// Cut one match over `path/name` into the runs each of the two lines marks.
fn split_ranges(ranges: &[Range], boundary: u32) -> (Vec<Range>, Vec<Range>) {
    let mut path = Vec::new();
    let mut name = Vec::new();

    for &(start, end) in ranges {
        if end <= boundary {
            path.push((start, end));
        } else if start > boundary {
            name.push((start - boundary - 1, end - boundary - 1));
        } else {
            if start < boundary {
                path.push((start, boundary));
            }
            if end > boundary + 1 {
                name.push((0, end - boundary - 1));
            }
        }
    }
    (path, name)
}

/// Lazily-built, app-managed [`GameIndex`].
#[derive(Debug, Default)]
pub struct GameIndexState(Mutex<Option<Arc<GameIndex>>>);

impl GameIndexState {
    /// Return the index, building it on first use.
    ///
    /// `resolver` is called only when a build happens, because opening the
    /// hash tables costs more than every directory read that follows it. The
    /// lock is held across the build, so concurrent callers wait rather than
    /// each walking the whole install.
    ///
    /// # Errors
    ///
    /// Fails when the build fails, or when a previous holder of the lock
    /// panicked.
    pub fn get_or_build(
        &self,
        archives: &GameArchives,
        resolver: impl FnOnce() -> LayeredHashDb,
    ) -> AppResult<Arc<GameIndex>> {
        let mut slot = self.0.lock().mutex_err()?;
        if let Some(index) = slot.as_ref() {
            return Ok(Arc::clone(index));
        }

        let index = Arc::new(GameIndex::build(archives, &resolver())?);
        *slot = Some(Arc::clone(&index));
        Ok(index)
    }

    /// Drop the built index, so the next read walks the install again.
    ///
    /// # Errors
    ///
    /// Fails when a previous holder of the lock panicked.
    pub fn clear(&self) -> AppResult<()> {
        *self.0.lock().mutex_err()? = None;
        Ok(())
    }
}

impl File {
    /// The wire shape, with the path this file's directory gives it.
    fn entry(&self, dir: &str, wad: &str) -> GameFileEntry {
        let path = if dir.is_empty() {
            self.name.clone()
        } else {
            format!("{dir}/{}", self.name)
        };
        GameFileEntry {
            path_hash: format!("{:016x}", self.path_hash),
            path: Some(path),
            size_bytes: self.size_bytes,
            wad: wad.to_owned(),
        }
    }

    /// The wire shape of a chunk no hash table names, which has no path.
    fn unnamed_entry(&self, wad: &str) -> GameFileEntry {
        GameFileEntry {
            path_hash: format!("{:016x}", self.path_hash),
            path: None,
            size_bytes: self.size_bytes,
            wad: wad.to_owned(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::matcher::PatternSyntax;
    use ltk_wad::{WadBuilder, WadChunkBuilder};
    use std::fs;
    use std::io::Write as _;
    use std::path::Path;
    use tempfile::TempDir;
    use xxhash_rust::xxh64::xxh64;

    /// A game directory holding `wads`, each named by its chunk paths.
    fn game_with(wads: &[(&str, &[&str])]) -> TempDir {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("DATA").join("FINAL");
        fs::create_dir_all(&dir).unwrap();

        for (name, chunk_paths) in wads {
            let path = dir.join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            let mut builder = WadBuilder::default();
            for chunk_path in *chunk_paths {
                builder = builder.with_chunk(WadChunkBuilder::default().with_path(*chunk_path));
            }
            let mut file = fs::File::create(&path).unwrap();
            builder
                .build_to_writer(&mut file, |_path_hash, cursor| {
                    cursor.write_all(&[0xAA; 64])?;
                    Ok(())
                })
                .unwrap();
        }
        tmp
    }

    fn resolver_for(paths: &[&str]) -> LayeredHashDb {
        let mut resolver = LayeredHashDb::new();
        for path in paths {
            resolver.insert(xxh64(path.as_bytes(), 0), *path);
        }
        resolver
    }

    fn build(game: &Path, paths: &[&str]) -> GameIndex {
        GameIndex::build(&GameArchives::at(game), &resolver_for(paths)).unwrap()
    }

    /// The full path of each hit, in the order the search ranked them.
    fn ranked(index: &GameIndex, query: &str) -> Vec<String> {
        index
            .search(query, || false)
            .hits
            .into_iter()
            .map(|hit| {
                if hit.path.is_empty() {
                    hit.name
                } else {
                    format!("{}/{}", hit.path, hit.name)
                }
            })
            .collect()
    }

    /// An index over exactly `paths`, all in one archive.
    fn index_over(paths: &[&str]) -> (TempDir, GameIndex) {
        let tmp = game_with(&[("Search.wad.client", paths)]);
        let index = build(tmp.path(), paths);
        (tmp, index)
    }

    #[test]
    fn search_finds_a_file_by_its_name() {
        let (_tmp, index) = index_over(&["assets/characters/aatrox/aatrox.bin"]);
        assert_eq!(
            ranked(&index, "aatrox.bin"),
            ["assets/characters/aatrox/aatrox.bin"]
        );
    }

    #[test]
    fn search_finds_a_file_by_a_run_of_its_directory() {
        let (_tmp, index) = index_over(&["assets/characters/aatrox/skin01.bin"]);
        assert_eq!(
            ranked(&index, "characters/aatrox"),
            ["assets/characters/aatrox/skin01.bin"]
        );
    }

    #[test]
    fn search_takes_every_term_of_a_query() {
        let (_tmp, index) = index_over(&[
            "assets/characters/nasus/skins/base/nasus_base_tx_cm.dds",
            "assets/characters/nasus/nasus.bin",
        ]);

        assert_eq!(
            ranked(&index, "nasus tx"),
            ["assets/characters/nasus/skins/base/nasus_base_tx_cm.dds"]
        );
        assert!(ranked(&index, "nasus zed").is_empty());
    }

    /// A chunk path is lowercase by the time a hash table names it, so the
    /// query is the only side of the compare that can arrive in another case.
    #[test]
    fn search_lowercases_the_query() {
        let (_tmp, index) = index_over(&["assets/characters/aatrox/aatrox.bin"]);
        assert_eq!(
            ranked(&index, "  AATROX.BIN  "),
            ["assets/characters/aatrox/aatrox.bin"]
        );
    }

    #[test]
    fn search_returns_nothing_for_an_empty_query() {
        let (_tmp, index) = index_over(&["assets/characters/aatrox/aatrox.bin"]);
        let result = index.search("   ", || false);
        assert!(result.hits.is_empty());
        assert_eq!(result.total, 0);
        assert!(!result.superseded);
    }

    #[test]
    fn search_drops_what_does_not_match() {
        let (_tmp, index) = index_over(&[
            "assets/characters/aatrox/aatrox.bin",
            "assets/characters/zed/zed.bin",
        ]);
        assert_eq!(
            ranked(&index, "aatrox"),
            ["assets/characters/aatrox/aatrox.bin"]
        );
    }

    #[test]
    fn search_marks_the_name_alone_when_the_name_matched() {
        let (_tmp, index) = index_over(&["assets/characters/aatrox.bin"]);
        let hit = index.search("aatrox", || false).hits.remove(0);

        assert_eq!(hit.name_ranges, [(0, 6)]);
        assert!(hit.path_ranges.is_empty());
    }

    #[test]
    fn search_marks_both_lines_for_a_run_that_crosses_the_separator() {
        let (_tmp, index) = index_over(&["assets/skins/base.bin"]);
        let hit = index.search("skins/base", || false).hits.remove(0);

        assert!(!hit.path_ranges.is_empty());
        assert!(!hit.name_ranges.is_empty());
        for &(start, end) in &hit.path_ranges {
            assert!(end as usize <= hit.path.len());
            assert!(start < end);
        }
        for &(start, end) in &hit.name_ranges {
            assert!(end as usize <= hit.name.len());
            assert!(start < end);
        }
    }

    #[test]
    fn search_counts_every_match_and_returns_at_most_the_cap() {
        let paths: Vec<String> = (0..SEARCH_LIMIT + 20)
            .map(|i| format!("assets/skins/aatrox_{i:03}.bin"))
            .collect();
        let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
        let (_tmp, index) = index_over(&refs);

        let result = index.search("aatrox", || false);
        assert_eq!(result.total as usize, paths.len());
        assert_eq!(result.hits.len(), SEARCH_LIMIT);
    }

    #[test]
    fn search_names_the_archive_each_hit_came_from() {
        let (_tmp, index) = index_over(&["assets/characters/aatrox.bin"]);
        let hit = index.search("aatrox", || false).hits.remove(0);
        assert_eq!(hit.wad, "Search.wad.client");
    }

    #[test]
    fn search_reports_an_index_no_hash_table_named() {
        let tmp = game_with(&[("Search.wad.client", &["assets/characters/aatrox.bin"])]);

        let named = build(tmp.path(), &["assets/characters/aatrox.bin"]);
        assert!(!named.search("aatrox", || false).unnamed);

        let unnamed = build(tmp.path(), &[]);
        assert!(unnamed.search("aatrox", || false).unnamed);
    }

    #[test]
    fn search_reaches_a_chunk_no_hash_table_names_by_its_hash() {
        let tmp = game_with(&[("Search.wad.client", &["assets/characters/aatrox.bin"])]);
        // No resolver entry, so the chunk lands in the unnamed group.
        let index = build(tmp.path(), &[]);

        let hash = format!("{:016x}", xxh64(b"assets/characters/aatrox.bin", 0));
        let hits = index.search(&hash, || false).hits;

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, hash);
        assert!(hits[0].path.is_empty());
    }

    #[test]
    fn search_gives_up_once_it_has_been_overtaken() {
        // One interval, so the scan reaches its first test of the generation.
        let paths: Vec<String> = (0..=STALE_CHECK_INTERVAL)
            .map(|i| format!("assets/skins/aatrox_{i:05}.bin"))
            .collect();
        let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
        let (_tmp, index) = index_over(&refs);

        let overtaken = index.search("aatrox", || true);
        assert!(overtaken.superseded);
        assert!((overtaken.total as usize) < paths.len());

        let whole = index.search("aatrox", || false);
        assert!(!whole.superseded);
        assert_eq!(whole.total as usize, paths.len());
    }

    #[test]
    fn generation_reports_a_ticket_that_a_later_claim_overtook() {
        let generation = SearchGeneration::default();
        let first = generation.claim();
        assert!(!generation.overtook(first));

        let second = generation.claim();
        assert!(generation.overtook(first));
        assert!(!generation.overtook(second));
    }

    /// The order both palette scorers must agree on.
    ///
    /// The frontend suite checks the same file through `rank.ts`. A change to
    /// either scorer that moves a row shows up here and there at once.
    /// The install answers `nasus` with the champion, not with most of itself.
    ///
    /// `n`, `a`, `s`, `u`, `s` appear in that order inside nearly every long
    /// asset path, so while a query was a subsequence this matched 137,032
    /// files of a live install and buried the four that a modder wanted.
    #[test]
    fn search_answers_a_query_only_where_it_reads_as_a_run() {
        let paths = [
            "assets/characters/nasus/skins/base/nasus.skn",
            "data/characters/nasus/nasus.bin",
            // Holds n-a-s-u-s in order, and nothing a modder typing it wants.
            "assets/characters/smolder/skins/base/charizard_particles/aura_self.dds",
            "assets/characters/smolder/sounds/wwise2016/sfx/charizard_sfx_audio.bnk",
            "assets/characters/aurelionsol/skins/base/aurelionsol_base_e_meshmultmask.dds",
        ];
        let (_tmp, index) = index_over(&paths);

        assert_eq!(
            ranked(&index, "nasus"),
            [
                "data/characters/nasus/nasus.bin",
                "assets/characters/nasus/skins/base/nasus.skn",
            ]
        );
    }

    /// A shape closer to a real install than a one-file index: deep paths,
    /// several archives, and the partial queries a modder actually types.
    #[test]
    fn search_answers_the_queries_a_modder_types() {
        let paths = [
            "assets/characters/aatrox/skins/base/aatrox_base_tx_cm.dds",
            "assets/characters/aatrox/skins/skin01/aatrox_skin01_tx_cm.dds",
            "assets/characters/aatrox/hud/aatrox_circle.dds",
            "assets/characters/aatrox/aatrox.bin",
            "assets/characters/ahri/skins/base/ahri_base_tx_cm.dds",
            "assets/maps/shipping/map11/map11.materials.bin",
            "data/characters/aatrox/aatrox.bin",
            "data/menu/main_menu.bin",
        ];
        let tmp = game_with(&[
            ("Aatrox.wad.client", &paths[0..4]),
            ("Ahri.wad.client", &paths[4..5]),
            ("Map11.wad.client", &paths[5..6]),
            ("Global.wad.client", &paths[6..8]),
        ]);
        let index = build(tmp.path(), &paths);

        // A bare file name.
        assert_eq!(
            ranked(&index, "aatrox_circle.dds"),
            ["assets/characters/aatrox/hud/aatrox_circle.dds"]
        );

        // A fragment of a name, which is what a modder half-remembers.
        assert_eq!(
            ranked(&index, "circle"),
            ["assets/characters/aatrox/hud/aatrox_circle.dds"]
        );

        // A directory fragment, matched over the path.
        assert!(
            ranked(&index, "hud")
                .contains(&"assets/characters/aatrox/hud/aatrox_circle.dds".to_owned())
        );

        // A path typed with its separators.
        assert!(
            ranked(&index, "characters/ahri")
                .contains(&"assets/characters/ahri/skins/base/ahri_base_tx_cm.dds".to_owned())
        );

        // A run spanning directory and name, the band 2 case.
        assert!(
            ranked(&index, "skin01/aatrox").contains(
                &"assets/characters/aatrox/skins/skin01/aatrox_skin01_tx_cm.dds".to_owned()
            )
        );

        // Two terms, which is how a modder narrows without knowing the path.
        assert_eq!(
            ranked(&index, "aatrox circle"),
            ["assets/characters/aatrox/hud/aatrox_circle.dds"]
        );

        // Every aatrox row, across two archives.
        let aatrox = ranked(&index, "aatrox");
        assert_eq!(aatrox.len(), 5, "{aatrox:?}");

        // A name that only one archive carries.
        assert_eq!(ranked(&index, "main_menu"), ["data/menu/main_menu.bin"]);

        // Something the install does not hold.
        assert!(ranked(&index, "zed").is_empty());
    }

    #[test]
    fn search_obeys_the_shared_ranking_fixture() {
        #[derive(serde::Deserialize)]
        struct Fixture {
            cases: Vec<Case>,
        }
        #[derive(serde::Deserialize)]
        struct Case {
            name: String,
            query: String,
            expect: Vec<String>,
            #[serde(default)]
            reject: Vec<String>,
        }

        let raw =
            include_str!("../../../src/modules/workshop/palette/__tests__/ranking.fixture.json");
        let fixture: Fixture = serde_json::from_str(raw).unwrap();

        for case in fixture.cases {
            let held: Vec<&str> = case
                .expect
                .iter()
                .chain(case.reject.iter())
                .map(String::as_str)
                .collect();
            let (_tmp, index) = index_over(&held);

            assert_eq!(ranked(&index, &case.query), case.expect, "{}", case.name);
        }
    }

    fn find_query(pattern: &str, syntax: PatternSyntax) -> FindQuery {
        FindQuery::parse(pattern, syntax).unwrap().unwrap()
    }

    /// The full path of each hit, in the order the search returned them.
    fn found(index: &GameIndex, pattern: &str) -> Vec<String> {
        let query = find_query(pattern, PatternSyntax::Literal);
        index
            .find(&query, || false)
            .hits
            .into_iter()
            .map(|hit| hit.path.unwrap_or(hit.name))
            .collect()
    }

    #[test]
    fn find_lists_every_match_in_tree_order() {
        let (_tmp, index) = index_over(&[
            "assets/characters/aatrox/aatrox.bin",
            "assets/characters/aatrox/skins/base/aatrox.skn",
            "assets/characters/ahri/ahri.bin",
            "data/characters/aatrox/aatrox.bin",
        ]);

        assert_eq!(
            found(&index, "aatrox"),
            [
                "assets/characters/aatrox/aatrox.bin",
                "assets/characters/aatrox/skins/base/aatrox.skn",
                "data/characters/aatrox/aatrox.bin",
            ]
        );
    }

    #[test]
    fn find_ignores_case() {
        let (_tmp, index) = index_over(&["assets/characters/aatrox/aatrox.bin"]);
        assert_eq!(
            found(&index, "AATROX.BIN"),
            ["assets/characters/aatrox/aatrox.bin"]
        );
    }

    #[test]
    fn find_takes_a_regex_over_the_full_path() {
        let (_tmp, index) = index_over(&[
            "assets/characters/aatrox/skins/skin01/aatrox_skin01_tx_cm.dds",
            "assets/characters/aatrox/skins/skin03/aatrox_skin03_tx_cm.dds",
            "assets/characters/aatrox/aatrox.bin",
        ]);

        let query = find_query(r"skins/skin0[12].*\.dds$", PatternSyntax::Regex);
        let hits = index.find(&query, || false).hits;
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "aatrox_skin01_tx_cm.dds");
        assert_eq!(
            hits[0].path.as_deref(),
            Some("assets/characters/aatrox/skins/skin01/aatrox_skin01_tx_cm.dds")
        );
        // The run crosses the separator, so both lines carry a piece of it.
        assert!(!hits[0].path_ranges.is_empty());
        assert_eq!(hits[0].name_ranges, [(0, hits[0].name.len() as u32)]);
    }

    /// One pattern, one run in the directory and one in the name, each marked
    /// on its own line.
    #[test]
    fn find_marks_every_run_it_matched() {
        let (_tmp, index) = index_over(&["assets/aatrox/aatrox.bin"]);
        let query = find_query("aatrox", PatternSyntax::Literal);

        let hit = index.find(&query, || false).hits.remove(0);
        assert_eq!(hit.name, "aatrox.bin");
        assert_eq!(hit.path.as_deref(), Some("assets/aatrox/aatrox.bin"));
        assert_eq!(hit.name_ranges, [(0, 6)]);
        assert_eq!(hit.path_ranges, [(7, 13)]);
        assert_eq!(hit.wad, "Search.wad.client");
        assert!(hit.size_bytes > 0);
    }

    #[test]
    fn find_counts_every_match_past_its_cap() {
        let paths: Vec<String> = (0..30)
            .map(|i| format!("assets/skins/aatrox_{i:03}.bin"))
            .collect();
        let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
        let (_tmp, index) = index_over(&refs);

        let query = find_query("aatrox", PatternSyntax::Literal);
        let result = index.find_capped(&query, 10, || false);

        assert_eq!(result.hits.len(), 10);
        assert_eq!(result.total as usize, paths.len());
        assert!(!result.superseded);
    }

    #[test]
    fn find_reaches_a_chunk_no_hash_table_names_by_its_hash() {
        let tmp = game_with(&[("Search.wad.client", &["assets/characters/aatrox.bin"])]);
        let index = build(tmp.path(), &[]);

        let hash = format!("{:016x}", xxh64(b"assets/characters/aatrox.bin", 0));
        let by_hash = index.find(&find_query(&hash, PatternSyntax::Literal), || false);
        assert_eq!(by_hash.hits.len(), 1);
        assert_eq!(by_hash.hits[0].name, hash);
        assert!(by_hash.hits[0].path.is_none());

        let result = index.find(&find_query("aatrox", PatternSyntax::Literal), || false);
        assert!(result.hits.is_empty());
        assert!(result.unnamed);
    }

    #[test]
    fn find_gives_up_once_it_has_been_overtaken() {
        let paths: Vec<String> = (0..=STALE_CHECK_INTERVAL)
            .map(|i| format!("assets/skins/aatrox_{i:05}.bin"))
            .collect();
        let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
        let (_tmp, index) = index_over(&refs);

        let query = find_query("aatrox", PatternSyntax::Literal);
        let overtaken = index.find(&query, || true);
        assert!(overtaken.superseded);
        assert!((overtaken.total as usize) < paths.len());

        let whole = index.find(&query, || false);
        assert!(!whole.superseded);
        assert_eq!(whole.total as usize, paths.len());
    }

    #[test]
    fn merges_archives_into_one_tree() {
        let paths = ["assets/shared.bin", "assets/aatrox/skin0.bin"];
        let game = game_with(&[
            ("Aatrox.wad.client", &paths),
            (
                "Ahri.wad.client",
                &["assets/shared.bin", "assets/ahri/skin0.bin"],
            ),
        ]);

        let index = build(
            game.path(),
            &[
                "assets/shared.bin",
                "assets/aatrox/skin0.bin",
                "assets/ahri/skin0.bin",
            ],
        );

        let root = index.read_dir("").unwrap();
        assert_eq!(root.dirs.len(), 1, "one tree, not one row per archive");
        assert_eq!(root.dirs[0].name, "assets");
        assert_eq!(root.dirs[0].file_count, 3, "the shared chunk counts once");

        let assets = index.read_dir("assets").unwrap();
        let dirs: Vec<&str> = assets.dirs.iter().map(|d| d.name.as_str()).collect();
        assert_eq!(
            dirs,
            ["aatrox", "ahri"],
            "both archives' paths, side by side"
        );
        let files: Vec<&str> = assets
            .files
            .iter()
            .filter_map(|f| f.path.as_deref())
            .collect();
        assert_eq!(files, ["assets/shared.bin"]);
    }

    #[test]
    fn a_shared_chunk_is_one_file() {
        let game = game_with(&[
            ("A.wad.client", &["assets/shared.bin"]),
            ("B.wad.client", &["assets/shared.bin"]),
            ("C.wad.client", &["assets/shared.bin"]),
        ]);

        let index = build(game.path(), &["assets/shared.bin"]);

        let files = index.read_dir("assets").unwrap().files;
        assert_eq!(files.len(), 1);
        assert_eq!(
            files[0].wad, "A.wad.client",
            "the copy that survives the fold names the archive it came from"
        );
        let stats = index.stats();
        assert_eq!(stats.archives, 3);
        assert_eq!(stats.files, 1);
    }

    #[test]
    fn every_file_names_the_archive_it_came_from() {
        let game = game_with(&[
            ("A.wad.client", &["assets/one.bin"]),
            ("Champions/B.wad.client", &["assets/two.bin"]),
        ]);

        let index = build(game.path(), &["assets/one.bin", "assets/two.bin"]);

        let files = index.read_dir("assets").unwrap().files;
        let wads: Vec<(&str, &str)> = files
            .iter()
            .map(|file| (file.path.as_deref().unwrap(), file.wad.as_str()))
            .collect();
        assert_eq!(
            wads,
            [
                ("assets/one.bin", "A.wad.client"),
                ("assets/two.bin", "Champions/B.wad.client"),
            ]
        );
    }

    #[test]
    fn an_unnamed_chunk_names_its_archive_too() {
        let game = game_with(&[("A.wad.client", &["assets/hidden.bin"])]);

        let index = build(game.path(), &[]);

        let files = index.read_dir(UNKNOWN_DIR).unwrap().files;
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].wad, "A.wad.client");
    }

    #[test]
    fn folds_a_chain_of_single_child_directories() {
        let game = game_with(&[("A.wad.client", &["assets/characters/aatrox/hud/icon.dds"])]);
        let index = build(game.path(), &["assets/characters/aatrox/hud/icon.dds"]);

        let root = index.read_dir("").unwrap();
        assert_eq!(root.dirs[0].name, "assets/characters/aatrox/hud");
        assert_eq!(
            root.dirs[0].path, "assets/characters/aatrox/hud",
            "the row opens the directory that holds the files"
        );

        let folded = index.read_dir(&root.dirs[0].path).unwrap();
        assert_eq!(folded.files.len(), 1);
        assert_eq!(
            folded.files[0].path.as_deref(),
            Some("assets/characters/aatrox/hud/icon.dds"),
            "a file carries the whole path, folded rows included"
        );
    }

    #[test]
    fn a_chain_stops_folding_where_it_branches() {
        let game = game_with(&[(
            "A.wad.client",
            &[
                "assets/characters/aatrox/a.bin",
                "assets/characters/ahri/b.bin",
            ],
        )]);
        let index = build(
            game.path(),
            &[
                "assets/characters/aatrox/a.bin",
                "assets/characters/ahri/b.bin",
            ],
        );

        let root = index.read_dir("").unwrap();
        assert_eq!(root.dirs[0].name, "assets/characters");
        assert_eq!(root.dirs[0].file_count, 2);
    }

    #[test]
    fn unnamed_chunks_gather_under_one_group() {
        let game = game_with(&[("A.wad.client", &["assets/known.bin", "assets/mystery.bin"])]);
        let index = build(game.path(), &["assets/known.bin"]);

        let root = index.read_dir("").unwrap();
        let names: Vec<&str> = root.dirs.iter().map(|d| d.name.as_str()).collect();
        assert_eq!(
            names,
            ["assets", "unknown"],
            "the group sits after named paths"
        );

        let unknown = index.read_dir(UNKNOWN_DIR).unwrap();
        assert_eq!(unknown.files.len(), 1);
        assert_eq!(
            unknown.files[0].path, None,
            "nothing names an unnamed chunk"
        );
        assert_eq!(
            unknown.files[0].path_hash,
            format!("{:016x}", xxh64(b"assets/mystery.bin", 0))
        );
        assert_eq!(index.stats().files, 2, "unnamed chunks count as files");
    }

    #[test]
    fn a_path_outside_the_index_lists_nothing() {
        let game = game_with(&[("A.wad.client", &["assets/known.bin"])]);
        let index = build(game.path(), &["assets/known.bin"]);

        assert!(index.read_dir("assets/nope").is_none());
        assert!(index.read_dir("nope").is_none());
    }

    #[test]
    fn an_install_with_no_archives_builds_an_empty_tree() {
        let game = game_with(&[]);
        let index = build(game.path(), &[]);

        let root = index.read_dir("").unwrap();
        assert!(root.dirs.is_empty());
        assert!(root.files.is_empty());
        assert_eq!(index.stats().files, 0);
    }
}
