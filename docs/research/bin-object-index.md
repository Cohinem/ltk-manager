# The bin object index is unblocked upstream and unbuilt here

Research note, and the record of what was decided from it. Sections 1 to 7 are evidence gathered
on 2026-09-05 against this repository at `f89f50b` (`main`), the `ltk_meta` checkout the
workspace compiles (league-toolkit at `0bc9d0ea352b8e28d5aeef3c589bd970ed290e38`, branch
`feat/value-walk`), the published `ltk_meta` 0.8.1 in the cargo registry, and the upstream issues
as they stood that day. Section 8 is the verdict, section 9 what follows from it, and
section 10 the decisions taken on it.

The question was whether the manager can build a full index of every bin object the installed
game declares and answer a search over it from the command bar, and what has to be true upstream
and in this repository for that to work. Nothing here ran the app or wrote to the install.

Four findings decide the rest:

- **The lazy read the design named as its blocker exists, and has for longer than the design
  admits.** `docs/ux/PROJECT_EDITOR.md` marks the install's half of the index **Blocked** on "a
  lazy `ltk_meta` read" (line 97) and says "`ltk_meta` has no lazy read, and this is the blocker"
  (line 629). At the pinned rev `BinStream::entries()` yields one `ObjectEntry` per object as
  `(path_hash, class_hash, offset, size)` after an 8-byte hop, and the same API is in the
  published 0.8.1 crate. The row is stale, and the code in this repository has been reading bins
  through `BinStream::mount` since 2026-09-03.
- **Nothing upstream hard-blocks the install's half.** Issue 192's own body says `PROP` reading is
  complete. What is open there is the `PTCH` stream, the write-back, and the value walk of PR 227
  that this workspace is already pinned to. The index needs none of them. A `PTCH` falls back to
  the eager reader exactly as the problems pass already does.
- **Every piece the design reuses is in the repository, and none of the index is.** The archive
  walk, the chunk decompressor, the letter-mask scan with its bounded heap and cancellation
  ticket, the four bin hash tables opened as `BinHashTables`, the palette's source and scope
  machinery, and a `Budget`-bounded pass that mounts every bin of a project all exist. No object
  arena, build, cache, command, palette source, or `$` scope does, and neither does the project
  half the design said ships first.
- **Every measured number the design rests on comes from one commit, with no script kept, on an
  install no later measurement matches.** The 359,095 objects, 760ms parse and 3.1ms header scan
  all landed in `8307161` on 2026-08-20. Two of the figures do not reconcile with each other
  arithmetically, and the upstream corpus of 2026-09-01 counts 392 archives and 454,073 objects
  against the design's 456 and 383,357. They are measurements, and they are not reproducible from
  anything checked in.

## Sources

Primary, in order of weight:

- `docs/ux/PROJECT_EDITOR.md` - the design that specified the index. Sections "The project bar",
  "What it searches", "Scopes", "The scan of the game", "The bin object index" and every
  subsection under it, "Building the palette", "The game index", and the feature status table
- `docs/ux/BIN_EDITOR.md` - the block editor, and its "The parse is not the problem" revision
- `docs/plans/project-command-bar.md` and `docs/plans/game-full-search.md` - what shipped on
  2026-08-20 and what each named as out of scope
- `docs/design/problems-pass.md` - the pass that already mounts every bin of a project
- `Cargo.toml` at the repo root - the `[patch.crates-io]` pin and the parse-rate comment above it
- `crates/ltk-manager-core/src/game_index.rs`, `game_wads.rs`, `matcher.rs`, `hashtables.rs`,
  `meta_schema.rs`, `problems/pass.rs`, `problems/pass/source.rs`, `problems/pass/fan.rs`,
  `problems/pass/plan.rs`, `problems/engine.rs`, `problems/budget.rs`, `problems/game.rs`,
  `problems/names.rs`
- `src-tauri/src/commands/game_index.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/setup.rs`
- `src/modules/workshop/palette/` - `types.ts`, `sources.ts`, `candidate.ts`, `usePaletteSearch.ts`,
  `useGameRows.tsx`, `ProjectPalette.tsx`, `ResultsPalette.tsx`, `WorkshopBar.tsx`, and
  `src/modules/workshop/gameBrowser/useGameSearch.ts`, `src/lib/tauri.ts`, `src/stores/workshopLayout.ts`
- The `ltk_meta` source at league-toolkit `0bc9d0e`, read from
  `~/.cargo/git/checkouts/league-toolkit-*/0bc9d0e/`: `crates/ltk_meta/src/lib.rs`, `stream.rs`,
  `stream/toc.rs`, `stream/prop.rs`, `stream/cursor.rs`, `walk.rs`, `walk/tree.rs`,
  `tests/corpus.rs`, and `docs/design/bin-streaming.md`, `docs/design/value-walk.md`,
  `docs/prd/002-streaming-bin-reading.md`, `docs/adr/0012` to `0014`. Cited below as
  `league-toolkit@0bc9d0e` plus the path
- The published `ltk_meta` 0.8.1, `~/.cargo/registry/src/*/ltk_meta-0.8.1/src/`, for what is on
  crates.io against what is only on the branch
- `ltk_overlay` 0.9.7 `src/game_index.rs` and `ltk_wad` 0.5.4 `src/lib.rs`, from the registry
- `ltk_mimir_cache` and `ltk_hashdb` at mimir `6701969`, the rev `Cargo.toml` pins, for
  `Table::ALL` and the `HashDb` read API
- [league-toolkit issue 192, Lazy Bin reading](https://github.com/LeagueToolkit/league-toolkit/issues/192)
- [league-toolkit issue 225, Value walk](https://github.com/LeagueToolkit/league-toolkit/issues/225)
- [league-toolkit issue 219, ValuePath](https://github.com/LeagueToolkit/league-toolkit/issues/219)
- [league-toolkit PR 227, feat(ltk_meta): value walk](https://github.com/LeagueToolkit/league-toolkit/pull/227)
- `git log` of this repository, for the dates on which each piece landed

## 1. What the project editor decided

The design lives in `docs/ux/PROJECT_EDITOR.md` under "The bin object index" (line 485) and its
subsections, all written in commit `8307161` on 2026-08-20 and untouched since. This section
records what it decided, so that the rest of the note can say what has moved.

### 1.1 The shape

The index answers one question, "which `.bin` declares this object?", for a query typed into the
project bar (lines 494-498). It is two halves that hold none of each other's data (line 531):

| Half      | Holds                                    | Where it comes from                           |
| --------- | ---------------------------------------- | --------------------------------------------- |
| Names     | Every object path CommunityDragon knows  | The `binentries` mimir table, shared          |
| Locations | Object hash to the files that declare it | A scan of the install, and one of the project |

The scan keeps `(object hash, class hash, file)` per declaration "and nothing else", 12 bytes a
row (lines 544-545). The palette matches the query against the table's strings and turns each
survivor into a file through the index, so a name the install does not declare never reaches the
list (lines 547-550). An object no table names still has a row under its hex, and a query of
eight hex digits is looked up directly rather than matched (lines 523-525).

A row draws the object's path with the match marked, its class, the declaring `.bin` with its
archive or layer, and a count where more than one file declares it. `Enter` opens the declaring
file, which until the bin editor lands means revealing it in an explorer (lines 502-521).

**The cache holds hashes and no names** (line 712). Names resolve at load against the mapped
mimir table, measured at 200ms for every hash, because a name written into the cache today can be
wrong when the tables update (lines 712-715). The object table is designed as a section of the
memory-mapped cache that "One cache, not two" (line 2555) describes, keyed by per-archive
checksums with a format version that forces a full rebuild (lines 707-710).

The scan also reads each bin's dependency list on its way past and stores those 121,665 edges in
both directions. No search reads them. The first reader is the link picker of `league-mod`
issue 190 (lines 717-789).

### 1.2 The scopes, and the two halves' order

The `$` prefix scopes the bar to "the bin objects of the install" (line 331), later widened to
"every bin object, the project's and the install's" (line 823). `@` scopes "inside the active
document", which for an open bin is that file's objects, answered "as a range rather than a
search" (lines 826-828). An **Objects** switch beside **Search the game** keeps the index from
being built at all for a modder who never touches a `.bin` (lines 829-830).

The project's own objects match in the frontend on the content scan's payload, and the install's
match in Rust beside the game scan with the same generation token and bounded heap (lines
791-805). The project half ships first because its reader "exists" and 250MB/s is enough for a
project's few megabytes (lines 571-575).

| Step | Holds                                                                         |
| ---- | ----------------------------------------------------------------------------- |
| 1    | The project's own objects, on the reader that exists, and the `@` scope       |
| 2    | `ltk_meta::Bin::scan` upstream, which is the blocker for everything below     |
| 3    | The install's scan, its cache section, and the override line on a project row |
| 4    | The `$` scope, and the object pickers that **#190** and **#191** want         |

(lines 860-865.) The palette's own order table lists the Objects source as step 4, "once its
index is buildable", and the `@` scope as the unshipped part of step 3, waiting "on a document
that can answer for its own contents" (lines 956-970).

### 1.3 The reader it asked for

The design sketched what it needed from `ltk_meta` (lines 634-656): a `BinHeader` of
`is_override`, `version` and `dependencies`, a `BinObjectHeader` of `path_hash`, `class_hash`,
`offset` and `size`, and `Bin::scan<R: Read + Seek>(reader: &mut R) -> Result<BinScan<'_, R>>`
iterating those headers with "a second call" that materialises one object. It put the request
upstream on purpose: "a private copy is a second thing to keep current with the format" (lines
629-633).

### 1.4 The numbers, and where each came from

Every figure below is in `docs/ux/PROJECT_EDITOR.md` and nowhere else in the repository. All
of them arrived in `8307161` on 2026-08-20 (`git log -S"359,095"`). No script, notebook or raw
output was kept, and `grep` over the tree finds the figures only in the two design documents.
`docs/plans/project-command-bar.md` records that "There is no League install on the machine
this was written on" for the game scan's own timing, so the bin measurements were taken on a
different machine from the one the same commit's code was written on, or at a different time.
Nothing checked in says which.

| Figure                                  | Where                       | What it is                                            |
| --------------------------------------- | --------------------------- | ----------------------------------------------------- |
| 456 archives, 939,329 chunks            | line 679, and line 2502     | Measured, one live install                            |
| 50,390 `.bin` chunks, 42,306 after fold | line 683                    | Measured                                              |
| 2,261MB decompressed                    | line 684                    | Measured                                              |
| 4.7s cold, 1.3s warm build              | lines 685-686               | Measured, "decompression and nothing else" (line 698) |
| 14ms of that in the header scan         | line 687                    | Measured or extrapolated, see below                   |
| 383,357 declarations, 359,095 distinct  | lines 688-689               | Measured                                              |
| 325,357 named, 90.6%                    | line 690                    | Measured against the `binentries` table of that day   |
| 5,965 declared by more than one file    | line 691                    | Measured                                              |
| 539 classes                             | line 692                    | Measured                                              |
| 121,665 edges, 116,201 resolving        | line 693                    | Measured                                              |
| 3 files that will not scan              | line 694                    | Measured. The design does not say which three, or why |
| 4.6MB at 12 bytes a declaration         | line 695                    | Arithmetic: 383,357 x 12                              |
| 200ms, 21.1MB, to resolve every name    | line 696                    | Measured                                              |
| 3.1ms header scan, 760ms full parse     | lines 621-623, over 194.8MB | Measured, on a 194.8MB sample                         |
| 250MB/s                                 | `BIN_EDITOR.md` line 602    | Arithmetic: 194.8MB / 760ms                           |
| 421,835 paths in 2.2MB (`binentries`)   | line 539                    | Measured against the table of that day                |
| 16ms and 150ms per keystroke            | lines 809-810               | Targets, stated as such at line 458                   |

Two things about these figures do not close.

**The sample and the whole disagree by a factor the doc does not explain.** The parse timing is
"over the same 194.8MB of already-decompressed bins" (line 621), but the install's bins hold
2,261MB decompressed (line 684). Scaling 760ms by 2,261/194.8 gives 8.8s, which matches the
doc's "about nine seconds" (line 625). Scaling the 3.1ms header scan the same way gives 36ms, not
the 14ms the build table records (line 687). One of the two scan figures is on a different
basis from the other, and nothing checked in says which.

**The parse rate has a second, lower measurement in this repository.** The comment above
`[profile.dev.package."*"]` in `Cargo.toml` (lines 5-7) says "A debug build parses bins at 18
MB/s against 144 MB/s optimised". That is an eager `ltk_meta` parse measured for a different
reason, on an unnamed date and machine, at a little over half the 256MB/s the design's 760ms
implies. Both are real readings, and the gap says the 760ms figure should not be carried to a
second decimal place anywhere.

The upstream corpus sweep, in `league-toolkit@0bc9d0e` `docs/design/bin-streaming.md` appendix A
(lines 911-930), counts 392 archives, 48,912 `PROP` chunks and 454,073 objects on a live install
with the eager and streaming readers agreeing on every one. Against the design's 456 archives,
50,390 bin chunks and 383,357 declarations after folding to 42,306 files, the archive count says
these are different installs, or different patches of one, and the object count is not folded
and excludes `PTCH`. The two are not contradictory, and they are not the same measurement.
`docs/research/game-db-as-precomputed-index.md` section 1 measured 392 WAD rows on 2026-09-03
at build `16.17.8104348`, so 392 is the current install and 456 is an older one.

## 2. Upstream today

All four items are by Crauzer, and none has a comment thread. State is as read on 2026-09-05.

| Item                                        | State | Opened     | Last moved | Asks for                                                                                   |
| ------------------------------------------- | ----- | ---------- | ---------- | ------------------------------------------------------------------------------------------ |
| [#192 Lazy Bin reading][i192]               | Open  | 2026-08-25 | 2026-09-02 | The umbrella: header read, an iterator over object headers "for grepping", lazy resolution |
| [#219 ValuePath][i219]                      | Open  | 2026-08-31 | 2026-09-02 | The address type, `MapKey`, `FieldNames`. "Every later ticket depends on this type"        |
| [#225 Value walk][i225]                     | Open  | 2026-09-02 | 2026-09-02 | One `Visitor` traversal over both trees. Labelled `blocked`, "Blocked by #219"             |
| [PR #227 feat(ltk_meta): value walk][pr227] | Open  | 2026-09-02 | 2026-09-02 | The implementation of #225. Head `0bc9d0e`, four commits, `CHANGES_REQUESTED` by alanpq    |

[i192]: https://github.com/LeagueToolkit/league-toolkit/issues/192
[i219]: https://github.com/LeagueToolkit/league-toolkit/issues/219
[i225]: https://github.com/LeagueToolkit/league-toolkit/issues/225
[pr227]: https://github.com/LeagueToolkit/league-toolkit/pull/227

**Issue 192 is exactly the request the design made, and it is mostly done.** Its body asks for
"Header data reading", "Iterate over all objects in the file by seeking through them. Being able
to harvest object path hashes is useful for grepping", and a lazy resolution API, and it calls
the lazy read "a key blocker for implementing an optimized bin grepping API". Its checklist
marks #206, #207, #208, #209 and #214 done and says in prose: "`PROP` reading is complete: mount,
header, TOC harvest, per-object seek, zero-copy views, one owned decode path shared with
`Bin::from_reader`, the opt-in object cache, and batch lookup." Three children are open: #210,
the `PTCH` stream, #211, the delta write-back, and #217, resolving a `PropertyPath` over the
views, which is "deliberately unscheduled until a consumer asks".

**Issues 225 and 219 and PR 227 are the walk, and the index does not need them.** #225 names its
consumer as "`ltk-manager`'s problems pass, which reads every bin once and runs every
health-check rule over that one read". PR 227 carries it: `walk.rs`, `walk/owned.rs`,
`walk/tree.rs`, `walk/view.rs`, changes to `stream/view.rs` and `tests/corpus.rs`, and
`docs/design/value-walk.md`. Its one review is `CHANGES_REQUESTED` on 2026-09-02 15:26 with a
single inline comment on `crates/ltk_meta/src/property/enum.rs`, asking for `holds_node` and
`is_node` to be renamed or moved under the walk module. The branch's third commit, `4d88da4`
"refactor(ltk_meta): node predicates under walk", moves them to `walk/tree.rs`
(`league-toolkit@0bc9d0e` `crates/ltk_meta/src/walk/tree.rs:36-71`). The review has not been
re-requested or dismissed, so the PR reads as stalled on process rather than on code. #219's
`ValuePath` is not at the rev at all: `grep` for `pub struct ValuePath` over
`crates/ltk_meta/src/` finds nothing, and `Node` at `walk.rs:219-258` has no `value_path`
method. The walk landed "behind those methods", as #225 said it could.

**The two documents and the code disagree, and the code is right.** `PROJECT_EDITOR.md` line 97
holds the index **Blocked** on a lazy read, line 629 says the read does not exist, and the
answered-questions table at line 2869 says `ltk_meta` blocks it because "Its read is eager, and
242x the header scan". `BIN_EDITOR.md` line 636 lists `Bin::scan` as "Upstream, wanted by the
object index". All four sentences were true on 2026-08-20. Section 3 shows the read at the
pinned rev, and `crates/ltk-manager-core/src/problems/pass/source.rs:50` has mounted bins
through it since `3c7d61f` on 2026-09-03.

## 3. What the pinned `ltk_meta` gives the index

`Cargo.toml` lines 78-82 patch `ltk_meta`, `ltk_hash`, `ltk_io_ext` and `ltk_primitives` to
league-toolkit `0bc9d0ea352b8e28d5aeef3c589bd970ed290e38`, with the comment at lines 73-77
saying the pin is for `ltk_meta::walk` on `feat/value-walk` (PR 227) and should move to "the
release that carries it". The crate at that rev is `ltk_meta` 0.8.1 with the `serde` feature on
(`Cargo.toml:29`).

### 3.1 The API, as it is

The streaming module is `stream.rs`, and its module doc is the contract
(`league-toolkit@0bc9d0e` `crates/ltk_meta/src/stream.rs:1-18`):

> `BinStream::mount` reads the header, dependencies and class-hash table, then stops.
> `BinStream::entries` sweeps the object table, yielding one `ObjectEntry` descriptor per
> object and skipping every body by its size field. `BinStream::toc` caches the sweep as a
> `BinToc`, so random access by path hash (`BinStream::object`) costs one harvest at most, and
> `BinStream::objects_batch` resolves a whole set of hashes on one forward schedule.

The row the sweep yields (`stream/toc.rs:7-19`):

```rust
/// One row of the table of contents.
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ObjectEntry {
    /// The object's path hash.
    pub path_hash: BinHash,
    /// The object's class hash, from the table read at mount.
    pub class_hash: BinHash,
    /// Absolute offset of the object's `u32` size field.
    pub offset: u64,
    /// Declared byte size of the object body (as the file states it).
    pub size: u32,
}
```

The handle (`stream/prop.rs:46, 88, 145, 151, 157, 188, 203, 217, 256, 317`):

```rust
pub struct BinStream<R: io::Read + io::Seek, M = NoMeta> { /* ... */ }

impl<R: io::Read + io::Seek, M: Default> BinStream<R, M> {
    pub fn mount(source: R) -> Result<Self, Error>;
    pub fn version(&self) -> u32;
    pub fn dependencies(&self) -> &[String];
    /// Class hash of every object, in file order. `class_hashes().len()` is the object count.
    pub fn class_hashes(&self) -> &[BinHash];
    pub fn entries(&mut self) -> Entries<'_, R, M>;          // Iterator<Item = Result<ObjectEntry, Error>>
    pub fn toc(&mut self) -> Result<&BinToc, Error>;
    pub fn object(&mut self, path_hash: impl Into<BinHash>) -> Result<Option<ObjectStream<'_, R, M>>, Error>;
    pub fn objects_batch(&mut self, hashes: impl IntoIterator<Item = impl Into<BinHash>>) -> BatchObjects<'_, R, M>;
    pub fn into_bin(self) -> Result<Bin<M>, Error>;
}
```

`mount` "reads sequentially to the start of the object bodies and stops" and refuses a `PTCH`
with `Error::UnexpectedBinKind` (`prop.rs:78-88`). Each step of the sweep "reads the 8-byte
object header (`size`, `path_hash`); the class hash comes from the table read at mount"
(`stream/cursor.rs:28-32`). `BinToc` is `Clone` and, behind the `serde` feature this workspace
enables, serialisable, with the doc saying why: "so a consumer can detach it from the handle
that built it, and ... persisted" (`stream/toc.rs:31-35`). Rule S6 of the design names the
consumer: "The manager's object index wants to persist it and iterate it without holding the file
open" (`docs/design/bin-streaming.md:890`).

That is the design's `Bin::scan` under another name, and more. `BinObjectHeader` is
`ObjectEntry` field for field. `BinHeader` is `version()`, `dependencies()` and the `PTCH`
refusal. The "second call" that materialises one object is `ObjectStream::read` for an owned
`BinObject` or `ObjectStream::view` for a zero-copy view (`stream/cursor.rs:150-179`). The
`objects_batch` schedule and the opt-in `ObjectCache` are beyond what the design asked for.

The walk, which this workspace is pinned for and the index does not need (`walk.rs:648-666`):

```rust
impl<R: io::Read + io::Seek, M: Default> BinStream<R, M> {
    /// Walks every object in file order, one buffered object at a time ...
    /// Holds one object's bytes at any moment and nothing of the tree.
    pub fn walk<E, W>(&mut self, visitor: &mut W) -> Result<WalkOutcome, E>
    where
        E: From<Error>,
        W: for<'a> Visitor<'a, ValueView<'a, M>, Error = E>;
}
```

### 3.2 What is on crates.io against what is on the branch

The published `ltk_meta` 0.8.1 has `src/stream.rs` and `src/stream/` and no `src/walk`. Its
`stream.rs:56` exports `BinToc` and `ObjectEntry`, and its `stream/prop.rs` has `entries` at
line 188, `toc` at 203 and `objects_batch` at 256. So the read the index needs is not
branch-only. It shipped in a release, and the design's "Blocked" row was already wrong the day
0.8.1 published. Only the walk waits on PR 227.

### 3.3 Its stated cost

Upstream publishes no timing of the sweep. `tests/corpus.rs` at the rev holds no `Instant` and
prints counts alone, and appendix A of `bin-streaming.md` is a parity table, not a timing table.
What the crate states is structural:

- One seek-hop of 8 bytes per object, and "the sweep that harvests is the sweep that indexes"
  (`docs/design/bin-streaming.md:104-109`, repeated as a constraint in
  `docs/prd/002-streaming-bin-reading.md:105-108`)
- Mounting reads the header and stops, "nothing past the header is touched until something asks
  for it" (`stream/prop.rs:80-81`)
- "The per-object walk is microseconds; decompression and I/O are where a sweep spends its time"
  (`lib.rs:185-186`), said of the walk, which does strictly more than the sweep
- A sweep holds "at most one object's bytes at a time" (`docs/prd/002-streaming-bin-reading.md:92-93`)

PRD-002 also states the problem in the index's own terms: "A grep index over 42,306 files wants
nothing but each object's path hash and class hash - two `u32`s that sit in the object table's
first 8 bytes - and pays a full parse of every object to get them" (`docs/prd/002:18-19`), and
"`PropertyValueEnum` is 96 bytes per node at align 16" (line 18). The 42,306 in that sentence is
the design's own fold count, which says the two documents were written against each other.

### 3.4 Where the spec and the rev part company

Two things `bin-streaming.md` states as present are not in the code at `0bc9d0e`, and neither
matters to the index:

- Rule S23 (line 907) and FR-13 of the PRD say `BinToc::largest` answers the largest declared
  object size. `stream/toc.rs` has `entries`, `entry` and `push` and no `largest`. The problems
  pass's budget is what wants it (`docs/design/problems-pass.md:839-841`), not the index
- Section 1 (line 48) lists `BinOverrideStream<R>`. `stream.rs` exports no such type. That is
  #210, unchecked on issue 192, so a `PTCH` still reads eagerly through
  `BinOverride::from_reader`, which is what `problems/pass/source.rs:45-48` does

The design's `BinHeader.is_override` has no direct equivalent either. `mount` refuses a `PTCH`,
and telling the two apart is `BinKind::identify_from_reader` (`lib.rs:277-299`) or reading the
magic, which the pass does at `source.rs:39-45`.

## 4. What this repository already holds

### 4.1 The game index, and what it is not

`GameIndex` (`crates/ltk-manager-core/src/game_index.rs:232-240`) is a directory arena, with
`Dir` holding a `BTreeMap` of children, its files, a subtree file count and a `subtree_mask`
(lines 243-256), and `File` holding the name, a `u64` path hash, size, an archive ordinal and a
letter `mask` "which fills the padding this struct already had" (lines 259-267).

`GameIndex::build` (lines 279-307) walks `GameArchives::list()` in order and calls
`for_each_chunk` on each, inserting a chunk the first time its hash is seen, so a chunk several
archives carry is one file (lines 290-303). **The loop is sequential.** The design says the
object build "parallelizes across archives the way the game index build already does"
(`PROJECT_EDITOR.md:699`), and the game index build does not. It is one `for` over the
archives on one thread.

`GameIndex::search` (lines 367-406) builds a `Scan` (lines 642-656) that walks depth first with
one reusable `String`, prunes a subtree whose `subtree_mask` does not cover the query's mask
(lines 671-674), prunes a file the same way (lines 680-682), keeps a `BinaryHeap` of the best
`SEARCH_LIMIT` (100, line 130) rows, and tests `is_overtaken` every `STALE_CHECK_INTERVAL`
(4096, line 182) files. `SearchGeneration` is an `AtomicU64` a command claims a ticket from
(lines 188-200), and `FindGeneration` is a second one for the full search so that "a keystroke
in one box never gives up a scan the other box is waiting on" (lines 203-221). The letter mask
is `matcher::letter_mask`, one bit per `a` to `z` (`matcher.rs:265-274`), and `mask_covers` is
one `AND` (line 278).

**The game index has no disk cache and no fingerprint.** `GameIndexState` is
`Mutex<Option<Arc<GameIndex>>>` (line 978), built on first read under the lock and dropped by
`clear` (lines 991-1015). `PROJECT_EDITOR.md:2506-2508` says so: "Nothing writes it to disk yet,
so it costs those seconds once per session." The disk cache and fingerprint in the codebase are
`ltk_overlay`'s: its `GameIndex::load_or_build` reads a MessagePack `game_index.bin`, compares a
`game_fingerprint` and rebuilds on a mismatch (`ltk_overlay-0.9.7/src/game_index.rs:142-190`),
where the fingerprint is `xxh3_64` over every archive's path, length and modification time in
seconds (lines 651-670). The manager keeps that file in the profile directory
(`crates/ltk-manager-core/src/overlay/artifacts.rs:106`). The memory-mapped, per-archive-checksum
cache the design describes under "One cache, not two" exists in neither crate. Its one named
precondition, that `ltk_wad` expose the header checksum `Wad::mount` used to skip
(`PROJECT_EDITOR.md:2550-2553`), is met: `ltk_wad` 0.5.4 `src/lib.rs:457` has
`pub fn checksum(&self) -> u64`, "Returns embedded checksum verbatim", and `mount` reads the
field at lines 282 and 287 rather than seeking over it.

### 4.2 The archives, and how a chunk reaches a reader

`GameArchives` (`game_wads.rs:50-190`) resolves the install from `Config`, lists every
`*.wad.client` under `DATA/FINAL` sorted by name (line 86), and `for_each_chunk` visits every
chunk of one archive as `(path hash, resolved path, size)` without mounting it a second time
(lines 152-177). `WadCache::read_chunk` (lines 258-271) mounts the archive if it is not, finds the
chunk by hash and returns `load_chunk_decompressed(&chunk)?.into_vec()`, so a chunk arrives as an
owned `Vec<u8>`, whole. That is the shape `problems/engine.rs:351-358` already wraps as
`Opened::Memory(Cursor<Vec<u8>>)` for an archive-backed project file, and it satisfies
`BinStream::mount`'s `Read + Seek` bound.

### 4.3 The four tables, and the doc that says they are unopened

`Table::ALL` at mimir `6701969` (`crates/ltk_mimir_cache/src/table.rs:36-45`) holds `Game`,
`Lcu`, `BinEntries`, `BinTypes`, `BinFields`, `BinHashes`, `Rst` and `RstXxh3`. The manager's
`HashtableCache::status` iterates it (`hashtables.rs:389`) and `sync` downloads through it, and
the test at `hashtables/tests.rs:96-104` lists the four bin ids as what a bare cache is missing.

**`bin_tables()` exists.** `HashtableCache::bin_tables` (`hashtables.rs:573-583`) opens the four
through `open_shared`, best-effort, into `BinHashTables` (lines 791-848) with `entry`, `class`,
`field` and `value` lookups by `BinHash`. It landed in `4ed09cd` on 2026-08-23 and
`problems/names.rs:99` opens it beside `wad_tables()`. `BIN_EDITOR.md:97` ("Downloaded already,
and opened by nothing yet") and line 358 ("`hashtables.rs` gains a `bin_tables()`") were true
two days before that commit and are stale now. The doc comment above `BinHashTables`
(`hashtables.rs:784-789`) also explains why the four cannot be layered the way the two WAD
tables are: they hash "four unrelated kinds of string into 32 bits", and a shared lookup would
answer wrongly across half a million rows.

For the name side, `HashDb` at the pinned mimir rev has `get` (`reader.rs:426`), `get_batch`
resolving "in arena order so each frame decompresses at most once" (lines 486-489), `iter` in
the same order (line 607), `len` (line 533) and `hash_path` (line 597). `hashtables.rs:592-604`
already builds a whole-table list through `iter` for the string keys, which is the shape the
design's "One name list, built once" (`PROJECT_EDITOR.md:800-801`) takes.

### 4.4 The palette, and where a source plugs in

The bar shipped on 2026-08-20 (`docs/plans/project-command-bar.md`, status line 3) with the
scope machinery, and the game source and settings row with it (steps 1 and 2 of
`PROJECT_EDITOR.md:960-961`). What that machinery is:

- `PaletteSourceId` is a closed union of eight ids ending in `"game"` (`palette/types.ts:7-15`)
- `PALETTE_SOURCES` declares each source's label, optional `prefix` and `altPrefix`, cap and
  hint (`sources.ts:34-49`). The prefixes that exist are `/` and `~` for projects, `#` for
  strings, `>` for commands, and `?` for the help listing (line 64). **No `$` and no `@`.** A
  `grep` for either over `palette/` finds nothing
- `prefixScope` turns a leading prefix into a scope chip as it is typed (lines 98-106), and
  `Tab` on a highlighted row scopes to that row's source through `onScopeTo`
  (`ResultsPalette.tsx:15, 82-94`)
- `PaletteTarget` is what a chosen row does, with variants for a project, a layer file, a game
  chunk, an open document, a command and a prefix (`types.ts:44-60`). A `gameChunk` opens a
  preview document of that chunk (`ProjectPalette.tsx:68-75`)
- `PaletteRowData` carries `id`, `source`, `name`, `path`, `trailing`, an optional layer and
  document id, `disabled`, `icon` and `target` (`types.ts:63-85`). A frontend-matched
  `PaletteCandidate` adds `nameLower`, `fullLower`, `keywords` and a 32-bit `mask`
  (`types.ts:95-107`, built by `buildCandidate` at `candidate.ts:7-23`)
- `PaletteCandidates` excludes `"game"` by type "because its rows are ranked in Rust and reach
  the bar already grouped, through `useGameRows`" (`types.ts:109-119`), and `usePaletteSearch`
  special-cases `source.id === "game"` to take the backend's group whole (`usePaletteSearch.ts:57-63`)

The game source is the template for a backend-ranked source. `ProjectPalette` asks for it only
when the scope is null or `"game"` (`ProjectPalette.tsx:31-34`). `useGameRows` reads the
`searchGame` setting (`useGameRows.tsx:20-21`, `stores/workshopLayout.ts:44, 128`), calls
`useGameSearch` with its 120ms debounce (`gameBrowser/useGameSearch.ts:15-33`), which invokes
`api.searchGameIndex` (`src/lib/tauri.ts:271-272`), and dresses each `GameSearchHit` as a
`RankedRow` carrying the backend's own `band` and `score` so the group can be ordered against
the frontend's (`useGameRows.tsx:69-100`). It keeps the last answer on screen while the next is
pending, reports an error, a superseded scan and an unnamed install as rows rather than
vanishing (lines 30-59, 110-128). A `GameSearchHit` carries the hash as hex, the name, the
directory, the archive, a band, a score and the two marked-range lists
(`game_index.rs:86-104`), and `GameSearchResult` adds `total`, `superseded` and `unnamed`
(lines 107-128).

On the Rust side, `search_game_index` (`src-tauri/src/commands/game_index.rs:46-69`) claims a
ticket from the managed `SearchGeneration`, wraps `overtook` in a closure, and runs
`GameIndex::search` inside `with_index` (lines 147-174), which resolves the archives and the
WAD resolver and calls `GameIndexState::get_or_build` on a blocking thread through
`off_thread` (`commands/mod.rs:101-110`, a `spawn_blocking`). The four managed states are
registered at `src-tauri/src/setup.rs:102-106`. The ranking rule is one fixture,
`palette/__tests__/ranking.fixture.json`, read by both `rank.ts` and `matcher.rs`
(`matcher.rs:1-6`, `matcher.ts:1-6`).

One deviation from the plan's own naming: `docs/plans/project-command-bar.md` section 6 places
the scorer in `crates/ltk-manager-core/src/fuzzy.rs` and the frontend hook in `useGameSearch`.
The file is `matcher.rs`, and there is no `fuzzy.rs`. The hook is `useGameSearch` in
`gameBrowser/`, read through `useGameRows` in `palette/`.

### 4.5 The problems pass, which already mounts every bin of a project

The pass is the closest thing in the repository to a whole-install bin scan, and the closest by
a long way. `problems/pass.rs:1-12` describes it: one traversal of a project's files for every
rule, "parses and walks each bin once with every subscribed visitor riding the one walk".

How it reads a bin, end to end:

1. `FileHandle` names one file of one layer and opens it on demand
   (`problems/engine.rs:502-511`). `LayerSource::open` gives a directory layer's file as
   `Opened::File(std::fs::File)` and an archive layer's entry as
   `Opened::Memory(Cursor<Vec<u8>>)`, decompressed whole (lines 309-321, 351-358)
2. `BinSource::open` reads four bytes of magic, seeks back, and either parses a `PTCH` whole
   through `BinOverride::from_reader` or mounts a `PROP` through `BinStream::mount`
   (`problems/pass/source.rs:37-53`)
3. `BinSource::walk` runs `stream.walk(fan)` or `patch.walk(fan)`, where `Fan` is one
   `ltk_meta::walk::Visitor` that drives every subscribed instance through the one walk with a
   bit set per instance and per open scope (`source.rs:63-68`, `fan.rs:20-28, 175-208`)
4. `bin_round` runs `walk_bin` over every bin through `Budget::map` on `files_at_once()`
   workers, each job weighted at the file's size times `BIN_EXPANSION` (`problems/pass/plan.rs:431-476`,
   `budget.rs:33, 137-145, 198-202`). `files_at_once` is the machine's parallelism clamped to 2
   to 8. `walk_bin` logs bytes and elapsed per bin at trace (`plan.rs:479-517`)

`BIN_EXPANSION` is 8, "deliberately generous", sized for the eager reader's expansion
(`budget.rs:28-33`). `docs/design/problems-pass.md:839-841` says a streamed bin's true cost is
"its bytes plus its largest object's buffer" and that `Weight::Bin` keeps the whole-file
expansion "until that cost is measured on a named project". Appendix A of that document
(lines 932-937) records "None taken". So the pass has the parallel, budget-bounded, streaming
shape the index wants and no timing of its own either.

**What pointing it at the install takes.** Three substitutions and one subtraction:

- The enumeration. The pass's `Plan` holds `Vec<FileHandle>` per subject
  (`plan.rs:71-72`). The install's equivalent is `GameArchives::list()` and `for_each_chunk`,
  filtered to bins, folded by hash the way `GameIndex::build` folds (`game_index.rs:290-303`),
  which is what turns 50,390 chunks into 42,306 files (`PROJECT_EDITOR.md:683`). A named chunk
  is a bin by its extension. An unnamed one is a bin by its first four bytes, which the pass's
  `PATCH_MAGIC` sniff (`source.rs:19`) or `BinKind::identify_from_reader` answers
- The open. `FileHandle::open` becomes `WadCache::read_chunk` wrapped in a `Cursor`
  (`game_wads.rs:258-271`, `engine.rs:357`). The pass has this arm already for archive layers
- The read. `entries()` in place of `walk`. The pass materialises nothing either, but a walk
  decodes every object's header where it descends, and the index wants the 8-byte hop and no
  descent. `BinSource::Patch` stays as the `PTCH` fallback, reading `BinOverride::objects`
  eagerly, which is what #210 will make unnecessary
- The subtraction. No rules, no `Fan`, no report. One collector that pushes
  `(path_hash, class_hash, file ordinal)` per entry and the dependency list per file

`InstalledContent` in `problems/game.rs:44-70` shows the same walk done once already for a
different purpose. It indexes "which installed archive holds each chunk" from chunk tables alone
into a `HashMap<WadHash, usize>` with archive names held apart, lazily on first ask, logging the
elapsed time. It reads no chunk body. It is what the design's "Locations" half looks like one
level up, at chunk rather than object granularity.

## 5. The gap list

Ordered as the design's own "What ships in what order" (`PROJECT_EDITOR.md:858-868`) orders
them, with what each waits on. "Exists" means it is in the repository at `f89f50b`.

| Item                                                   | Exists | Where it would go, or where it is                                                     | Waits on                                                          |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A lazy bin read                                        | Yes    | `BinStream::entries`, published in `ltk_meta` 0.8.1 and at the pinned rev             | Nothing                                                           |
| The project's own objects in the content scan (step 1) | No     | `crates/ltk-manager-core/src/workshop/`, which carries no object today                | Nothing                                                           |
| The `@` scope over an open bin (step 1)                | No     | `sources.ts`, and a document that answers for its contents                            | The bin editor's `bin_open`                                       |
| An object arena                                        | No     | A sibling of `GameIndex` in `crates/ltk-manager-core/src/`                            | Nothing                                                           |
| The build over the install (step 3)                    | No     | `GameArchives` walk, `WadCache::read_chunk`, `BinStream::entries`, `Budget::map`      | Nothing                                                           |
| A bin-or-not test for an unnamed chunk                 | Partly | The pass's magic sniff, or `BinKind::identify_from_reader`                            | Nothing                                                           |
| The dependency edges                                   | No     | Read from `BinStream::dependencies()`, hashed as a WAD path, looked up in `GameIndex` | Nothing                                                           |
| A disk cache for the arena (step 3)                    | No     | The design's mmap section does not exist for the game index either                    | The one-cache work, or a MessagePack file beside `game_index.bin` |
| Per-archive invalidation                               | No     | `Wad::checksum()` exists in `ltk_wad` 0.5.4                                           | Nothing upstream                                                  |
| `bin_tables()`                                         | Yes    | `hashtables.rs:573`, since 2026-08-23                                                 | -                                                                 |
| A name list with masks                                 | No     | `HashDb::iter` over `binentries`, as `string_keys` does at `hashtables.rs:592`        | Nothing                                                           |
| A search command                                       | No     | Beside `search_game_index`, on `off_thread`, with its own generation                  | Nothing                                                           |
| A palette source and the `$` scope (step 4)            | No     | `PaletteSourceId`, `PALETTE_SOURCES`, `PaletteTarget`, a hook like `useGameRows`      | Nothing                                                           |
| An Objects setting                                     | No     | `workshopLayout.ts` beside `searchGame`                                               | Nothing                                                           |
| A `PTCH` stream                                        | No     | Upstream, #210                                                                        | #192's child #210. Eager fallback exists                          |
| A row action that opens the object                     | No     | The bin editor. Until then, the declaring chunk's preview or reveal                   | `BIN_EDITOR.md` stage 1                                           |
| The object pickers for #190 and #191                   | No     | The declarative data documents, not yet designed                                      | The declarative types                                             |

What has to land upstream first: nothing, for the install's half. #210 removes a fallback the
pass already carries. PR 227 is what the workspace is pinned to for the pass, and moving the pin
to a release is a housekeeping item on the same `Cargo.toml` comment, not a precondition of the
index. #219 and #225 are the walk's, not the index's.

## 6. Memory and time, derived

Every figure here is arithmetic over a cited measurement. None was measured for this note.

**The arena.** `ObjectEntry` is `u32 + u32 + u64 + u32`, 20 bytes at align 8, so 24 bytes a row
if a `BinToc` were persisted as the crate hands it out. 383,357 declarations
(`PROJECT_EDITOR.md:688`) x 24 is 9.2MB. Packed as the design's `(object hash, class hash, file)`
at 12 bytes (line 544) it is 4.6MB, the doc's own figure (line 695). The declaring-file ordinal
fits a `u32` against 42,306 files, and a `u16` against the 456 archives if the row names the
archive rather than the file. The offsets and sizes in `ObjectEntry` are what a later
"open this object" call would seek by, and the design's index does not keep them, so 12 bytes is
the floor and 24 the ceiling.

**The names.** 325,357 named objects (line 690) resolving to 21.1MB of text plus 10 bytes of
offsets each (lines 800-801) is 24.4MB, the design's "25MB, resident while the palette is used"
(line 812). One `u32` letter mask per name, as `File.mask` is (`game_index.rs:266`), adds 1.3MB.
Resolving every hash at load measured 200ms (line 696) against the mapped table, and
`HashDb::get_batch` resolves "in arena order so each frame decompresses at most once"
(`reader.rs:486-489`), which is the call that number was presumably taken over. Nothing says.

**The edges.** 121,665 at 8 bytes is 0.9MB (line 736), stored twice for both directions
(line 761), 1.9MB.

**The build, on the eager reader.** The design's 760ms over a 194.8MB sample (line 621) is
256MB/s. The install's bins are 2,261MB decompressed (line 684), so a full eager parse is 8.8s
at that rate and 15.7s at the 144MB/s `Cargo.toml:6` records. Either sits on top of the
decompression the build already pays: 4.7s cold, 1.3s warm (lines 685-686).

**The build, on the stream.** The parse term collapses to one 8-byte read per object over an
in-memory cursor, which for 383,357 objects is 383,357 short seeks plus a `mount` per file that
reads the header, dependency strings and class table. Upstream calls the per-object walk
"microseconds" (`lib.rs:185-186`), and the sweep does less than the walk. At one microsecond an
object that is 0.4s. The design's own header-scan reading of 3.1ms on the sample, or 14ms on the
whole (section 1.4 records that these do not reconcile), says it is smaller than that. Either
way the build is the decompression, and the design's sentence "The build is decompression and
nothing else" (line 698) becomes true of a streaming build rather than of the eager one it was
written above.

**What the pass would charge it.** `Weight::Bin` reserves `size x 8` per bin (`budget.rs:33`),
so a 512MB `REPAIR_BUDGET` (line 18) admits 64MB of bin at once. A 2MB `Aatrox.bin`-sized chunk
reserves 16MB under that rule and holds 2MB plus one object under the stream. A build over the
install run through the same `Budget::map` would be throttled by an estimate the pass's own
design calls unmeasured (`problems-pass.md:839-841`). The index wants a weight of the chunk's
decompressed size and no multiple.

**The three files that will not scan** (line 694) are three of 42,306. The design does not name
them or the error, and the upstream corpus of 2026-09-01 reports zero chunks where the stream and
the eager reader disagree (`bin-streaming.md:921-923`), so the three either predate a fix, are
`PTCH` files the corpus counts apart, or are on the older install. Skipping and logging them is
the right behaviour whichever it is, and the design already says so (lines 701-704).

## 7. Open questions

Questions the sources leave open. None is answered here.

| Question                                                                                                                       | What the sources say                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the object index build inside `GameIndex::build`, or as a second pass over the same archives?                             | The design wants "no extra pass" for the search structure (line 465) and a separate Objects switch (line 829). Both cannot hold. Two passes decompress every bin chunk twice |
| Is the index keyed by declaring file or by declaring archive?                                                                  | The row shows "`Aatrox.wad/…/skin0.bin`" (line 506), both. The 12-byte row holds one `u32` for "file" (line 544)                                                             |
| Which of the design's two header-scan figures, 3.1ms on the sample or 14ms on the whole, is the reading?                       | Section 1.4. They differ by 2.6x after scaling                                                                                                                               |
| Which three files fail to scan, and on what error?                                                                             | Unrecorded (line 694). The upstream corpus finds no disagreement (`bin-streaming.md:921-923`)                                                                                |
| Does the build run through the pass's `Budget`, or beside it like `GameIndex::build`?                                          | Neither design says. The budget's weight rule is wrong for a stream by its own admission (`problems-pass.md:839-841`)                                                        |
| Where is the cache, given that the mmap cache the design places it in does not exist?                                          | `PROJECT_EDITOR.md:707` places it in a section of "One cache, not two". That cache is "In progress" and in memory only (line 77, lines 2506-2508)                            |
| Does the arena persist `ObjectEntry` whole, keeping offsets for a later `object()` call, or the 12-byte row?                   | S6 says the manager "wants to persist" the TOC (`bin-streaming.md:890`). The design keeps 12 bytes (line 544)                                                                |
| Does step 1, the project's objects, still ship first now that the install's reader exists?                                     | The order was argued from the reader (lines 571-575). The argument no longer holds, and the project half is still the one a modder "asks for most" (line 868)                |
| What does `Enter` on an object row open before the bin editor exists?                                                          | "Revealing the file in its explorer" (line 519). A game chunk has no explorer row to reveal today. `gameChunk` opens a preview, and `BinPreview` offers VS Code              |
| Does `usePaletteSearch`'s `"game"` special case generalise to a second backend-ranked source, or does each get its own branch? | `usePaletteSearch.ts:57-63` and `types.ts:117-119` hard-code the one id                                                                                                      |
| Does a query of eight hex digits still bypass the matcher when the arena is keyed by `u32`?                                    | The design says yes (lines 523-525). `Query::parse` has no hex branch (`matcher.rs:51`)                                                                                      |

## 8. Verdict

**Yes, the manager can build the index and search it from the bar, and nothing upstream stands
in the way.** The design's one blocker was a lazy read that yields each object's path hash and
class hash without parsing a property. That read is `BinStream::entries` at the pinned rev, it
is in the published 0.8.1 crate, and `problems/pass/source.rs` has mounted every bin of a
project through the same handle since 2026-09-03. The feature status row that holds the index
**Blocked**, the sentence that says the read does not exist, the answered question that says
`ltk_meta` blocks it, and `BIN_EDITOR.md`'s "Nothing in the manager opens them yet" about the
four tables are all stale, and each has a line number in this note.

**What has to land upstream: nothing the install's half needs.** Issue 192 says `PROP` reading
is complete. #210's `PTCH` stream would remove the eager fallback the pass already carries. PR
227 is the walk, pinned for the pass and stalled on a review whose one request the branch's
third commit already answers. Moving the pin to a release is the `Cargo.toml` comment's own
instruction and touches the index only in that the index should not depend on the walk.

**What has to be built here: all of the index.** An arena of `(path hash, class hash, file)` at
12 to 24 bytes a row, 4.6MB to 9.2MB. A build that enumerates archives through `GameArchives`,
folds by hash as `GameIndex::build` does, decompresses each bin chunk through `WadCache`,
mounts it, sweeps `entries()`, and reads `dependencies()` on the way past, on the pass's
`Budget::map` shape with a weight that is the chunk's size and no multiple. A name list over
`binentries` through `HashDb::iter` with a letter mask per name, 25MB resident while the bar is
open. A command beside `search_game_index` with its own generation. A `PaletteSourceId`, a
`PALETTE_SOURCES` row with `$`, a `PaletteTarget` for an object, and a hook shaped like
`useGameRows`. An Objects switch beside `searchGame`. A cache, which has nowhere to go until the
one-cache work lands or a MessagePack file is accepted beside `game_index.bin`.

**The measurements are real and should be re-taken.** Every number is from one commit on
2026-08-20 on an install that is not the current one, two of them do not reconcile, and the parse
rate has a second reading in `Cargo.toml` at little over half the first. The streaming build
changes the term those numbers were about. The first build over a live install should log its
own row the way `walk_bin` and `InstalledContent::index` already log theirs, and the design's
table should be rewritten from that log.

## 9. What follows

In order, each on its own change:

1. Correct the two design documents. `PROJECT_EDITOR.md` line 97 to **Planned**, lines 629-656
   to say the read exists as `BinStream::entries` and to replace the sketched `Bin::scan` with
   the real signatures of section 3.1, the answered-questions row at line 2869, and step 2 of
   the order table at line 864. `BIN_EDITOR.md` lines 97, 358 and 636. A changes-table row on
   each, dated, and a citation back to this note. Nothing else moves until the documents agree
   with the code
2. Decide the two open questions the build cannot start without: one pass or two over the
   archives, and where the cache lives. The first is a decision between decompressing every bin
   chunk twice and coupling the Objects switch to the game index. The second is between waiting
   on the one-cache work and a second MessagePack file
3. Build the arena and the build, logged, with no search and no palette, behind the setting.
   Take the row of measurements the design owes, on the current install, and rewrite section
   "The build, measured" from it. This is where the 14ms-or-36ms question answers itself
4. The name list and the command, with the ranking fixture extended for object paths, where a
   `/` segment takes the band a file name takes (`PROJECT_EDITOR.md:815-817`)
5. The palette source and the `$` scope, on the `useGameRows` pattern, with the same three
   notice rows for an error, a superseded scan and an empty name table
6. Revisit step 1, the project's own objects, as a separate decision. Its argument from the
   reader is gone. Its argument from what a modder asks for is not, and the content scan carries
   no object today

The `PTCH` stream, the walk's release, and the object pickers for #190 and #191 follow on their
own schedules and block none of the six.

## 10. Decisions

Taken on 2026-09-05, after the documents were corrected. Each was put as a choice with the
recommendation marked, and each was taken as recommended.

| Question    | Decision                                                                                           | Why                                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The build   | Its own build, fed by the built game index, behind the Objects switch                              | The game index build reads chunk tables alone and stays at 1.3s for everyone. The object build inherits the fold and the archive ordinals, and no TOC is walked twice |
| The cache   | None in the first cut. Build per session, and log one row                                          | Every cache figure is from 2026-08-20 on the eager reader. The first live streaming build measures itself, and the cache is decided from that line                    |
| The row     | 16 bytes: object hash, class hash, and the declaring chunk's `WadHash`                             | Stable across a game index rebuild, and resolves to a name and an archive through it. 6.1MB                                                                           |
| The order   | The install's half first, the project's second                                                     | The reader argument for the project half is gone, the install's half needs nothing from the content scan, and it is the index the ask names                           |
| `Enter`     | Opens the declaring chunk as a preview, `Ctrl+Enter` beside. The target carries the object hash    | The `gameChunk` target exists, and the bin editor takes the hash when it lands with no palette change                                                                 |
| `PTCH`      | Read eagerly through `BinOverride::from_reader`. Added objects are rows, and patch records are not | The fallback the problems pass carries. A patch record overwrites a property and declares nothing                                                                     |
| The trigger | Warm at startup after the game index, with the switch on                                           | The switch is the consent, and a first `$` keystroke is the worst place for five seconds of zstd                                                                      |
| The edges   | Deferred until #190 asks                                                                           | Nothing is on disk, so adding them with the first reader migrates nothing                                                                                             |

Two more fell out of the first without a question. The build runs beside the problems pass's
`Budget` rather than through it, on `files_at_once` workers with no weight rule, because the
weight rule is sized for the eager reader by its own admission. And the palette's `"game"`
special case in `usePaletteSearch` becomes a flag on the source rather than a second hard-coded
id, because the object source is the second backend-ranked one.

Section 9 reads accordingly: step 2 is answered, step 3 carries the row and the trigger above,
and step 6 comes last rather than being revisited.

### The branches under them

The grilling that followed the eight decisions worked the tree in four rounds on the same day,
each question put with its recommendation marked. Three picks went against the recommendation
and say so.

| Question                     | Decision                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Which chunks the build reads | Named `.bin` chunks, and every unnamed chunk sniffed by a prefix decode and `LeagueFileKind::identify_from_bytes`. Against the recommendation of named chunks only |
| Who triggers the warm        | A `searchObjects` switch beside `searchGame` in the frontend store, off by default, and a warm command the workshop invokes on mount                               |
| The switch and Rebuild       | On builds now, off drops. Rebuild clears the game index, `WadCache` and the object index, and warms both while the switch is on                                    |
| Where the index lives        | Its own managed state, with absent, building, ready and failed slots                                                                                               |
| The name list                | Resolved at warm and resident. A hashtable sync re-resolves the names and leaves the rows alone                                                                    |
| What a query matches         | The object path, and a `class:` term that filters by class-name prefix or hex before the path matches. Against the recommendation of the path only                 |
| An ambiguous `class:` term   | Class rows with counts as completions, and Tab accepts                                                                                                             |
| Several declaring files      | One row per declaration, told apart by the source column. Against the recommendation of one row with a count                                                       |
| Unscoped queries             | Object rows appear as a group with a low cap, and the full cap under `$`                                                                                           |
| Tests                        | A synthetic `WadBuilder` archive through the real build, and object-path cases in the shared ranking fixture                                                       |
| The project half's reader    | `BinStream::entries` with the patch fallback, the same as the install's                                                                                            |
| Workers                      | One job per archive in ordinal order, each mounting its archive itself, on `files_at_once` workers, rows concatenated in archive order                             |

Settled without a question: a generation counter of the object search's own, a backend-ranked
flag on the palette source in place of the `"game"` special case, the `class` key read by the
objects source wherever it runs, a row id of object and file, ties between declarations broken
on archive order and then on path, a build ticket that drops a result arriving after a Rebuild
or a switch-off, no progress events, and one `info` line per build.

### The tickets

Published on 2026-09-05 as sub-issues of ltk-manager #394, with GitHub's own blocked-by edges.

| Issue | Title                                 | Blocked by |
| ----- | ------------------------------------- | ---------- |
| #395  | Backend-ranked palette source flag    | -          |
| #396  | Bin object search over the install    | #395       |
| #397  | Unnamed chunks in the object index    | #396       |
| #398  | `class:` filter for object rows       | #396       |
| #399  | Project objects and the override line | #396       |
| #400  | Measured object build row             | #396, #397 |

#396 is the tracer bullet, and it carries the switch, the warm and the lifecycle with the
search, because a build that runs without consent was not worth a ticket of its own.
