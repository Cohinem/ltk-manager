# Plan: shipping the rules that catch crashes

Status: Complete
Created: 2026-08-30
Scope: `specs/013-mod-defect-rules`, issues 001, 002, 004, 005, 011, 012

Every stage of this plan shipped. The rules written after it - `bin/resolver-key-loss` and
`audio/bank-id` - are issues 007 and 013, and each carries its own decisions. Three issues got no
rule and say why on their own files: `013-008`, `013-009` and `013-010` all describe archive states
the overlay build is the right place to guarantee, over what the build itself wrote, rather than
states a per-mod check should raise a row about. All three reach a user as a crash if they ever
happen, and none of them happened once across the measured corpus.

One thing this plan states is no longer true of the code, deliberately: `GameContent` has a second
method, because comparing a mod's bin against the game's copy needs its bytes (see `013-007`).

## 1. What this plan is

Six issues stand between the spec and a release. Reading them as six pieces of work is the wrong
frame. They are **three modules behind three seams**, and two of the three seams already exist.

| Issue     | What it is            | Seam                                       |
| --------- | --------------------- | ------------------------------------------ |
| `013-002` | file handle           | `ProjectFiles` / `LayerSource` — exists    |
| `013-001` | chunk info            | the same seam, one type widened            |
| `013-005` | `tex/block-alignment` | a rule. No new seam                        |
| `013-004` | `audio/bank-version`  | a rule. No new seam                        |
| `013-012` | repair by removal     | `FixRun` — exists, plus the game — **new** |
| `013-011` | basis bump            | none. Already satisfied, wants a test      |

The single most useful thing to say before any code is written: **the first release adds no seam at
all.** Both crash rules are a predicate over a header, and the widening they need is to a seam that
already exists. The one new seam belongs to the repair that follows them.

## 2. The seam that exists and is half-built

### The asymmetry to fix

`ProjectFiles` hands out two accessors, and they are not the same depth.

- `bins()` yields a handle. `BinHandle::read` hides which layer source is underneath, the zip
  reopen, the inflate cache, and the parse. Deep.
- `by_kind()` yields `(&LayerFiles, &ProjectFile)`. Shallow, and worse than shallow.

The second is worse because its capability is **asymmetric across the layer sources**.
`LayerFiles::absolute` returns a path for a directory layer and `None` for an archive, and
`LayerSource::read` is private, so a rule written against `by_kind` reads files on a project mod and
silently reports nothing on an archive mod. That is the exact failure the seam exists to prevent,
offered as a public accessor. It is used in one place today, which is `bins()` itself.

### The shape

One handle, over every file:

```rust
pub struct FileHandle<'a> { layer: &'a LayerFiles, file: &'a ProjectFile }

impl<'a> FileHandle<'a> {
    pub fn layer(&self) -> &'a str;
    pub fn path(&self) -> &'a str;
    pub fn kind(&self) -> WorkshopFileKind;
    pub fn size_bytes(&self) -> u64;
    pub fn chunk(&self) -> Option<&'a ChunkInfo>;
    pub fn absolute(&self) -> Option<PathBuf>;

    pub fn head(&self, limit: usize) -> Result<Vec<u8>, String>;
    pub fn bytes(&self) -> Result<Vec<u8>, String>;
    pub fn bin(&self) -> Result<ltk_meta::Bin, String>;
}

impl ProjectFiles {
    pub fn files(&self) -> impl Iterator<Item = FileHandle<'_>>;
    pub fn of_kind(&self, kind: WorkshopFileKind) -> impl Iterator<Item = FileHandle<'_>>;
    pub fn bins(&self) -> impl Iterator<Item = FileHandle<'_>>;
}
```

`BinHandle` becomes `FileHandle` — it is already exactly this struct — and `BinHandle::read` becomes
`FileHandle::bin`. That frees `read` to mean bytes, which is what it means everywhere else in the
crate, and it renames the one thing in the interface whose name lied: a method returning a parsed
`Bin` was never a read. `by_kind` goes, and with it the asymmetric pair.

The migration is small and contained. `by_kind` has one caller and one test, `BinHandle` has one
rule and the re-export.

### Where the depth is

`head(n)` is two words hiding three implementations:

| Layer source          | What `head(n)` is                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory             | open, `take(n)`, read to end                                                                                                                                         |
| Archive, stored WAD   | reopen the zip, mount the WAD where it lies, `load_chunk_raw_prefix`, `decompress_chunk_prefix`, and escalate the raw limit when the first block came back cut short |
| Archive, deflated WAD | the same, over the bytes inflated once at scan time                                                                                                                  |

That escalation is written today, privately, inside `sniffed_kind` in `problems/engine/archive.rs`.
Both rules of the first release want the same first bytes of the same chunks, and writing that loop
a second time is how the two copies drift.

One subtlety, because it decides where the shared code goes. `sniffed_kind` runs **during the
scan**, with a `Wad` already mounted and being walked, and `head` runs **after**, from a rule, and
has to remount. So they cannot share `LayerSource::head` — they share the level below it, a free
function over an already-mounted wad and chunk. `ArchiveFiles::head` remounts and calls it, and the
scan calls it directly with the wad it is holding.

The internal seam this adds is one method: `LayerSource::head(&self, file, limit)`, beside the
existing `LayerSource::read`. Everything above it is written once and reads both sources, which is
what the seam has always promised.

### Chunk info

`ProjectFile.chunk` becomes the whole record rather than the hash alone:

```rust
pub struct ChunkInfo {
    pub hash: WadHash,
    pub compression: WadChunkCompression,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
    pub checksum: u64,
}
```

**One `Option`, not two.** A `chunk: Option<WadHash>` beside an `info: Option<ChunkInfo>` is two
fields that must always agree and an interface that cannot make them, and the hash is a fact about
the chunk like the rest of them. Every field is on `ltk_wad`'s `WadChunk`, which `scan_wad` already
holds while it builds the file list, so "costs nothing beyond the table of contents" is satisfied by
construction rather than by care.

Three sites read `.chunk` today, all inside `problems/engine/`.

## 3. The one new seam: the installed game as content

Needed by `013-012` and by `015`, and **not** by either rule of the first release. See section 5.

### Why there is no way to do this today

`ProjectFiles` carries three facts about the world outside the mod: `build` — one version string
from one JSON file — `names`, and `budget`. None of them reaches a byte of the installed game.

`013-012` needs to know whether the game holds a path, and every issue in
`015-game-as-parts-source` needs more of the same.

`GameIndex` reaches the chunks and is the wrong adapter for this. It is a browser index: a directory
arena keyed by name, built for `read_dir` and `search`, with no membership query by hash, built in
seconds and cached in `GameIndexState` for the content browser. Asking it "does the install hold
this hash" means walking the arena.

### The interface

One method:

```rust
pub trait GameContent: Send + Sync {
    /// Whether an archive of the install holds this chunk.
    fn holds(&self, path: WadHash) -> bool;
}
```

It answers the second column of `013-012`'s truth table, and nothing else asks it anything yet.
`ProjectFiles` gains `game(&self) -> Option<&dyn GameContent>` beside `build()`, and the `None` is
what makes `013-012` offer no removal on a machine with no install — which is the honest answer,
since the question its guard asks is about the install.

A draft of this plan gave the trait a `head(path, limit)` as well, for `013-004` to read the game's
own bank version through. Section 7 records why that came out, and the version it leaves is the
better one: **a one-method trait with one caller.**

`015` will want to read bytes and object tables through this. None of that is added now.

### Two adapters, so the seam is real

- **The install**, over `GameArchives`. `WadCache` already exists for exactly this shape: mount
  once, read chunks many times.
- **A fake**, because a unit test cannot depend on a League install, and the spec requires every
  rule tested through the analysis entry point.

The fake is not a concession to testing. It is the second adapter that makes this a seam rather than
a layer.

### Accept it, do not create it

`ProjectFiles::read` builds `build` and `names` from `Config` itself, and following that pattern
here would build a hash index **per mod**. A sweep runs `SWEEP_MODS_AT_ONCE` mods at a time over a
whole library, and an archive-TOC walk costs seconds, so the pattern has to break here:

**`ProjectFiles` takes the adapter, it does not construct one.** That touches `read`, `within`,
`in_archive`, `analyze`, `analyze_within`, `analyze_archive` and their callers, which is the honest
cost of the decision. It buys one index shared across a sweep, and a fake that is one struct.

Build the index lazily on the first `holds`, so a run whose mod ships no bank pays nothing.

### The shortcut to refuse

An implementer will reach for the hashtables, because they are already in memory and they already
answer "is this a known game path". They answer a different question. Mimir's tables are a superset
across patches, so a path Riot removed two patches ago is **known and not held**. Being wrong in
that direction means deleting a bank whose backing is gone, which is the crash `013-012` exists to
avoid. The guard asks the install.

## 4. The seam that is write-shaped

### What is missing

`FixRun` is `read`, `write`, `skipped`, `left`, `kept_names`, `finish`. Every one of them is
write-shaped, and `FileOutcome { layer, path, applied, skipped }` records **counts** rather than
what happened. Two additions:

```rust
pub enum FileChange { Written, Removed }

pub fn remove(&mut self, layer: &str, path: &str, applied: u32) -> Result<(), FixError>;
```

`FileChange` rather than a `removed: bool`, per C-CUSTOM-TYPE. `FixRun::remove` resolves through the
same `resolve` that `write` does, so a removal cannot escape its layer either.

### The correction: this is not blocked upstream

`013-012` records that a removal must not be built without `ArchiveDelta::remove` upstream, because
it would work on a tree-stored mod and silently do nothing to an archive-stored one. **That is not
what the code does.**

`write_repaired` in `mods/archive/repair.rs` already falls back. When `RepairEdit::read` or
`edit.apply` returns an error it logs and calls `repack`, and `repack` loads the mod project **from
staging** and packs the staging tree. A file the fix run deleted from staging is not in that tree,
so it is not in the repacked archive. The fallback is real, already wired, and already exercised —
it is what answers an archive shipping its WADs as loose files.

So the third change is one `match` arm: **`RepairEdit::read` refuses a report carrying a `Removed`
outcome.** An archive-storage mod is then repaired correctly through a path that already exists.

Two things to be honest about. A repack re-encodes every chunk, so removing a 40 KB bank from a
400 MB mod rewrites 400 MB — acceptable for a repair a user pressed, and not acceptable as the
permanent answer. And a repack re-compresses bytes the repair did not address, which is already the
accepted behaviour for an archive `ltk_fantome` will not edit, and is a change of stored form rather
than of content, so ADR-0011 is not engaged.

`ArchiveDelta::remove` upstream turns that repack into a chunk-level edit. It is a **performance
improvement, not a correctness prerequisite**, and `013-012` should be rewritten to say so.

## 5. Order

**Stage 0 — the seam, no user-visible change.**

- `013-011`: verify and close. `HealthCheckBasis.manager` carries the manager version and
  `due_for_check` re-checks on any basis difference, so the mechanism is already correct. What is
  missing is a test pinning it, because the equivalent gap shipped once before.
- `013-001` and `013-002`, independent of each other. `013-001` is three call sites and a type.
  `013-002` is the `head` plumbing and the rename.

**Stage 1 — the release, two rules together.**

- `013-005` `tex/block-alignment`. Needs Stage 0 and nothing else. `ltk_texture` is already a
  workspace dependency. The only confirmed crash in the spec and the only rule that repairs.
- `013-004` `audio/bank-version`. Needs Stage 0 and nothing else either, once its bound is two
  constants rather than a read of the install — section 7.

They ship in one release, as the spec's Order of Work already has them. **Neither needs a new
seam**, which is what makes the first release a widening of `ProjectFiles` and two rules behind it.

**Stage 2 — removal, and the game seam that goes with it.**

- The `GameContent` seam of section 3, which `013-012` is the only caller of.
- `FixRun::remove`, `FileChange`, the `RepairEdit` refusal, and `013-012`. Ships without waiting for
  upstream, at the cost of a repack.

**Stage 3 — upstream, and it can start at any time.**

- `ArchiveDelta::remove` in `league-mod`, a release, and a dependency bump. Turns Stage 2's repack
  into an edit. Publish before bumping.

## 6. Testing

The seam is the test surface, and the spec already says how: run the analysis entry point over a
fixture and assert on the findings, never reach inside a rule.

- **Every rule through both layer sources.** The same fixture as a directory and as an archive must
  produce the same findings. This is the property most worth locking down, because it is what the
  seam exists to guarantee and it is exactly what the old `by_kind` would have broken silently.
- **`head` against a short file.** A file shorter than the bound returns what there is rather than
  failing, on both sources.
- **`head` against a chunk whose first block was cut short**, which is the escalation path and the
  only branch in the plumbing with real logic in it.
- **The game seam through the fake**, at three states: holds the path, does not hold it, and no
  install at all. Each is a different row of `013-012`'s guard.
- **`013-011` as one test**: a stored verdict under a different manager version is due again.
- **A removal end to end on an archive-storage mod**, asserting the bank is gone from the archive
  afterwards. Stage 2 is the first repair that deletes, and the repack fallback is the path it
  takes, so testing the tree case alone would prove the wrong thing.

## 7. The bank version bound, and why it is not read from the install

The bound is two constants: the legacy floor, and the version the reader accepts as current at the
time of writing. No probe, no scan, and no read of the install.

A probe is what the earlier draft wanted, and it is not worth what it costs. The game ships current
banks alongside 836 legacy media-only ones, so a small sample can come back all legacy and the
answer would be wrong. Making it right means scanning until a current bank turns up, which is
seconds of archive walking to learn a number that changes twice a year.

**The predicate is one-sided, which is what makes a stale constant safe.** A hardcoded ceiling read
naively would report every bank above it, so the release after Riot bumps the version would call
every newly-authored bank defective — a false positive on a health check, which is the failure the
whole spec exists to avoid. So the rule judges only downwards:

- Below the floor: report. The floor is a property of the reader and does not move.
- Between the floor and the known-current, carrying more than media: report. This is the whole of
  the measured class — 17 banks across 7 archives — and it stays true whatever Riot does next,
  because a bank at an old version does not become valid later.
- At or above the known-current: **report nothing.**

A stale constant therefore produces silence rather than noise, and the fix for the silence is a
one-line bump.

Three consequences, two of which reverse an earlier decision and are worth reading as reversals:

- **`013-004` no longer touches the installed game**, so the first release adds no seam at all.
- **The rule is never dormant.** Dormancy existed because the bound came from the install. It does
  not, so the check runs for a modder with no game installed, which is strictly better.
- **A bank authored against a newer Wwise than the player's game goes unreported.** Catching that
  needs the player's own current version, which is the read being declined. Recorded as bought,
  rather than missed.

## 8. Open questions

**Whether `013-005` needs `ltk_texture` 0.6.1.** 0.6.0 is pinned and 0.6.1 adds
`available_mip_count` only. Bump if the resample wants it.

## 9. What this plan does not change

- No new finding shape and no new panel. Every rule here produces the existing `Problem` and the
  existing surfaces draw it unchanged.
- No second parser. Both new rules read a header.
- No change to what a rule is. The `Rule` trait takes `&ProjectFiles` and `&mut Report` and keeps
  taking them.
- No repair that reads the installed game for **parts**. The seam in section 3 reads it to compare
  against, which is what the manager already does. Pulling parts out of it is `015`, and it is a
  decision to record before it is code.
