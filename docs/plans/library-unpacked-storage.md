# Store library mods as unpacked mod projects under slug directories

Implementation plan for [#348](https://github.com/LeagueToolkit/ltk-manager/issues/348).

> **Superseded in part by ADR-0002, ADR-0003 and ADR-0004.** The `.ltk/` directory and
> `identity.json` are gone — the mod entry in `library.json` is the only record, and the archive
> sits beside the mod at `mods/<slug>.<ext>`. The layout migration moves files rather than
> converting them, and runs unasked rather than behind a modal, so the free-space gate, the
> long-path gate and the inline keep-archives switch described below never shipped. Converting a
> mod is a per-mod choice from its card instead. Read the ADRs for what was built.

## Context

A library mod today is `<storage>/archives/<uuid>.fantome` plus `<storage>/mods/<uuid>/` holding
only `mod.config.json` and a thumbnail. Nothing on disk names the mod, Reveal in Explorer opens a
near-empty folder, content exists only inside the zip, and `library.json` is the sole record
mapping archives to mods. Issue #348 moves each mod to an unpacked, self-describing mod-project
directory named by a slug — the layout the Creator Workshop already uses and `ltk_overlay`'s
`FsModContent` already reads.

**No dependency work is needed.** The upstream prerequisites (league-mod PRs #192 and #194) are
published and already pinned in `Cargo.toml`: `ltk_mod_project` 0.7.0 (`FantomeImporter` with
`with_path_resolver`, RAW → `content/base/raw`), `ltk_overlay` 0.7.0 (`FsModContent` with opt-in
`.with_raw_overrides()`), `ltk_fantome` 0.8.0, and `ltk_wad` 0.5.2.

### Decisions

- Fantome mods unpack to FS projects. **Modpkg mods stay packed** behind `ModpkgContent`. Modpkg
  streams well, and fantome does not. A future _sanitized .fantome_ storage mode (repacked,
  well-formed archive streamed by `FantomeContent`) is a follow-up, blocked upstream by the
  fantome packer dropping RAW files. The model reserves room for a storage mode, but this PR
  ships FS-unpacked as the only fantome mode. → **ADR 0001**.
- Scope: core only. Follow-up issues to file: Export action; library disk-usage display (also a
  "reclaim retained archives" action); rework the cslol migration into the library's import
  dropdown (import a classic `/installed` dir); sanitized-fantome storage mode; removal of
  legacy-layout scaffolding one release later; richer retry UX for failed conversions. The
  workshop's fantome import collapsed onto `FantomeImporter` in this branch rather than as a
  follow-up, so it is no longer on this list.
- Migration is a **blocking UI flow**, one pass, and every legacy mod leaves the uuid layout. The
  modal asks for **one informed click** before acting: it states what will happen and the
  library's size, offers the keep-archives toggle inline, and runs two preflights — free disk
  space, and Windows long paths (see below). Per mod: full byte-equivalence verify,
  **sequential**. The old layout is deleted only after its mod verifies.
- A mod that fails to convert is NOT scrubbed. Its entry stays in the index in a **visible
  failed state** (`fault: Option<ModFault>`), greyed out in the library UI with the error and
  excluded from overlay builds, while its original files are parked in `quarantine/<uuid>/`. The
  shape is designed to grow into the autofix feature (scanned imports flagged with issues).
- Identity stays UUID everywhere. The slug is only the directory name, derived from project
  `name` (not `display_name`), assigned once, with a numeric suffix on collision or Windows
  reserved device name.
- Provider selection derives from **layout** (packed modpkg vs unpacked project), never from
  provenance. `format` keeps meaning source-archive format, and a discovered foreign dir records
  source `Unknown`.
- New setting `retain_mod_archives` (default on) applies at install/migration time only, and
  existing retained archives are never deleted by toggling it off (the description says so).
  Modpkg archives are always kept — they are the provider source, exempt from the setting.
- Long paths: **preflight and push the user to enable them.** When long paths are disabled and
  any would-be content path exceeds 260 chars, fail fast with an actionable error (the existing
  `diagnostics/windows.rs` `check_long_paths_enabled` answers the registry question). The
  migration modal gates on this and guides the user to enable long paths rather than starting a
  run that will strand mods in the failed state. No `\\?\` writing in this scope.
- Naming: _layout migration_ (this), _schema migration_ (library.json versions), and the cslol
  _import_ stay distinct terms, with no cslol renames in this PR. The private dir is **`.ltk/`**.
- `docs/agents/domain.md` promises a root `CONTEXT.md` + `docs/adr/` that do not exist yet.
  Create both in this PR (glossary + ADR 0001, see phase 10).

## Target on-disk layout

```
<storage>/
  library.json                    schema v2
  archives/                       drop folder only
  quarantine/<uuid>/              failed conversions: old metadata dir + archive + quarantine.json
  mods/
    .staging-<uuid>/              in-flight install/migration (swept)
    <slug>/
      mod.config.json
      content/<layer>/<Wad.wad.client>/...    fantome only; content/base/raw/ for RAW
      README.md, LICENSE*, thumbnail.webp|png
      .ltk/
        identity.json             { schemaVersion: 1, id, installedAt, sourceFormat, storage }
        archive.fantome           retained original (setting; fantome only optional)
        archive.modpkg            ALWAYS present for modpkg — it is the provider source
```

`.ltk/` is invisible to `FsModContent` (it walks only `content/` + config), so fingerprints and
reads are unaffected. `identity.json.storage` is `"project"` for everything this PR writes — the
reserved slot for the future sanitized-fantome mode. `sourceFormat` is
`"fantome" | "modpkg" | "unknown"` (unknown = discovered foreign project dir).

## Phases

All backend work in `crates/ltk-manager-core/src/mods/` unless noted. New test suites are sibling
`tests.rs` files (`#[cfg(test)] mod tests;` last item). TDD at the `ModLibrary` seam: a shared
`make_test_library(storage)` constructor (NullEventSink + default `WadPathResolverState` + temp
storage) joins `test_support.rs`.

### 1. `ModSlug` (new `mods/slug.rs` + `slug/tests.rs`)

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub(crate) struct ModSlug(String);
impl ModSlug {
    pub(crate) fn assign(name: &str, taken: &TakenSlugs) -> ModSlug;  // slugify, "" -> "mod", suffix -2, -3… while reserved/taken
    pub(crate) fn as_str(&self) -> &str;
}
pub(crate) struct TakenSlugs(HashSet<String>);   // index slugs + every dir under mods/
impl TakenSlugs { fn collect(index: &LibraryIndex, mods_dir: &Path) -> Self; fn insert(&mut self, &ModSlug); }
```

Reserved names (case-insensitive on the base slug): `con prn aux nul com1-9 lpt1-9`.
`slug::slugify` output is `[a-z0-9-]`, so no other Windows sanitization is needed.

### 2. Schema v2 + entry paths (`index/document.rs`, `index/schema_migration.rs`)

`LibraryModEntry` gains:

```rust
#[serde(default)] slug: Option<ModSlug>,     // None = legacy uuid layout, migration pending
#[serde(default, skip_serializing_if = "Option::is_none")] fault: Option<ModFault>,
```

`ModFault` (new, beside the entry): `ConversionFailed { error: String, quarantine_dir: String }`
— one variant now, and autofix adds more later. `slug: None` doubling as layout state is accepted
scaffolding: each legacy branch carries a comment naming the invariant, and a follow-up release
removes them. `CURRENT_VERSION = 2`. `migrate_v1_to_v2` (on `serde_json::Value`, existing chain
hook, backup machinery unchanged) only bumps the version.

Path helpers replace `metadata_dir`/`archive_path` (document.rs:205-217):

```rust
fn mod_dir(&self, storage_dir) -> PathBuf;       // mods/<slug> | mods/<uuid> legacy
fn private_dir(&self, storage_dir) -> PathBuf;   // mod_dir/.ltk
fn archive_path(&self, storage_dir) -> PathBuf;  // .ltk/archive.<ext> | archives/<uuid>.<ext> legacy
fn is_present(&self, storage_dir) -> bool;       // faulted: quarantine dir exists, otherwise config exists, modpkg also requires archive
```

`entry.format` stays `ModArchiveFormat` = provenance. Provider and path logic branch on layout
(`format == Modpkg` → packed, everything else → unpacked project). New `index/identity.rs`:
`ModIdentity { schema_version, id, installed_at, source_format: ModSourceFormat, storage }` with
`write(private_dir)` / `load(private_dir)`, where `ModSourceFormat = Fantome | Modpkg | Unknown`.

### 3. Resolver + constructor plumbing

`ModLibrary` gains `wad_resolver: Arc<WadPathResolverState>` (mirrors `linked_bins`/`wad_reports`).
`src-tauri/src/setup.rs`: construct the Arc once, pass it into `ModLibrary::new` (~line 59), and
manage the same Arc. Adjust command signatures that take `State<WadPathResolverState>`. The
resolver is best-effort — no hashtables means hex chunk names, never an error.

### 4. Setting: `Config.retain_mod_archives: bool` (default true)

`config.rs` field + `Default` + defaults test → ts-rs bindings regenerate → frontend:
`settingsIndex.ts` INDEX entry, `settingDefaults.ts` `onOff` format, row in
`src/modules/settings/components/LibrarySection.tsx` (group `library.storage`). The description
states that it applies to future installs (existing retained archives untouched) and that modpkg
archives are always kept.

### 5. Install/uninstall rework (`archive/install.rs` + tests)

Split `install_single_mod_to_index` into stage (no lock) + register (under lock):

```rust
fn stage_mod_package(storage_dir, file_path, resolver: &dyn ltk_wad::PathResolver, retain_archive: bool)
    -> AppResult<StagedMod>;   // writes mods/.staging-<uuid>
fn register_staged_mod(storage_dir, index: &mut LibraryIndex, staged: StagedMod, taken: &mut TakenSlugs)
    -> AppResult<(LibraryModEntry, InstalledMod)>;  // assign slug, rename staging -> mods/<slug>, bookkeeping as today
```

- Fantome stage: **long-path preflight** (longest would-be path vs 260 when long paths are
  disabled, with an actionable error naming the fix), then
  `FantomeImporter::new(file).with_path_resolver(resolver).import(&staging)`, write identity,
  and copy the archive to `.ltk/archive.fantome` when retaining.
- Modpkg stage: staging dir + existing `extract_modpkg_metadata` + **always** copy the archive +
  identity.
- Bulk install stages all packages before one `mutate_index` (unpack outside the lock).
- Drop-folder discovery calls stage+register inline (already background and in-lock).
- Uninstall: `remove_dir_all(mod_dir)`. Keep legacy-path deletion for `slug: None` entries, and
  a faulted entry's uninstall removes its quarantine dir.
- Delete `extract_fantome_metadata`'s install-time use (keep the thumbnail-fallback helper).

### 6. Provider unification + golden tests (`overlay_content.rs` → + `overlay_content/tests.rs`)

`LibraryModEntry::content_provider` becomes `pub(crate)` and the single switch, keyed on layout:

- Packed modpkg → `ModpkgContent::new(mount(.ltk/archive.modpkg)).with_archive_path(...)`
- Everything else (unpacked project) → `FsModContent::new(mod_dir).with_raw_overrides()`

`build_single_mod_provider` drops its duplicated match and delegates. Skip predicates in
`get_enabled_mods_for_overlay` and `build_single_mod_provider` become
`entry.fault.is_none() && entry.is_present()` — a fantome without a retained archive is NOT
skipped, and a faulted entry always is.

Shared verification engine (also used by migration): `verify_fantome(archive, dir)` — collect
`BTreeSet<(resolve_chunk_hash, xxh3(bytes))>` across layers × `list_layer_wads` +
`read_raw_overrides` from `FantomeContent` vs `FsModContent`, and assert set equality.
(`ltk_overlay::utils::resolve_chunk_hash` is pub — verified.)

**Golden tests** with a `make_full_fantome_zip` fixture (`zip` is a regular core dep) holding all
three shapes: a directory-style WAD, a packed WAD (build with ltk_wad's writer, or embed a tiny
prebuilt wad as a const if the 0.5 builder API is awkward in-test), and `RAW/`:

- A: archive provider vs imported-dir provider yield identical (hash, bytes) sets.
- B: same with no resolver — hex on-disk names, sets still equal.
- C: `verify_fantome` passes on the fixture and fails when a content byte is flipped.

### 7. Reconcile rework (`index/reconcile.rs` + tests)

- Orphan predicate → `!entry.is_present()` (today's predicate requires the archive and would drop
  every retained-off fantome). Faulted entries are present while their quarantine dir exists.
- **New** directory discovery: for each non-dot subdir of `mods/` not matching an entry's dir —
  identity with unknown id → register entry (dir name is the slug, no re-slugging); known id
  under a different dir → warn and skip; no identity but config + content → mint identity
  (`source_format: Unknown`, `storage: "project"`) and register. This is the library.json-loss
  recovery path.
- Drop folder behavior unchanged (install then delete file). `cleanup_failed_discovery` becomes:
  delete the failing source + sweep stale `mods/.staging-*`.
- `refresh_stale_metadata` restricted to modpkg (`.ltk/archive.modpkg` mtime vs config mtime).
  The fantome arm is deleted — after unpack the mtime comparison inverts meaning.
- Guard: `reconcile_library_index` no-ops (log) while any entry has `slug: None && fault: None`
  (= layout migration pending), so background reconcile and the watcher cannot race the blocking
  migration. `setup.rs` also skips `reconcile_in_background` when migration is pending.

### 8. Layout migration engine (new `index/layout_migration.rs` + tests)

```rust
pub struct LibraryMigrationStatus { pub pending: usize, pub total: usize,
                                    pub library_bytes: u64, pub free_disk_bytes: u64,
                                    pub long_paths_ok: bool }
pub struct FailedConversion { pub id, display_name, error: String }
pub struct LayoutMigrationReport { pub migrated: usize, pub failed: Vec<FailedConversion> }
impl ModLibrary {
    pub fn library_migration_status(&self, config) -> AppResult<LibraryMigrationStatus>;
    pub fn migrate_library_layout(&self, config, retain_archives: bool) -> AppResult<LayoutMigrationReport>;
}
```

`library_migration_status` counts slug-less unfaulted entries, sums the `archives/` size (the
modal's "what this does" number), queries free disk space, and runs the long-path check (registry
via the existing diagnostic + longest pending path). `migrate_library_layout` takes the modal's
keep-archives choice explicitly, since it may differ from the stored setting for this one run.

Per pending entry (one `index_lock` hold, index saved after every mod, so crash-resume falls
out): emit `LayoutMigrationProgress { current, total, current_mod }` (new `declare_events!`
variant, `"layout-migration-progress"` — do not overload the cslol `MigrationProgress`) → stage
under `mods/.staging-<uuid>` → fantome: long-path preflight, import via `FantomeImporter`,
**merge user edits** (the old config's `display_name`, `tags`, `champions`, `maps`, plus the old
`thumbnail.webp` / `README.md` when present — `edit_mod_metadata` writes all of these and the
importer would silently discard them), optional archive retention, `verify_fantome`; modpkg: copy
metadata files + archive into `.ltk` + config-loads check → write identity → assign slug → rename
→ set `entry.slug`, delete the old dir + archive **only now**, save the index.

On failure: move the old archive + old metadata dir to `quarantine/<uuid>/` with
`quarantine.json`, best-effort remove staging, set
`entry.fault = ConversionFailed { error, quarantine_dir }` (the entry stays, and profiles/folders
are untouched), save, and add to the report. After the loop: delete
`<storage>/.overlay-build-version` (forces one clean overlay rebuild) and
`wad_reports.invalidate_by_content(migrated_ids)`.

### 9. Commands + frontend

- `src-tauri/src/commands/migration.rs`: `get_library_migration_status` and
  `migrate_library_layout` (off_thread, standard `State<ModLibraryState>` + `SettingsState`
  snapshot pattern). Register in `main.rs`. On success run `reconcile_index` once and emit
  `LibraryChanged`.
- Gate in `src/routes/__root.tsx`: query status on mount, and while pending > 0 render a blocking
  `LibraryMigrationDialog` (new, `src/modules/library/components/`; component-library primitives,
  hooks not prop drilling). The dialog explains the upgrade and shows the library size, offers
  the keep-archives toggle inline (initialized from the setting), refuses to start on
  insufficient free space, and when `long_paths_ok` is false blocks with guidance to enable
  Windows long paths (reuse the existing diagnostic's messaging) rather than starting a run that
  strands mods. One "Upgrade library" button → progress from the event → closes clean, or lists
  failed conversions with the error + a Reveal button per quarantine dir.
- Library UI: `InstalledMod` gains the fault (ts-rs regenerate). A faulted mod card renders
  greyed out with the error and is not toggleable. No retry UX in this PR.
- `mod.modDir` flows from `read_installed_mod` → set it from `entry.mod_dir()`, and Reveal in
  Explorer then opens the slug directory with no further frontend change.

### 10. Sweep + docs

`get_mod_thumbnail_path`'s archive-extraction fallback reads `.ltk/archive.*` and tolerates its
absence. Delete dead code. `cargo fmt` / `cargo clippy --all-targets` / `cargo doc --no-deps`
clean, and regenerate ts bindings. Create the root `CONTEXT.md` (glossary: mod library, mod
project, slug vs id, layout migration, schema migration, cslol import, drop folder, private dir,
retained archive, quarantine, fault, storage mode) and
`docs/adr/0001-fantome-unpacks-modpkg-stays-packed.md` (the trade-off: fantome archives are
hostile to streaming — malformed zips, packed WADs, bad CRCs — so they materialize as FS
projects, while modpkg streams well and stays packed, with sanitized-fantome reserved as a future
mode). File the follow-up issues listed in Context.

## Test list (sibling tests.rs suites)

- **slug**: basics, empty → `mod`, reserved (`con`, `COM3`) suffixed, deterministic collision
  chain, taken set includes on-disk dirs, batch reservation.
- **schema_migration**: v1→v2 bump-only, chained v0→v1→v2, backup written, v3 refused (existing
  `SchemaVersionTooNew` pattern).
- **document**: path helpers + `is_present` for legacy/slugged/faulted × fantome/modpkg.
- **install**: fantome stage shape (content tree, identity, retained archive, with retain-off →
  none),
  modpkg archive always kept, register renames + bookkeeping, duplicate names in one bulk install
  get distinct slugs, failed stage leaves only `.staging-*`, long-path preflight error, uninstall
  removes one dir and scrubs profiles/folders/layer_states, legacy and faulted uninstall clean
  their respective paths.
- **overlay_content**: golden A/B/C, provider dispatch by layout, enabled-mods skips faulted and
  truly-absent mods only (fantome without an archive included).
- **reconcile**: new orphan predicate, directory discovery (identity dir registered
  id-preserving, identity-less project minted with Unknown source, duplicate id skipped, dot-dirs
  ignored), drop folder produces slug layout, staging sweep, modpkg-only stale refresh, no-op
  while unfaulted slug-less entries exist.
- **layout_migration**: happy path (three shapes, verified, old files gone, entry slugged), user
  edits merged, modpkg archive relocation, retain-off, corrupt archive → fault set + files in
  quarantine + originals intact + report row, faulted entries don't re-run, crash-resume, slug
  collision across migration, overlay marker deleted, status counts + long-path flag.
- **test_support additions**: `make_test_library`, `make_v2_entry`, `place_unpacked_mod`,
  `make_full_fantome_zip`.

## Verification

- `cargo test -p ltk-manager-core` (single suites during TDD, full at the end), fmt/clippy/doc.
- `pnpm tauri dev` against a copy of a real library: the modal runs (informed click), mods land
  under slug dirs, the faulted path is exercised with a deliberately corrupt archive, Reveal
  opens real content, and the overlay builds with the game still loading the mods.
- Record in the PR description (not asserted): fingerprint cost directory vs archive, install
  wall time, disk footprint before/after, migration wall time on the real library.
- `/code-review` at the end, commit to a feature branch.

## Risks / notes

- The schema bumps to v2 on first load even if the user quits before migrating, so older app
  versions then refuse the library. Intended protection, worth a release-note line.
- WAD-report staleness for hand-edited unpacked content no longer flows through
  `refresh_stale_metadata`. Overlay correctness is unaffected (the FsModContent fingerprint
  covers it). Follow-up.
- Rust's std handles >260-char paths itself (verbatim conversion), so the preflight guards the
  user's browsing and third-party tools more than the manager's own writes — the gate + guidance
  is UX, not a correctness workaround. Verify + the fault state remain the catch-all.
