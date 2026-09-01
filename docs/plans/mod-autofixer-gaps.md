# What the mod autofixer covers, and what it misses

> Status: **research** (2026-08-30). Nothing here is implemented, and nothing here is a
> commitment to implement it.
>
> Written after the repair shipped and read as narrow: it fixes a great many findings of one kind
> and stays silent about everything else a mod can get wrong. This note establishes what the one
> shipped rule actually reaches, what the meta format would allow a second rule to reach, and —
> with ground truth measured against a real 16.x install and three specimen mods — what the
> localized-WAD complaint really is.
>
> Five findings run against what was assumed going in. The migration table is not two kinds of row,
> it is fourteen, and two of them are structural rather than path retypes (section 1). A type
> mismatch does not make the game reject a mod, it makes the client silently drop one property and
> carry on (section 1). The localized-WAD routing the whole investigation was about is **already
> implemented, correctly, in `ltk_overlay`** — the proof is in this machine's own
> `wad-reports.json` (section 3), and what is missing there is not a fix but a sentence.
>
> The fourth reframes the rest: a mod that **crashes the game on Sett's R** carries the stored
> verdict **healthy, 0 findings, fixable 0**, because the repair ran at install, applied all 1,073
> findings it could see, and left nothing behind. The autofixer did its whole job and the mod still
> crashes. Section 6 walks that crash from symptom to two candidate root causes, neither of which
> any rule in this codebase can see.
>
> The fifth is the mirror image, and the only defect here that lives in shipped code rather than in
> a mod: the pre-launch "missing dependencies" dialog **reports a dependency that is not missing**,
> because the check requires a bin's links to resolve inside the same WAD the bin was routed to.
> Vanilla League breaks that rule in 14 places, so the premise is wrong rather than merely strict.
> Section 7.
>
> The opening worry — that the table reaches only a couple of migrations — is answered in the
> opposite direction: it carries 395 rows across 14 distinct type pairs. What replaces it is a
> better worry, and a structural one. A `(class, field) -> (from type, to type)` table can only
> describe a property that still exists under a hash that has not moved. A field that was
> **renamed**, or one the game requires and the mod **omits**, is outside that shape at any row
> count. Section 2.
>
> Every claim below cites the file and line range it came from. Where a claim could not be checked
> against a primary source it is marked **unverified** in bold. Measurements were taken with a
> scratch tool built against `ltk_wad` 0.5.4, `ltk_meta` 0.6.1, `ltk_file` 0.2.11 and the mimir
> `game-2026-08-24` table, run over `C:\Riot Games\League of Legends` — on
> **16.17.8104348**, past the migration table's own 16.17.8087655, so the shipped rule is live
> rather than dormant and its findings are `Fatal` — and over
> `flowery_sett-1.0.0.fantome`, `Megumin - Kaisa.fantome` and
> `Spirit_Blossom_Rift_by_Moga_v16.16.2.26.0.fantome`. The tool lives outside both repos, and
> neither repo was modified.

Vocabulary is `CONTEXT.md`'s and `docs/ux/PROJECT_PROBLEMS.md`'s throughout: **rule**,
**problem**, **site**, **fix**, **run**, **dormant**, **verdict**, **basis**, **migration** for
one row of the table, **check** and **repair** for the mod-health half.

## 1. What the repair covers today

### The engine ships one rule

`rules::all()` returns a single `Box<dyn Rule>`, and `bin/property-type` is it —
`crates/ltk-manager-core/src/problems/rules/mod.rs:10-14`. Every other defect the manager
notices lives outside the engine, in four unrelated subsystems that produce no problem, no
site and no fix. Section 6 lists them.

### The migration table, enumerated

One JSONL file, 395 rows, shipped in the build:
`crates/ltk-manager-core/src/problems/tables/binfile_migration_16.17.8087655.jsonl`, loaded at
`crates/ltk-manager-core/src/problems/rules/bin_property_type/table.rs:26-29` as a claim about
build `16.17.8087655`.

The belief that the table holds only `String -> File` and `Hash -> File` is **wrong**. There
are fourteen distinct `(from, to)` pairs, and two of them are not path retypes at all:

| n   | from                      | to                         | conversion   |
| --- | ------------------------- | -------------------------- | ------------ |
| 350 | `String`                  | `File`                     | `hash_value` |
| 7   | `Hash`                    | `File`                     | `rehash`     |
| 7   | `Map<U32, String>`        | `Map<U32, File>`           | `hash_value` |
| 5   | `Map<Hash, String>`       | `Map<Hash, File>`          | `hash_value` |
| 5   | `Option<String>`          | `Option<File>`             | `hash_value` |
| 4   | `List2<String>`           | `List2<File>`              | `hash_value` |
| 3   | `Map<String, String>`     | `Map<String, File>`        | `hash_value` |
| 3   | `Map<I32, String>`        | `Map<I32, File>`           | `hash_value` |
| 3   | `List<String>` (size 3)   | `List<File>` (size 3)      | `hash_value` |
| 3   | `List<String>`            | `List<File>`               | `hash_value` |
| 2   | `Map<U8, String>`         | `Map<U8, File>`            | `hash_value` |
| 1   | `Embed<0x73b4a2eb>`       | `Pointer<0x73b4a2eb>`      | `none`       |
| 1   | `List2<Embed<0xa7ca72c>>` | `List2<Embed<0x3b8d8b3f>>` | `none`       |
| 1   | `Map<Hash, String>`       | `Map<File, String>`        | `hash_key`   |

Collapsed by conversion that is 385 `hash_value`, 7 `rehash`, 2 `none`, 1 `hash_key` — the split
`table.rs:31-49` already documents. So the table does reach inside `List`, `List2`, `Option` and
`Map`, and it does carry two structural changes: one `Embed -> Pointer` retag on a fixed class,
and one container whose element class hash moved. The rule handles all of them
(`retag` at `mod.rs:985-1010`, `reclass` at `mod.rs:1013-1034`).

The table's type words are the meta dumper's, not `ltk_meta`'s, and the mapping between the two
vocabularies is one twelve-row list at
`crates/ltk-manager-core/src/problems/rules/bin_property_type/kinds.rs:29-42`. A row naming a
type outside that list is skipped and logged (`table.rs:250-273`).

### What the fix can apply, and what it cannot

Two decisions, in two places.

**The rule sets the flag at check time.** `findings_of` attaches
`fix: (!bin.is_override).then(|| preview(...)).flatten()` —
`crates/ltk-manager-core/src/problems/rules/bin_property_type/mod.rs:385-387`. That `Option`
is the whole contract the surfaces read: `Problem.fix` in
`crates/ltk-manager-core/src/problems/mod.rs:330`, `fix: FixPreview | null` in
`src/lib/bindings/Problem.ts:28`, and `Run::live_fixable()` at
`crates/ltk-manager-core/src/problems/mod.rs:557-564`, which is what the verdict word and the
one-button repair are computed from (`crates/ltk-manager-core/src/mods/health.rs:401-426`).

**`problems/fix.rs` performs no availability check at all.** `apply`
(`crates/ltk-manager-core/src/problems/fix.rs:264-299`) groups problem ids by rule and hands
them to `Rule::fix`. An id whose `fix` was `None` and that a caller passed anyway is re-derived
from the file in front of it and comes back counted as skipped
(`mod.rs:222-229`). The safety is re-derivation, not a gate.

So a finding of the one shipped rule has no fix in exactly three cases:

| Case                                                       | Where                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| The bin is a `PTCH` override bin                           | `mod.rs:385` and the fix-side skip `mod.rs:193-198`               |
| A `rehash` row whose `Hash` resolves to no path            | `preview` `mod.rs:1199-1206`, `resolved_paths` `mod.rs:1171-1187` |
| A `hash_key` row where **any** map key resolves to no path | same, all-or-nothing at `mod.rs:1180-1184`                        |

The override-bin case is not a policy choice, it is a hole in `ltk_meta`:
`Bin::to_writer` is `todo!("implement is_override Bin write")` and would panic rather than fail
— `ltk_meta-0.6.1/src/tree/write.rs:35-40`. The comment at `mod.rs:191-192` says so.

The name lookup behind the other two is `BinNames::path_value`
(`crates/ltk-manager-core/src/problems/names.rs:159-164`), reading the mimir `binhashes` table
and the mod's own declared tables, with FNV1a32 collisions deliberately poisoned so a repair
never guesses (`names.rs:268-289`).

`keep_names` (`mod.rs:701-717`) adds one more refusal on the apply side only: a property is
converted only when every path under it was first written into the mod's own
`hashes/game.hashes.txt`.

### What the game actually does with a mismatch

Worth stating plainly, because the rule's own module header calls a mismatched property "a mod
the game rejects" (`mod.rs:1-7`) and that is stronger than what the client does.
The client compares the tag in the file against the tag it has registered for that property and
requires exact equality. On a mismatch it consumes the value by its own wire type, stores nothing,
and reports the load as successful - no coercion, no error, no log line, and the property keeps
its constructor default. The shipped game depends on this: a large number of authored property
values in Riot's own data sit on classes or fields the retail client never registers, and are
parsed past and discarded every load. The silent drop is not going to be tightened.

The practical consequence is that a `bin/property-type` finding is a **silently dropped
override**, not a crash. A retexture that does nothing and a custom animation that does not
play are the two commonest shapes, because
`StaticMaterialShaderSamplerDef.texturePath` and `AnimationResourceData.mAnimationFilePath` are
the two heaviest migrated fields (same file, lines 400-412 and 449-466). That does not make the
rule less urgent, but it does mean `Severity::Fatal` (`mod.rs:1073-1080`) is a claim about the
mod not working rather than about the game crashing, and it means the crashes users report are
mostly something else. Sections 5 and 6 are about the something else.

## 2. The meta migrations the table has no row for

Before the rows, the shape. A `Migration` is `(class, field) -> (from TypeSpec, to TypeSpec)` and
the rule matches on the value's own kind, so the table can only ever describe **a property that
exists, under a hash that has not moved, whose type changed**. A field that was **renamed**, and one
the game requires that the mod **omits**, both sit outside that shape however many rows the table
grows. The rest of this section is about what the shape does reach,
and the reader should hold on to the fact that the ceiling is structural rather than a matter of
coverage.

### The type system

`ltk_meta::property::Kind` is `#[repr(u8)]` with 27 variants —
`ltk_meta-0.6.1/src/property/kind.rs:6-53`. Primitives are their own index, complex types are
`0x80 | index`. `is_primitive` at `kind.rs:85-111` includes `None`, `Bool` and `String` and
excludes `BitBool`. `subtype_count` at `kind.rs:120-129` calls only `Container`,
`UnorderedContainer`, `Optional` and `Map` containers, so `Struct` and `Embedded` are not
containers by that predicate even though they hold children.

There is **no conversion machinery in `ltk_meta` at all**. Everything that looks like one is a
wrapping conversion (a Rust value into its `values::X` newtype) or a sorting conversion (a
homogeneous `Vec` into the matching container arm). `Kind::default_value`
(`kind.rs:140-170`) builds a zero value of a kind, it does not convert an existing one.
`TryFrom<Vec<PropertyValueEnum>> for Container` (`values/container.rs:87-124`) requires the
elements to already share a kind and errors otherwise. So every retype a second rule wants has
to be written by the caller, exactly as `bin_property_type` writes its four.

The structural constraint that shapes any such code is recorded at `mod.rs:965-967`: a
`Container` is an enum over its item type, so converting is a construction and not a mutation,
and the old value must be owned to be consumed.

### The three hashes, and which kind uses which

| Kind                      | Function                                                 | Width | Evidence                                                       |
| ------------------------- | -------------------------------------------------------- | ----- | -------------------------------------------------------------- |
| `Hash`                    | FNV-1a 32, Unicode-aware lowercase                       | u32   | `ltk_hash-0.4.0/src/lib.rs:100-104`, `src/impls/fnv1a.rs:1-23` |
| `ObjectLink` (the `Link`) | FNV-1a 32 — same function _and same Rust type_ as `Hash` | u32   | `ltk_meta-0.6.1/src/property/values/primitives.rs:167-173`     |
| `WadChunkLink` (`File`)   | XXH64 seed 0, **ASCII-only** lowercase                   | u64   | `ltk_hash-0.4.0/src/lib.rs:28-32`                              |
| `String`                  | none — literal UTF-8 with a u16 length                   | 2+N   | `values/string.rs:69-89`                                       |

Two asymmetries matter. `BinHash::hash_str` lowercases Unicode-aware while
`WadHash::hash_str` lowercases ASCII-only, so for a non-ASCII path the two disagree about what
"the same path" means. And `Hash` and `ObjectLink` are byte-identical on the wire and identical
in Rust — only the tag distinguishes them, and the client treats them differently: `Link`
adds the field to the container's deferred resolution list where `Hash` merely stores the u32.

### What a second rule could derive, and what it could not

Grouped by whether the conversion is information-preserving.

**Lossless and mechanical, needing nothing but the value in front of it**

- `Hash -> ObjectLink` and back. Same u32, same hash function, only the tag moves. This is the
  `Conversion::None` shape the table already has one row of.
- `Embed<C> -> Pointer<C>` and back, which `retag` already implements at `mod.rs:985-1010`.
  Note the client is not symmetric about it: `Embed` requires the file's class to be exactly the
  declared one and drops a derived class whole, while `Pointer` accepts a descendant. So `Pointer -> Embed` is lossless on the wire and
  can still change behaviour.
- `Container -> UnorderedContainer` and back. `UnorderedContainer` is a newtype over
  `Container` and byte-identical on disk
  (`ltk_meta-0.6.1/src/property/values/unordered_container.rs:13-14, 40-57`).
- Integer widenings inside one signedness: `U8 -> U16 -> U32 -> U64`, `I8 -> I16 -> I32 -> I64`.
  Sizes at `values/primitives.rs:132-142`. Nothing in the table needs them today.
- `Bool <-> BitBool`. Identical encoding, one byte (`primitives.rs:124` and `:130`). The only
  difference is that `BitBool` is excluded from `is_primitive` and therefore cannot be a map key
  (`kind.rs:85-111`, and the note at `primitives.rs:126-130`).
- `String -> File`, which is the 385-row case and one `WadHash::hash_str`.
- `String -> Hash` / `String -> ObjectLink`, which is one `BinHash::hash_str`. The table has no
  row for it. Where a class stores an object path in plaintext, that path's FNV1a32 is the
  object's own bin entry key, which is what makes the direction mechanical.

**Lossy, and therefore repairs that must ask before writing**

- Any string-to-hash direction. It is one-way by construction, which is exactly why the
  `rehash` rows need a hashtable and why `Preserved names` exists (ADR-0006). A rule doing
  `String -> Hash` inherits the same obligation.
- Integer narrowings, and any signed/unsigned crossing.
- `F32 -> integer`, and `Vector4 -> Vector3`.
- `Color -> U32`. `Color` is four bytes RGBA (`ltk_primitives-0.3.5/src/color.rs:7-12, 37-43`),
  so the bytes survive but the byte order is a convention the reader would have to fix.
- ADR-0005 already names this class and its governor: "A future rule that would lose something
  in repair must ask before writing — that is a property the rule carries, not one an archive
  copy can restore" (`docs/adr/0005-a-repair-rewrites-the-archive-in-place.md`).

**Impossible without an external table**

- `Hash -> File` and `ObjectLink -> File`. FNV1a32 to XXH64 is not derivable, which the module
  header already states (`mod.rs:24-29`). This is the whole of the unrepairable case today.
- `File -> String` and `Hash -> String`. Same reason, other direction.
- `String -> Color`. There is no string form of a `Color` anywhere in `ltk_meta` — `Color` is
  read as four raw bytes (`primitives.rs:151-152`) — so a converter would be inventing a
  parser. **Unverified** that Riot ever authored one.

**Container element retypes**

Nesting is one shared list: `Container`, `UnorderedContainer` and `Optional` accept every kind
except the four containers themselves
(`ltk_meta-0.6.1/src/property/values/container/variants.rs:1-24`), and a `Map` requires a
primitive key (`values/map.rs:174-177`) and a non-container value (`map.rs:179-182`). Any
element retype that is lossless as a scalar is lossless inside a container, because the
container writes no per-item tag — one item kind and a count
(`container.rs:230-304`). The rule already walks all four and rebuilds them
(`hashed` at `mod.rs:930-967`, `repair_map` at `mod.rs:782-804`,
`repair_container` at `mod.rs:807-847`).

Two shapes the table can express but the rule would silently mishandle if a row appeared for
them:

- A `Map` whose **key** kind changes to something `is_primitive` rejects. `Map::push` validates
  and errors (`map.rs:117-142`), so the conversion would have to rebuild the map. The one
  `hash_key` row happens to go `Hash -> File`, which is still primitive.
- A `List` with a declared `size`. `TypeSpec` carries `size` (`table.rs:66`) and `matches`
  never reads it (`table.rs:70-92`). Three rows declare `size: 3`. That is harmless today
  because the item type also has to match, but the field is dead weight that reads as a check.

### The bin-level defects the rule never looks at

These are not property retypes, so no row can express them. They are the format's own
constraints, and every one of them is checkable from a parsed `Bin`.

| Constraint                                                                        | The game                                                                                | `ltk_meta`                                                                                  |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `PROP` version must be **2 or 3**                                                 | version 1 is refused outright, and silently                                             | accepts `1..=3` (`ltk_meta-0.6.1/src/tree/read.rs:53-57`)                                   |
| a `PTCH`'s inner `PROP` must be version exactly **3**, outer `PTCH` exactly **1** | enforced                                                                                | outer checked (`read.rs:27-30`), inner only through the same `1..=3` gate                   |
| a `PTCH`'s inner `PROP` must declare **no dependencies**                          | the client reads the count and never skips the strings behind it, so the stream desyncs | reads them back fine (`read.rs:59-69`)                                                      |
| every complex value's byte size must be right                                     | the client never reads sizes on the parse path and trusts the **count**                 | returns `InvalidSize` (`values/struct.rs:99-101`, `container.rs:253-255`, `map.rs:204-206`) |

Two consequences worth carrying:

- A bin whose sizes are wrong and whose counts are right **loads in-game and the manager cannot
  read it**. It becomes a `report.failure`, not a problem — `mod.rs:157`. From the user's side
  that is a check that says nothing about a mod that works.
- Reading any v1 or v2 bin and writing it back **silently upgrades it to v3**
  (`ltk_meta-0.6.1/src/tree/write.rs:8-12, 44-45`). For v1 that is a genuine repair of the
  version-1 defect, taken accidentally as a side effect of any other fix. For v2 it is a
  gratuitous rewrite. Neither is reported.

`ltk_meta` also carries a legacy-kind retry: on `InvalidPropertyTypePrimitive` it re-reads the
whole object list with `legacy = true` (`read.rs:78-85`). The reader does not rewind, so as
written the retry reads forward from wherever the first attempt failed — **unverified** whether
that is intended, and there is no test for it. The client has no legacy mode at all - its tags are
absolute - so on a modern file that retry can turn a genuine
desync into a silent reinterpretation.

## 3. The localized WAD

### How the format distinguishes one

It does not. A WAD header is `RW`, a major and minor version, a signature, a checksum and a
chunk count — `ltk_wad-0.5.4/src/lib.rs:262-330`. A chunk's key is the xxh64 of its lowercased
path and nothing else (`ltk_hash-0.4.0/src/lib.rs:28-32`), and the TOC carries no path, no
locale and no name (`ltk_wad-0.5.4/src/chunk.rs:36-46`). **The locale lives only in the file
name**, and every tool that cares parses it out of the name.

`ltk_fantome` does not. The only occurrence of "locale" in the whole crate is a doc comment on
`FantomeLayerInfo::string_overrides` (`X:\dev\league-mod\crates\ltk_fantome\src\lib.rs:191-192`).
`is_wad_file_name` accepts `.wad.client`, `.wad` and `.wad.mobile` case-insensitively and takes
whatever precedes them as one opaque name
(`X:\dev\league-mod\crates\ltk_fantome\src\reader.rs:768-772`, `wad_name_of` at `:759-762`).

cslol does parse it, and then throws it away: `Mounted::make_name` lowercases the filename and
strips `.client` then `.wad`, so `Sett.en_US.wad.client` becomes `sett.en_us` and
`Sett.wad.client` becomes `sett`
(`X:\dev\cslol-manager\cslol-tools\lib\lol\wad\mounted.hpp:13-23`, HEAD
`23f230858bc2359ce279e07ed129d482fe3b00bf`). They are two separate mounts with distinct names,
so name matching never crosses between them.

### Ground truth: what Riot actually ships

Measured over the whole of `C:\Riot Games\League of Legends\Game\DATA\FINAL` — 392 WADs,
795,415 distinct path hashes, names resolved through the mimir `game-2026-08-24` table.

**The rule is the locale segment in the path, and it is exact.** Across **182 localized WADs
holding 2,103 chunks, zero chunks have a path that does not contain that WAD's own locale
segment.** No exceptions, no unresolved names.

The converse holds with one honest exception. Across 210 unlocalized WADs holding 888,863
chunks, exactly **28** carry a locale-shaped path segment, and all 28 are
`Bootstrap.windows.wad.client`'s per-locale `data/menu/<locale>/bootstrap.stringtable` — a file
that has to exist before a locale is chosen.

The "only audio" version of the claim is true for champions and maps and false in general:

| Scope                    | WADs | chunks | contents                                                 |
| ------------------------ | ---- | ------ | -------------------------------------------------------- |
| `Champions/*.en_US`      | 174  | 1,963  | `.bnk` and `.wpk` only, nothing else                     |
| `Maps/Shipping/*.en_US`  | 6    | 132    | `.bnk` and `.wpk` only, nothing else                     |
| `UI.en_US.wad.client`    | 1    | 6      | six `.tex`, e.g. `assets/ux/endofgame/en_us/victory.tex` |
| `Localized/Global.en_US` | 1    | 2      | `data/menu/en_us/lol.stringtable` and `tft.stringtable`  |

`Sett.en_US.wad.client` is 12 chunks: four `*_vo_audio.wpk`, four 48-byte `*_vo_audio.bnk` and
four `*_vo_events.bnk`, all under `assets/sounds/wwise2016/vo/en_us/characters/sett/skins/`.
`Sett.wad.client` is 2,689 chunks including 20 `.bnk` of SFX — audio, unlocalized, in the base
WAD, which is the point: **audio is not the criterion, the locale segment is.**

So the invariant a rule should test is: a chunk belongs in `X.<locale>.wad.client` if and only
if its path contains `/<locale>/`. That is checkable from a resolved path with no game install,
and it is the same test in both directions.

Only `en_US` is installed on this machine (174 of 174 champion locale WADs), so the multi-locale
case is **unverified** here. The nine sub-4 KB WADs in the install
(`Online.wad.client`, several `TFTSet*`, `TFTChampion.en_US.wad.client`) are valid empty v3.4
archives with a real signature, 272 to 352 bytes, **not** the zero-filled placeholders cslol's
`toc.cpp:9-21` comment guards against. That comment — "we atempt to ignore empty all 0 files
early, proper solution is to handle locales", present verbatim at both `toc.cpp:11` and
`toc.cpp:16` — is therefore about an install state this machine does not exhibit, and the
zero-filled-placeholder theory is **unverified**.

### Compression: the claim is right about `.wpk` and wrong about `.bnk`

Every `.wpk` in every localized WAD in the install is stored uncompressed — 654 of 654. The
`.bnk` files split almost exactly in half, 654 `None` against 655 `Zstd`, and the split is by
role, not by extension:

```
005a3b7e06e3f0d8        48         48 none   .../skins/skin66/sett_skin66_vo_audio.bnk
161c2331576852f5   5404402    5404402 none   .../skins/skin66/sett_skin66_vo_audio.wpk
e00d5e8c39ad4b4f     19438       4161 zstd   .../skins/skin66/sett_skin66_vo_events.bnk
```

The media banks (`*_audio.bnk`, `*.wpk`) are stored. The event banks (`*_events.bnk`) are
zstd-compressed. The same split holds in the base WAD: `sett_base_sfx_audio.bnk` is 1,174,608
bytes stored, `sett_base_sfx_events.bnk` is zstd.

Both toolchains are more conservative than Riot. `ltk_wad`'s policy is one match arm —
`WwisePackage | WwiseBank => None`, everything else `Zstd`
(`ltk_wad-0.5.4/src/file_ext.rs:19-24`) — so it stores event banks Riot compresses. cslol's is
the same rule with more arms: `EntryData::into_optimal` leaves Raw `.bnk`/`.wpk` alone,
decompresses Zstd and ZstdMulti `.bnk`/`.wpk` back to Raw, always decompresses Gzip and re-runs,
and leaves `Link` untouched
(`X:\dev\cslol-manager\cslol-tools\lib\lol\wad\entry.cpp:211-245`), applied at write time from
`Archive::write_to_file` (`archive.cpp:126`).

Two details matter for anyone porting the idea:

1. **cslol decides by content magic, never by filename.** `EntryData::extension()`
   (`entry.cpp:107-135`) calls `utility::Magic::find` on the decompressed head — a 128-byte
   buffer for the zstd cases. The table is `cslol-tools/lib/lol/utility/magic.cpp:8-76`, with
   `{"BKHD", ".bnk"}` at `magic.cpp:35` and `{"r3d2", ".wpk"}` at `magic.cpp:44`. `"r3d2"` is a
   prefix of the seven specific `r3d2*` signatures above it (`magic.cpp:37-43`) and the loop
   returns the first match, so `.wpk` is effectively "starts with `r3d2` and is none of the
   known r3d2 formats". `ltk_file::LeagueFileKind::identify_from_bytes`
   (`ltk_file-0.2.11/src/kind.rs:146`) is the equivalent, and `ltk_fantome`'s delta path already
   uses it for exactly this (`X:\dev\league-mod\crates\ltk_fantome\src\delta.rs:745-751`).
   A path-extension rule would not be equivalent.
2. **cslol never re-encodes a game WAD.** `Mounted::read_from_game_file` calls
   `archive.mark_optimal()` immediately after reading (`mounted.cpp:83`, `mark_optimal` at
   `archive.cpp:191-195`, the flag at `entry.hpp:84`), and `into_optimal` short-circuits on that
   flag (`entry.cpp:213-216`). So Riot's own layout is trusted as already optimal and is never
   sniffed. That is an assumption in cslol's code rather than an observation — the measurements
   above are the observation, and they agree with it for `.wpk` and disagree for `*_events.bnk`.

This is a global rule about audio, not a rule about localized archives. It is worth separating
from the routing question, because the specimen that prompted the whole investigation already
satisfies it.

### What cslol does with a badly routed mod, and why those mods work there

cslol does not split or relocate anything. It **fans a chunk out to every game WAD that already
owns that path hash**, at overlay-build time, from a full index of the installed game.

`Index::add_overlay_mod` (`X:\dev\cslol-manager\cslol-tools\lib\lol\wad\index.cpp:154-177`),
per mod WAD:

1. Find the base game WAD by mount name, falling back to maximum path-hash overlap —
   `find_by_mount_name_or_overlap` at `index.cpp:124-130`, `find_by_overlap` at
   `index.cpp:101-115`, which counts shared hashes per mount and takes the strict maximum.
2. Merge the **entire** mod archive into that base WAD (`index.cpp:165`).
3. Then, for **every other** game WAD, compute `extra_mounted.archive.overlaping(mod_archive)`
   — the subset of mod entries whose path hash also exists in that WAD — and merge that subset
   in too (`index.cpp:166-175`).

`Archive::overlaping` keeps the right-hand side's data, so the merged subset is the mod's bytes
(`archive.hpp:101-107`), and `merge_in` is a hinted `insert_or_assign` sweep, so the incoming
archive wins every collision (`archive.hpp:109-115`).

`Index::rebase_from_game` (`index.cpp:138-152`) is the other half: a mod WAD whose mount name is
not in the game keeps its own parent directory but adopts the base WAD's filename, chosen by
content overlap alone, and throws if nothing overlaps.

The routing key is therefore **which shipped Riot WAD actually owns that path hash**, taken from
the install. Not the extension, not the locale directory, not the mod's WAD name. That is why
"Sett flowerly" works under cslol despite living entirely in `sett.en_us.wad.client`: 78 of its
chunks are hashes `Sett.wad.client` owns, and cslol copies them there.

Conflict reconciliation between two mods is `Mounted::resolve_conflicts`
(`mounted.cpp:8-33`): identical stored checksum takes the new one silently, identical
decompressed checksum warns and takes it, otherwise it takes-and-warns or throws depending on an
ignore flag. Note the log wording at `mounted.cpp:21` inverts what its branch means — do not
read "Compressed checksum conflict" as "the compressed checksums matched".

Deduplication is real on both sides of cslol's I/O: `Archive::read_from_toc`
(`archive.cpp:14-34`) shares one `EntryData` across TOC names with an equal `loc.checksum`, and
`write_to_file` (`archive.cpp:118-146`) writes one copy per distinct post-`into_optimal`
checksum. So identical bytes under N path hashes cost one copy, and "the same asset appears in
`base` and in four skin folders" is not by itself waste.

### The routing is already solved, at overlay build time

**This is the finding that most contradicts the premise of the investigation.** `ltk_overlay`
0.9.5 — the version `X:\dev\ltk-manager\Cargo.lock` pins, and the version
`X:\dev\league-mod\crates\ltk_overlay` holds, byte-identical bar line endings — already routes
every chunk by which installed WAD owns its path hash, already rebases a mod WAD whose name the
game does not know, and already handles the localized sibling by name. It has a design section
for it, three dedicated integration tests, and its own cache format.

`OverrideMeta::route_targets` is the whole of it —
`X:\dev\league-mod\crates\ltk_overlay\src\builder\mod.rs:154-177`, contract at `:139-153`:

- Every game WAD containing the path hash, from `GameIndex::find_wads_with_hash`. A shared chunk
  is **fanned out to all of its holders**, so every loaded copy stays checksum-consistent — which
  matters because League validates a shared chunk by its compressed checksum
  (`wad_builder.rs:59-62`).
- Plus `fallback_wad`, when nothing hash-matched or when the override is a cross-WAD import whose
  declared WAD is missing from the matches (`is_cross_wad_import` at `builder/mod.rs:125-137`).
- Plus `unlocalized_wad` whenever the fallback is taken, "so a chunk declared into a localized WAD
  also reaches players on other locales and the integrity scan can resolve it"
  (`builder/mod.rs:146-148`).

`resolve_fallback_wad` (`builder/metadata.rs:198-255`) resolves the mod's own WAD directory name
against the game, and where the game does not know that name it falls through to
`GameIndex::find_best_matching_wad` — maximum shared-path-hash overlap, the same mechanism as
cslol's `find_by_overlap`. The doc comment at `game_index.rs:285-291` names the real case it was
written for, `"Spirit-Blossom-Rift.wad.client"`. `resolve_unlocalized_wad` (`metadata.rs:263-285`)
turns `Graves.en_US.wad.client` into `graves.wad.client` through `unlocalized_wad_name`
(`metadata.rs:289-296`) and `is_locale_tag` (`metadata.rs:301-308`), which requires exactly
`xx_YY` so `Bootstrap.windows` and `ShaderCache.dx11` are not mistaken for locales. Only a name
the game knows gets a sibling — "an overlap match is a guess about content, not a placement the
mod declared" (`metadata.rs:196-197`).

The tests are `X:\dev\league-mod\crates\ltk_overlay\tests\localized_wad_routing.rs`:
`new_content_in_a_localized_wad_reaches_the_sibling`, `localized_content_stays_in_its_own_wad`,
`a_correctly_placed_mod_is_unaffected`.

### The proof is already on the user's own machine

`ModWadReport::from_meta` computes `affected_wads` from the same `route_targets` call the build
uses (`builder/mod.rs:435-445`), the manager persists it
(`crates/ltk-manager-core/src/mods/analysis/wad_reports.rs:52-80`), and
`%APPDATA%\dev.leaguetoolkit.manager\wad-reports.json` on this machine already holds the answer
for all three specimens:

```
584  Sett.en_US.wad.client, Sett.wad.client, Ziggs.wad.client
428  Kaisa.wad.client, Map11.wad.client, Map12.wad.client
580  Map11.wad.client, Map12.wad.client, Map30.wad.client, Map453.wad.client, Shaders.wad.client
```

"Sett flowerly" is installed as `sett-flowerly` in `library.json`, and its report already routes
into `Sett.wad.client` and into `Ziggs.wad.client` — exactly the two destinations section 5's
measurement says its chunks belong to. "Spirit Blossom Rift" was rebased off a WAD name the game
does not have and spread across four map WADs plus `Shaders`. The Kaisa mod reaches the two map
WADs its two stray chunks belong to.

Eleven other installed mods carry the same shape, `Riven`, `Graves`, `MasterYi`, `Thresh` and
`Lux` among them, each paired with its `.en_US` sibling. So a localized WAD in the project editor
is not a mod that will not work. It is a mod whose content the build already puts where it
belongs, and the only thing missing is anything that says so.

### What is actually left

The mechanism is present and correct. Four things around it are not.

**Nothing tells the user.** The WAD report is computed at install and consumed by the categorizer
(`wad_reports.rs:54-80`, feeding `DerivedCategorization::from_wad_footprint`) rather than shown
as a health fact. A modder opening a project whose only archive is `sett.en_us.wad.client` gets no
sentence about where its chunks will land, and reaches for the `wadBlocklist` instead — this
machine's `settings.json` carries `{"kind": "exact", "value": "ahri.en_us.wad.client"}`, which is
a person working around a problem the builder had already solved.

**A dropped override is a warning in a log and nothing else.** `distribute_override_hashes` counts
overrides that hash-matched nothing and had no fallback target, and emits
`tracing::warn!("… were skipped - that mod content will not appear in-game")` —
`X:\dev\league-mod\crates\ltk_overlay\src\builder\resolve.rs:344-350`. That is the one case where
content genuinely vanishes, and no verdict, badge or report carries it.

**Cross-mod conflicts are not detected at all.** `OverlayBuildResult::conflicts` is typed
(`builder/mod.rs:320-321`, struct at `:354-365`) and hardcoded to `Vec::new()` on every return
path — `builder/mod.rs:761`, `:899`, `:991`. Two mods writing the same path hash into the same WAD
resolve by load order, the first mod in the enabled list winning through a reverse-order
last-writer-wins merge (`builder/metadata.rs:570-577`), and nothing reports the overlap.
league-mod's own design doc says so: "**No conflict detection.** … nothing reports the overlap"
(`X:\dev\league-mod\docs\overlay-builder-design.md:213-216`).

**The manager holds no hash-to-WAD index of its own.** `crates/ltk-manager-core/src/game_index.rs`
is a file-browser directory tree, and it deliberately destroys the relation a router needs: the
fold dedupes by hash and keeps only the first copy, and the doc on `GameFileEntry::wad` says so —
"the fold drops every copy of a chunk after the first, so this names the archive that copy came
from and not every archive that carries it" (`game_index.rs:61-65`, dedupe at `:288-302`). It is
built lazily on first browser read, never cached to disk, and needs synced hashtables, none of
which is true upstream. Upstream's index is `pub`, disk-cached at
`{storage}/profiles/{slug}/game_index.bin` with a fingerprint and `CACHE_VERSION = 3`, and
TOC-only to build. So a manager-side "which WAD owns this hash?" is a small piece of plumbing —
hold an `Arc<ltk_overlay::GameIndex>` beside the existing browser index and invalidate it where
`refresh_game_index` already does — rather than a new subsystem.

### So where does a rule go, if not into normalize

Nowhere, for the routing itself. What is worth building is the **report**, and it needs no new
routing code:

- A rule reading the mod's chunk hashes against upstream's `GameIndex` and saying, at a site,
  which archive each chunk will land in and which will land nowhere. `Info` for a chunk that fans
  out correctly, `Error` for one that is dropped.
- The one thing that has no upstream answer is a chunk whose hash matches no game WAD and whose
  name no table resolves. For "Sett flowerly" that is 505 of 593 chunks, and `route_targets` sends
  every one of them to both `Sett.en_US.wad.client` and `Sett.wad.client` — correct, and twice the
  bytes. Whether that doubling is worth avoiding is a question for the maintainer rather than a
  defect.

A WAD split at import time would be strictly worse than what exists. It would have to guess with
no game install, it would guess wrong for 85% of the specimen, and it would bake the guess into
the archive where the build currently re-derives it exactly, every time, against the install the
user actually has.

## 4. What normalize does today, and where a split would go

`X:\dev\league-mod\crates\ltk_fantome\src\normalize.rs` is 220 lines and does exactly two things.

`normalize_archive(source, dest)` (`normalize.rs:85-115`):

1. Open `source` read-only through `FantomeReader::new`, which applies the one zip-slip gate
   and refuses the whole archive if any entry name starts with a separator, contains `:`, or
   has a `..` component (`reader.rs:186-196`, predicate at `reader.rs:734-740`).
2. `create_dir_all` the destination's parent and open a `NamedTempFile` beside it
   (`normalize.rs:92-97`).
3. `store_packed_wads` into the temp file (`normalize.rs:99`).
4. On `Unchanged`, byte-copy `source` to `dest`, or write nothing at all when the two paths are
   the same (`normalize.rs:103-108`). On `Normalized`, persist the temp over `dest`
   (`normalize.rs:109-111`).

`store_packed_wads` (`normalize.rs:145-188`):

1. Scan the zip central directory only — no decompression — for entries `is_packed_wad` accepts,
   recording every index and separately those whose compression is not `Stored`
   (`normalize.rs:204-220`).
2. **Return `Unchanged` and write nothing if none is deflated** (`normalize.rs:150-152`).
3. Otherwise write every non-WAD entry in source order, then every packed WAD, so the WADs land
   last (`normalize.rs:161-162`).
4. A deflated WAD is re-encoded as `Stored` with a correct CRC32 (`normalize.rs:163-172`).
   Everything else is `raw_copy_file`, preserving its compression method and its CRC32 even when
   that CRC is wrong (`normalize.rs:173-181`).

What it deliberately does not do, from its own doc comments:

- It never opens a WAD. There is no `Wad::mount` in the file, and the WAD's bytes are asserted
  identical across the container change (`normalize.rs:117-124`, test `normalize/tests.rs:120-126`).
- It never corrects a CRC except on an entry it re-encoded (`normalize.rs:121-124`).
- It never reorders an archive whose WADs are already stored (`normalize.rs:132-139`).
- It never decompresses anything to make its decision (`normalize.rs:200-203`).
- It never reads or validates `info.json` — that file is one more entry it raw-copies.
- It never mutates `source`, per league-mod's ADR-0002.

### What is reachable there

The normalizer holds a `FantomeReader` — a `ZipArchive<BufReader<File>>` and nothing else
(`reader.rs:21-23`) — plus two collections of `usize` entry indices (`normalize.rs:192-198`).
Not a list of `(path, bytes)`, not a tree, not a project model.

What a split would need is nonetheless mostly reachable without new plumbing:

- The WAD's own file name, including the locale segment, as `FantomeEntry::PackedWad(&str)`
  (`reader.rs:620-623`, `classify_entry` at `reader.rs:656-693`).
- The chunk table, through `mount_packed_wad` (`reader.rs:318-326`) returning a `Wad` whose
  `chunks()` is the TOC.
- Chunk bytes, through `load_chunk_raw` / `load_chunk_decompressed`.
- The audio test, from bytes alone, via `LeagueFileKind::identify_from_bytes(...).ideal_compression()`
  — the same call `delta.rs:745-751` already makes.

Four things block it as written:

1. **Chunk paths do not exist in a WAD.** The TOC carries a 64-bit hash. Name recovery runs only
   in `extract_packed_wad` (`reader.rs:792-810`), which is the extract path, not the normalize
   path. So "route by locale segment" needs names normalize does not have, and for the specimen
   85% of the chunks have none.
2. **The `Unchanged` short-circuit at `normalize.rs:150-152` returns before the writer exists.**
   An archive already stored — which is every archive the manager has imported once — would never
   be split.
3. **`raw_copy_file` only copies an existing entry.** A synthesized base WAD needs `start_file`
   plus a write, or the `FantomeWriter` path where `options_for` (`writer.rs:189-195`) picks
   `Stored` by name.
4. **`NormalizeOutcome` is not `#[non_exhaustive]`** (`normalize.rs:24-33`), so adding a variant
   is a breaking change to a published crate's public enum.

The manager's only production call is
`crates/ltk-manager-core/src/mods/archive/install.rs:299-301`, in place over the staged copy,
immediately after `preserve_archive_names` has harvested names into embedded hashtables. That
ordering is league-mod's ADR-0002 contract and is pinned by
`crates/ltk-manager-core/src/mods/archive/install/tests.rs:107-134`.

**Conclusion for the proposal:** a WAD split does not belong in `normalize.rs`, and section 3
argues it does not belong anywhere. Normalization is a container-encoding pass that has never
opened a WAD, it runs before the manager knows anything about the game, and its short-circuit
means it would not even run for the archives that supposedly need splitting. The routing the
split was meant to achieve already happens at overlay build, exactly, against the install the
user has. What is missing is a rule that _reports_ the routing, and that reads chunks through
`ArchiveFiles` (`crates/ltk-manager-core/src/problems/engine/archive.rs:48-54`) and resolves
names through the hashtables ADR-0009 already makes a precondition — no writes at all.

## 5. The three specimens

All three were read with the scratch tool: zip layout, `info.json`, every WAD's chunk table, per
chunk the resolved path and content magic and compression, duplicate path-hash and duplicate-bytes
detection, every bin parsed with `ltk_meta` 0.6.1, and the migration table run over each bin with
the same `from`-matching and the same fix-availability test the shipped rule uses.

### `flowery_sett-1.0.0.fantome` — the screenshot mod

Two zip entries: `META/info.json` and `WAD/sett.en_us.wad.client`, both already `Stored`.
`info.json` carries only `Author`, `Description`, `Name`, `Version`. **No `META/hashes/`
entry**, so the mod ships no hashtables of its own.

One packed WAD, 593 chunks, 145,236,224 bytes uncompressed.

| By content magic   | chunks | bytes      |
| ------------------ | ------ | ---------- |
| `Texture` (.tex)   | 260    | 25,583,544 |
| `PropertyBin`      | 101    | 61,358,328 |
| `Animation`        | 72     | 4,271,186  |
| `TextureDds`       | 68     | 4,105,040  |
| `StaticMeshBinary` | 59     | 2,486,632  |
| `WwiseBank`        | 11     | 2,261,715  |
| `Unknown`          | 10     | 23,925,344 |
| `SimpleSkin`       | 4      | 943,970    |
| `Skeleton`         | 4      | 30,606     |
| `WwisePackage`     | 4      | 20,269,859 |

**Compression is already correct.** All 15 `WwiseBank` and `WwisePackage` chunks are stored
uncompressed, everything else is `Zstd`. Whatever packed this archive applied the audio rule.

**The routing is wrong, and the numbers say how wrong.** Of 593 chunks:

- 9 have paths carrying `/en_us/` — the four VO stubs, the VO packages and the event banks
- 79 resolve to paths that do **not** carry the locale segment, including
  `assets/sounds/wwise2016/sfx/characters/sett/skins/base/sett_base_sfx_audio.bnk` and 78
  `data/characters/sett/skins/skinNN.bin` files
- 505 resolve to no path in the mimir game table at all

Routed by which installed WAD owns the hash: **78 belong to `Sett.wad.client`, 9 to
`Sett.en_US.wad.client`, 1 to `Ziggs.wad.client`, and 505 to no game WAD.** The single Ziggs
chunk is a stray from another champion, and it is exactly the case cslol's overlap fan-out
handles and a name-trusting builder does not.

Six chunks are byte-identical to the installed game's copy, so the mod is not shipping a vanilla
WAD.

**The 48-byte banks are legitimate.** Four of them, three named as `*_vo_audio.bnk` stubs. Riot
ships the same 48-byte stub for the same paths — `ebb1ad760d9b1b11
assets/sounds/wwise2016/vo/en_us/characters/sett/skins/base/sett_base_vo_audio.bnk` is 48 bytes
in the real `Sett.en_US.wad.client`. Not garbage.

**The duplication the screenshot shows is real but small.** 51 groups of identical decompressed
bytes covering 122 chunks, so about 71 redundant copies out of 593. Zero duplicate path hashes.
Under cslol that costs one copy on disk (`archive.cpp:118-146`), so it is a packing inefficiency
rather than a defect.

**101 bins, every one `PROP` version 3, no `PTCH`, 200 declared dependencies. 1,073
migration-table findings, and every one of them carries a fix.** Broken down:

```
 300  StaticMaterialShaderSamplerDef.texturePath          String -> File
 200  CensoredImage.image                                 String -> File
 200  SkinMeshDataProperties_MaterialOverride.texture     String -> File
 100  SkinCharacterDataProperties.iconCircle              Option -> Option
 100  SkinCharacterDataProperties.iconSquare              Option -> Option
 100  SkinMeshDataProperties.texture                      String -> File
  73  AnimationResourceData.mAnimationFilePath            String -> File
```

So on this mod the shipped repair is not narrow at all — it fixes everything it finds. What it
finds is one class of defect, and the archive layout that looks like the mod's real problem is
one the overlay build already resolves: `wad-reports.json` records this mod routing into
`Sett.wad.client` and `Ziggs.wad.client` alongside `Sett.en_US.wad.client` (section 3). Nothing
says so anywhere a modder can see it.

### `Megumin - Kaisa.fantome` — the inverse defect

431 zip entries: `META/details.json`, `META/image.png`, `META/info.json`, and **428 loose files
under `WAD/Kaisa.wad.client/`**. No packed WAD at all. `info.json` carries two fields
`ltk_fantome`'s `FantomeInfo` does not declare, `Heart` and `Home`, which survive through the
`#[serde(flatten)] extra` catch-all (`X:\dev\league-mod\crates\ltk_fantome\src\lib.rs:97-103`).

428 files, all under one unlocalized WAD name. By magic: 244 `Texture`, 80 `PropertyBin`, 37
`TextureDds`, 33 `Animation`, 28 `StaticMeshBinary`, 3 `WwiseBank`, 1 each `SimpleSkin`,
`Skeleton`, `WwisePackage`.

**Three VO files with `/en_US/` in their path sit in the unlocalized WAD** — the exact inverse of
the Sett problem:

```
Kaisa.wad.client/ASSETS/.Kais0_sounds/Wwise2016/VO/en_US/Characters/Kaisa/Skins/Base/Kaisa_Base_VO_audio.bnk
Kaisa.wad.client/ASSETS/.Kais0_sounds/Wwise2016/VO/en_US/Characters/Kaisa/Skins/Base/Kaisa_Base_VO_audio.wpk
Kaisa.wad.client/ASSETS/.Kais0_sounds/Wwise2016/VO/en_US/Characters/Kaisa/Skins/Base/Kaisa_Base_VO_events.bnk
```

Riot puts the unrenamed equivalents in `Kaisa.en_US.wad.client`. Because these three are
renamed they hash-match nothing, so `route_targets` falls back to the declared WAD and there is
no localized sibling to add — `resolve_unlocalized_wad` only fires for a WAD name carrying a
locale tag. This is the one routing case section 3 leaves open, and a rule testing the
locale-segment invariant would catch it.

Other observations:

- Paths are heavily renamed: `ASSETS/.Kais0_particles/...`, `ASSETS/.Kais0_characters/Karma/Skins/Skin61/...`.
  Only **86 of 428** paths hash to something any game WAD owns. The other 342 are new paths the
  mod's own bins point at, which is legitimate.
- Two of the 86 belong to `Map11.wad.client` and `Map12.wad.client` rather than to
  `Kaisa.wad.client` — two more cross-WAD strays.
- All 428 paths contain uppercase letters, which is harmless: `WadHash::hash_str` lowercases
  (`ltk_hash-0.4.0/src/lib.rs:30`). Zero paths contain a backslash. Zero distinct paths collide
  on one hash.
- 22 groups of identical bytes covering 54 files.
- `data/Kaisa_skin0_concat.bin` is a concatenated bin, 518 KB — 80 bins in total, all `PROP`
  version 3, no `PTCH`, 234 declared dependencies.
- **565 migration-table findings, all of them fixable.**

### `Spirit_Blossom_Rift_by_Moga_v16.16.2.26.0.fantome` — the unrepairable one

Six zip entries. `META/Info.json` — note the capital I, which the case-insensitive scan at
`reader.rs:200-206` handles. One packed WAD named **`Spirit-Blossom-Rift.wad.client`**.

**That WAD name matches no game WAD.** The installed maps are `Common`, `Map11`, `Map12`,
`Map22`, `Map30`, `Map453` and their `en_US` variants. Both builders handle it by overlap:
cslol's `rebase_from_game` (`index.cpp:138-152`) and `ltk_overlay`'s
`find_best_matching_wad`, whose own doc comment names this exact filename
(`game_index.rs:285-291`). The persisted report for this mod on this machine confirms it.

580 chunks: 543 `PropertyBin`, 14 `TextureDds`, 10 `Texture`, 5 `SimpleSkin`, 5 `Skeleton`, 1
`Png`, 2 `Unknown`. All `Zstd`, no audio.

Routed by ownership: **324 chunks in no game WAD, 256 in `Map11.wad.client`, 246 in
`Map453.wad.client`, 244 in `Map12.wad.client`, 114 in `Map30.wad.client`, 1 in
`Shaders.wad.client`.** The counts overlap because one path hash is owned by several map WADs —
this mod genuinely spans four maps plus the shader archive, and there is no single correct
destination. Zero of its chunks are byte-identical to vanilla.

543 bins, all `PROP` version 3, no `PTCH`, 1,228 declared dependencies. Two chunks are `Unknown`
by magic and total 47 MB, worth a look on their own.

**3,805 migration-table findings, and 997 of them carry no fix.** The unrepairable set is almost
entirely one row:

```
 996 (995 unfixable)  VfxAssetRemap.oldAsset                      Hash -> File (rehash)
   1 (1 unfixable)    0x1ff0e246.0x960dcbff                       Hash -> File (rehash)
   1 (1 unfixable)    0x1ff0e246.0xe999961a                       Hash -> File (rehash)
 536 (0)              SkinMeshDataProperties.texture              String -> File
 530 (0)              SkinCharacterDataProperties.iconCircle      Option -> Option
 530 (0)              SkinCharacterDataProperties.iconSquare      Option -> Option
 395 (0)              MinimapBackground.mTextureName              String -> File
 312 (0)              StaticMaterialShaderSamplerDef.texturePath  String -> File
 126 (0)              MapAlternateAsset.mFowOverlayTextureName    String -> File
 126 (0)              MapAlternateAsset.mGrassTintTextureName     String -> File
```

This is the shipped rule's designed failure mode meeting a mod that exercises it at scale:
`VfxAssetRemap.oldAsset` holds an FNV1a32 hash of a VFX asset path, the mimir `binhashes` table
does not name 995 of them, and there is no arithmetic from FNV1a32 to XXH64. The verdict word
this mod gets is `repairable` (some findings carry a fix), the badge says so, one press repairs
2,808 findings, and 997 stay broken with no further recourse the UI offers. `MOD_HEALTH.md` is
explicit that Problems offers no box for a modder to supply the missing name, so on this mod the
manager's answer is "add the paths to the mod's hashtables" and nothing else.

## 6. Worked example: "Sett flowerly" crashes the game on R

A user reports that this mod crashes the game when they press R — Sett's ultimate, The Show
Stopper. Not on load, not on champion select. On cast. This section walks that symptom down to two
candidate root causes, eliminates six others by measurement, and is the strongest single argument
the document has.

### The fact that frames everything else

This mod's stored health verdict on the reporting machine is **healthy, 0 findings, fixable 0**,
checked at `2026-08-30T14:59:10` against build `16.17.8104348`, manager `1.15.1`, tables
`2026-08-25T12:49:15Z` (`%APPDATA%\dev.leaguetoolkit.manager\mod-health-verdicts.json`, entry
`bb506873-40d5-4a47-8538-e8e9bf250b48`).

That verdict is not a bug. The manager's log shows the check ran and the repair ran, at install:

```
14:59:10.362  Edited …\mods\sett-flowerly.fantome: 101 chunks across 1 WADs, 0 entries
14:59:10.467  sett-flowerly repaired in 1.2541293s: 101 files, 1073 applied, 0 skipped,
              0 names kept, 0 left
```

1,073 applied is exactly the count section 5 measured for this mod, and 0 left means every
finding the one shipped rule can raise was repaired. **The autofixer did its entire job, correctly,
and the mod still crashes the game.** Everything that breaks this mod is outside the only rule
there is.

The engine is not blind in general: across the 33 mods in this library, 32 read healthy and one
reads repairable with 565 fatals — which is exactly the count section 5 measured for
"Megumin - Kaisa". The check works. It just checks one thing.

### What was ruled out

Each of these was tested with the scratch tooling against the installed game, not reasoned about.

| Hypothesis                                     | Result                                                                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A missing linked bin (`c0000225`, class 6)     | **Refuted.** 2 distinct linked paths in the whole mod, both resolve.                                                                                                                                     |
| A dangling asset path                          | **Refuted.** 100,573 extension-bearing asset references from the mod's bins, 0 unresolved against mod ∪ game.                                                                                            |
| A dangling bin-object reference                | **Refuted.** 29,442 object references in the merged Sett view, 0 pointing at an object the merge leaves undefined.                                                                                       |
| The mod repainting Ziggs                       | **Refuted.** The one Ziggs-owned chunk is byte-identical to the game's — see below.                                                                                                                      |
| The 48-byte VO stub banks                      | **Refuted.** Riot ships the same 48-byte v145 stubs at the same paths (section 3).                                                                                                                       |
| A `.tex` with a bad header, a truncated `.wpk` | **Not supported.** Every chunk identifies by its own magic, the four `.wpk` parse their `r3d2` header and entry count, and all 49 R-path assets resolve. Mip counts unchecked, so **partly unverified**. |
| A `PTCH` bin, a `PROP` v1 bin, a bad size      | **Refuted.** All 101 bins are `PROP` version 3 and `ltk_meta` reads every one.                                                                                                                           |

An early pass appeared to find 62 dangling paths. It was wrong: `VfxSystemDefinitionData.particlePath`
and `ContextualActionData.mObjectPath` hold **bin-entry names**, not WAD paths, so hashing them
with XXH64 and looking for a chunk finds nothing by construction. Any future rule has to make the
same distinction — a `String` without a file extension is an object path.

### Root cause candidate 1: the mod deletes the VFX objects the cast looks up

The mod overrides **all 76** of Sett's skin bins, `data/characters/sett/skins/skin0.bin` through
`skin75.bin`. The game has exactly 76, so none of them is junk — this is "replaces every skin",
which is its own shape.

Every one of the mod's skin bins carries the **same 65 objects**, the flowery skin's own set,
named under `Skin0`/`Sett_Base_*`. Vanilla's skin bins carry per-skin sets of wildly different
sizes. Diffing the 77 bins the mod overrides that vanilla also has:

- 676 objects removed, 4,748 added
- 569 of the removed are `VfxSystemDefinitionData`, 95 `StaticMaterialDef`, 9 `GearSkinUpgrade`
- 65 of the removed objects carry an R-related name
- the merged Sett view defines **847** objects where vanilla defines **1,473**

The mechanism is the `ResourceResolver`. Each skin's `SkinCharacterDataProperties.mResourceResolver`
points at a `ResourceResolver` whose `resourceMap` is `Map<Hash, ObjectLink>`, mapping the generic
name the spell asks for to that skin's own VFX object. Comparing vanilla's map with the mod's,
per skin:

**75 resolvers lost keys. 1,151 keys gone in total, 132 of them R-named.**

| resolver                                 | keys lost | of those R-named |
| ---------------------------------------- | --------- | ---------------- |
| `Characters/Sett/Skins/Skin66/Resources` | 177       | 14               |
| `Skin38`–`Skin44/Resources` (7 skins)    | 27 each   | 1 each           |
| `Skin19`, `Skin29`–`Skin37` (10 skins)   | 23 each   | 7 each           |
| `Skin45`–`Skin54/Resources` (10 skins)   | 19 each   | 0                |

Skin 66 concretely: vanilla's `resourceMap` holds **231** entries, the mod's holds **63**. The six
generic keys survive and are re-pointed at the base objects, which do exist —

```
vanilla  Sett_R_AoE -> 0x1019bc3f   (Sett_Skin66_R_AoE)
mod      Sett_R_AoE -> 0x2263ad95   (the Skin0 object, the same link skin0.bin uses)
```

— but every skin-specific key is simply gone:

```
Sett_Skin66_R_AoE_Gold        Sett_Skin66_R_Mis_Gold       Sett_Skin66_R_Cas_Body_Gold
Sett_Skin66_R_Mis_Black       Sett_Skin66_R_AoE_Black      Sett_Skin66_R_Cas_Avatar_Black
Sett_Skin66_R_Mis_Trail_Gold  Sett_Skin66_W_Max_Buf_Shoulders_R …
```

and skins 38 through 44 each lose `Sett_Skin38_R_AoE_Max`, the empowered-R variant.

So an R cast on an affected skin asks the resolver for a key that is no longer in the map. **What
the engine does with a resolver miss at cast time is unverified** — this is the step the evidence
does not cover, and it is the difference between "the effect does not play" and "the process
dies". The correlation is strong: the symptom is cast-specific, the deletions are cast-path VFX,
and no other cast-time defect survived the elimination above.

Note that a missing _key_ is invisible to the class-1 check and to the merged-view test in the
table above, both of which look for references pointing at nothing. Here the reference itself was
deleted, and the thing that still asks for it is the compiled spell script, outside every bin.
That is why this needs its own rule.

### Root cause candidate 2: a Wwise bank with an unset soundbank id

The mod replaces `assets/sounds/wwise2016/sfx/characters/sett/skins/base/sett_base_sfx_audio.bnk`
— the base SFX **media** bank, and the real game path — with a bank built by a different toolchain:

|      | BKHD version | soundbank id | media entries | bytes     |
| ---- | ------------ | ------------ | ------------- | --------- |
| game | 145          | 3921087296   | 80            | 1,174,608 |
| mod  | **134**      | **0**        | 80            | 1,077,907 |

Same 80 media entries, so this is the same content regenerated rather than different content.

A census over the whole install — 392 WADs, **7,829** BKHD banks read from their first 16 bytes —
qualifies this sharply, and refutes the simpler version of the claim:

- BKHD versions in the shipped game: `{125: 9, 132: 1, 134: 838, 145: 6,981}`. **v134 is not
  off-version for the game**, Riot ships 838 of them, and 50 WADs carry more than one version.
- **`soundbank_id == 0`: zero of 7,829.** Not one shipped bank has an unset id.

So the version alone is a weak signal, but two things about this bank are real. Its id is a value
the game never ships, and it does not match the bank it replaces: Sett's own 28 banks (20 in
`Sett.wad.client`, 8 in `Sett.en_US.wad.client`) are **uniformly v145 with non-zero ids**, so a
v134 bank at a v145 path is a mismatch within one champion even though it is not a mismatch
game-wide.

The mod does not override the matching **events** bank at its real path. It ships a copy of it
(v145, id `4209780865`, 13,327 bytes — vanilla's exact id and size) under a repathed name that
resolves to nothing, so at the real path vanilla's v145 events bank survives. The merged state is
therefore a v145 events bank firing into a v134 id-0 media bank, and that resolution happens when
a sound plays rather than when the bank loads. **That a v134 bank misparses or is rejected by a
v145 Wwise runtime is unverified** — no primary source for the Wwise bank format was reachable
here, and "wrong version, therefore crash" is inference. What is verified is that the id is
invalid against a 7,829-bank baseline.

This is not one bad mod. **"Megumin - Kaisa" ships the same shape**: `Kaisa_Base_SFX_audio.bnk` at
v134 with id 0 and 98 media entries, and a 32-byte v134 VO stub where Riot's stubs are 48-byte
v145. Two of three specimens, so it is a class.

### The Ziggs routing, resolved

Section 5 flagged one chunk of this Sett mod landing in `Ziggs.wad.client`. It is
`assets/characters/ziggs/skins/skin24/ziggs_skin24_tx_cm.tex`, 1,398,140 bytes, and it is
**byte-identical to the game's copy** (same SHA-256 prefix `9a7dc0d43a21d2fc`). The mod is not
repainting an unrelated champion. It is carrying an unmodified vanilla asset, picked up from
whatever mod its author assembled this one from — the harvested names show content repathed from
at least four upstream mods (`AllMight`, `beemogragasrepath`, `trystf`, `ziggs`).

The cost is still real, and it is a different defect. Because one chunk hash is owned by
`Ziggs.wad.client`, `route_targets` builds a whole overlay copy of it:
`profiles/default/overlay/…/Ziggs.wad.client` is **73,854,706 bytes and 2,047 chunks, of which
2,046 carry vanilla's checksum and exactly one does not**. That one is the texture, and it differs
only in how it is stored:

```
76c3fd2674088284   vanilla   type 4 (ZstdMulti)   compressed 487,692   uncompressed 1,398,140
                   overlay   type 3 (Zstd)        compressed 550,215   uncompressed 1,398,140
```

Identical content, subchunking dropped, 62,523 bytes larger. So a single redundant vanilla texture
costs 73 MB of overlay and converts a subchunked texture into a non-subchunked one, which is the
harm class 19 describes — here with numbers.

The downgrade is structural rather than a bug. `ltk_wad`'s builder cannot emit `ZstdMulti` at all
(`ltk_wad-0.5.4/src/builder.rs:236-238`), `EncodedChunk::new` documents that a `ZstdMulti` body
cannot be rebased because its bytes only decode alongside subchunk records that live in the archive
rather than in the chunk (`ltk_wad-0.5.4/src/rebase.rs:181-189`), and `OverrideEncoding::for_stored`
therefore returns `None` for it rather than copying it through
(`ltk_overlay/src/wad_builder.rs:270-280`). Any chunk a mod overrides that was type 4 in vanilla
comes out type 3.

What the builder does get right is the rest of the archive. The overlay's `Sett.wad.client` keeps
**1,696 `ZstdMulti` chunks, exactly vanilla's count**, its subchunk table still validates, and the
overlay's `Ziggs.wad.client` keeps 1,299 of vanilla's 1,300 — losing only the one it re-encoded.
Because a rebase preserves the data region and its TOC entries, the surviving type-4 entries and
the `.SubChunkTOC` chunk they index stay consistent with each other. Verifying all 10,574 chunks
across the five archives read here found **zero checksum mismatches and zero raw chunks whose
compressed and uncompressed sizes disagree**.

### Two boring things that are genuinely fine

- Two files are spelled with an uppercase extension, `…/Sett_Base_Saucer_Mesh.SCB`. Harmless:
  `WadHash::hash_str` lowercases before hashing, so the uppercase and lowercase spellings both
  hash to `cbd17cb342420b54` and both find the chunk.
- The 48-byte VO stub banks are v145 with real non-zero ids, copied from the game unchanged.

### The scale of the localized-WAD bloat, in one line

The game's `Sett.en_US.wad.client` holds **12** chunks. This mod's `sett.en_us.wad.client` holds
**593**. Section 3 shows the build routes them correctly regardless, so this is a presentation
problem rather than a correctness one — but it is the cleanest illustration in the document of how
far a shipped mod can sit from the shape the game uses.

### The rules that would have caught it

Neither candidate is detectable by any rule that exists. Both are cheap.

**`bin/resolver-key-loss`** — for each `ResourceResolver` a mod overrides, compare its
`resourceMap` key set against the game's copy of the same chunk. Report every key the mod drops,
`Error` for a key whose name matches a cast path. Needs the game install and the bin parse the
engine already does, and it would have raised 1,151 findings on this mod, 132 of them R-named.

The repair is a **merge**, and it is mechanical. Two candidates were measured before it, and the
order they fell in is the argument for it.

**A rebind does not reach this mod.** A rebind re-adds a dropped key pointed at the mod's own
equivalent object rather than at the game's, which is the only repair that touches nothing the
author made. It is what the mod itself already did, at far greater scale than the first pass
noticed: **4,289 keys survive with the mod's target substituted for the game's**, not the six.
The tool bound everything it could reach.

For the 1,151 it dropped there is nothing left to bind to. Normalising both sides to an effect
tail, so that `Sett_Skin10_Z_Dust_Punch` and `Sett_Base_Z_Dust_Punch` both reduce to
`z_dust_punch`, and joining on it resolves **0 of 1,151**. The control is the same join over the
keys the mod kept: 4,247 of 4,704, and every one of the 4,247 lands on the mod's actual target, so
the join is 90.3% sensitive at 100% precision and the zero is a fact about the mod. The reason is
capacity rather than naming — the mod ships **61 `VfxSystemDefinitionData` objects and all 61 are
already bound**, against the 289 distinct effect tails the dropped keys ask for. There is no spare
object to find, so no lookup of any sophistication finds one.

**A merge reaches all of it.** The loss exists only because the mod's chunk _replaces_ the game's.
Layering instead — the game's objects with the mod's applied over them, objects merged field-wise
and maps merged key-wise — was built and walked in full:

| view           | objects | links leaving these WADs | distinct targets | vs vanilla |
| -------------- | ------- | ------------------------ | ---------------- | ---------- |
| vanilla        | 1,473   | 170                      | 32               | -          |
| mod as shipped | 847     | 23                       | 13               | -147       |
| after merge    | 1,523   | 171                      | 32               | +1         |

**Links the merge breaks that vanilla does not: 0.** Vanilla's own 170 outbound links are the
cross-WAD baseline, and the merge lands on the same 32 distinct targets. Resolver keys go from
4,788 as shipped to **5,939**, against vanilla's 5,855 — every dropped key restored and resolving,
every one of the mod's own 4,788 bindings kept, and its 84 additions kept with them. Skin66 ends
at 240 keys: 63 flowery, 177 vanilla.

The merge also puts back the fields the shipped mod dropped, `skinParent` 65 times, `mEmblems` 45
and `skinUpgradeData` 8, the last of which is a previous fixer's own fallback rather than anything
the author did. See "The specimen is a pipeline's output" below.

Three things it costs, none disqualifying:

- The result is visually mixed. Skin66 plays the author's 61 effects where they exist and vanilla
  Skin66 elsewhere, which is what 61 effects applied to a skin wanting 231 honestly looks like.
- The output depends on the installed game, which is the decision `015-game-as-parts-source`
  exists to hold.
- The 24 resolvers for slots the game has no skin in are untouched, and stay as they are.

**Unverified**: whether the game accepts the merged bin in play. The merge was built and checked
for link integrity, not loaded.

**Why the repair has to be total.** A resolver miss can crash, and whether it does depends on the
call site rather than on the key. The same absent key is fatal from one caller and harmless from
another, and the callers are compiled spell scripts that live outside every bin, so nothing the
rule can read tells it which keys are the dangerous ones.

Two things follow. The severity is one value for the whole class and it has to be the worst case,
so the plan of marking a key `Error` when its name matches a cast path is out — R-named was a
proxy for the call site, and it is a proxy for the wrong thing. And a partial repair is not a
repair: restoring 90% of the dropped keys leaves an unknown subset of crashes standing. Merge is
the only candidate here that is total, which is a stronger argument for it than the link
arithmetic above.

**`audio/bank-id`** — read the first 16 bytes of every `.bnk`, and report `soundbank_id == 0`.
Zero false positives against 7,829 shipped banks. **Not auto-repairable**: the id is assigned by
the Wwise toolchain at bank-build time and cannot be synthesized. Fatal, and the fix is a sentence
telling the author to rebuild the bank.

**`audio/bank-version`** — a weaker companion: report a `.bnk` whose BKHD version differs from the
bank it replaces at the same path in the game. Not a global threshold, because 838 shipped banks
are v134. Also not repairable.

The first is worth more than the second, and the second is worth building anyway because it costs
16 bytes per bank.

### Mods arrive already rewritten

`flowery_sett` ships an `assets/beemogragasrepath/` namespace and content repathed from at least
four upstream mods, so its files went through a repath pass somewhere upstream before they reached
the manager. Our checks therefore run on content something else has already rewritten, and the
specimen's half-migrated `StaticMaterialDef` — both `TextureName` and `texturePath` present — is
what that looks like from the inside.

### The specimen is a pipeline's output

That framing is stronger than it first looked. Four measurements say the mod we have been
measuring is not what its author made, and one of them names the tool.

**The clone.** The mod holds **100 `ResourceResolver` objects carrying one distinct
`resourceMap` between them** — the same 63 keys and the same 63 targets, 100 times, with only each
object's own path hash rekeyed per slot. That is not a merge that lost keys. It is one skin's
resolver stamped into every slot, and the count is the signature: the stamp runs over slots 1 to
99 whether or not the game has a skin there, so the mod ships resolvers for roughly 24 slots
vanilla does not have.

**The dependency swap.** 76 of the 77 bins the mod shares with the game have a rewritten
dependency list. Every skin's animation dependency is repointed at skin0's: `Skin0.bin` added 75
times, and each group's own animation bin removed — `Skin8.bin` 11 times, `Skin19.bin` and
`Skin45.bin` 10 each, down to `Skin66.bin` once. The removal groups are the resolver-loss groups,
because vanilla shares one animation bin across each chroma group. **Unverified** whether that
produces a timing divergence between what the client animates and what the server runs, and it is
the only other load-time resolution in the mod that vanilla never asked for.

**A fixer's fallback, caught in the act.** Eight `SkinCharacterDataProperties` objects have
`skinUpgradeData` missing where the game's copy has it. Hematite's `gear_pull` rule declares
`nuke_fallback_field = "skinUpgradeData"`, its documented last resort when it cannot pull the
`GearSkinUpgrade` entry out of the live game, and section 6 counts 9 `GearSkinUpgrade` objects
removed. So a fixer ran, could not find the part, and took the nuke branch eight times.

**The author's own source, shipped by accident.** The ten ritobin-text chunks are 24 MB and 16% of
the archive, and no probe here read them until late because `identify_from_bytes` returns `Unknown`
for `#PROP_text`. They declare **78 object paths, 61 of them `VfxSystemDefinitionData`** — one
skin's worth, not the 100 resolvers and 100 `SkinCharacterDataProperties` the compiled bins carry,
and **zero VFX objects that the compiled bins lack**.

The author wrote one skin. A tool made it a hundred.

**What this changes about the rules.** Two things, and both are about attribution rather than
detection.

A rule that fires here is reporting on a tool's decision, not an author's. The bound in
`015-game-as-parts-source` that a repair must never contradict something the modder shipped on
purpose does not bind against a documented last-resort branch, and the merge in section 6 undoing
that branch is a repair rather than an overreach.

And the packaging accident is the only artifact in the archive that records what the author
actually authored. Today it is an unnamed blob we would report for its size. It is also evidence,
and a rule that has to decide what a mod meant has nowhere else to read it.

## 7. A shipped check that cries wolf

Every other defect in this document is something the manager fails to notice. This one is the
opposite category: a check that is present, runs on every overlay build, and **tells the user their
mod is broken when it is not**. It gets its own section because the fix is a bug fix in existing
code rather than a new rule.

### The symptom

Building the overlay with `sett-flowerly` enabled raises the "A mod is missing dependencies"
dialog, naming one missing link: `DATA/Characters/Sett/Sett.bin`. That file is not missing. It is
Sett's main character bin and it ships in the game.

Measured against the install:

```
Sett.wad.client         2,689 chunks
Sett.en_US.wad.client      12 chunks   (8 stored, 4 zstd, every one of them audio)

data/characters/sett/sett.bin           245147fe4088f264   -> Sett.wad.client
data/characters/sett/skins/skin0.bin    557176f20f43a734   -> Sett.wad.client
data/characters/sett/skins/skin66.bin   d7c7420c00615413   -> Sett.wad.client
```

No localized champion WAD in the install holds a single bin. The only dotted WAD that holds any is
`Bootstrap.windows.wad.client`, whose tag is a platform rather than a locale.

### The cause

`X:\dev\league-mod\crates\ltk_overlay\src\linked_bins.rs:80-86`:

```rust
let in_original = game_index
    .find_wads_with_hash(link_hash)
    .is_some_and(|wads| wads.iter().any(|w| w == wad_path));
```

A link counts as resolved only when the game WAD holding it is the **same** WAD as the one holding
the bin that declares it. The module states that premise outright at `linked_bins.rs:3-5`: "At load
time the game resolves each linked path against the WAD it is mounted from; a missing dependency
yields `STATUS_NOT_FOUND` (`c0000225`)".

The mod declares its bins inside `sett.en_us.wad.client`. `route_targets` (section 3) routes those
overrides to both `Sett.wad.client` and `Sett.en_US.wad.client`, and `collect_linked_bin_offenders`
then runs once per destination WAD. On the localized pass the link resolves to `Sett.wad.client`,
which is not `wad_path`, so it is reported missing.

The mod declares exactly two links, and they behave differently, which is why the dialog names one
and not two:

| link                                        | shipped by the mod | in the game       | base pass | localized pass                                                      |
| ------------------------------------------- | ------------------ | ----------------- | --------- | ------------------------------------------------------------------- |
| `DATA/Characters/Sett/Animations/Skin0.bin` | yes                | `Sett.wad.client` | resolved  | resolved, by the `override_hashes` branch at `linked_bins.rs:76-79` |
| `DATA/Characters/Sett/Sett.bin`             | no                 | `Sett.wad.client` | resolved  | **reported missing**                                                |

That reproduces the report exactly: one missing link, and it is the one the mod does not ship a
copy of.

### The premise is wrong, and vanilla proves it

The client's chunk lookup walks every mounted WAD and returns the first one holding the path. A
bin's linked files are acquired by path through that same lookup. There is no per-WAD restriction
anywhere in the resolution path, so `linked_bins.rs:80-86` encodes a rule the engine does not have.

That is checkable without any knowledge of the engine, and it holds. Scanning every property bin in
all 392 WADs of the install — **49,150 bins, 29,519 of which declare at least one link, 131,471
declared links in total** — and resolving each link against the whole index:

- 131,421 links resolve inside the same WAD as the bin declaring them
- **14 resolve only in a different WAD**
- 1 resolves in no WAD at all

The 14 are ordinary retail content, not curiosities:

| declaring bin                                            | in WAD                     | links to                                           | which lives in      |
| -------------------------------------------------------- | -------------------------- | -------------------------------------------------- | ------------------- |
| `data/characters/qiyana/skins/root.bin`                  | `Qiyana.wad.client`        | `DATA/Characters/Riven/Animations/Skin0.bin`       | `Riven.wad.client`  |
| `data/characters/bardportalclickable/skins/root.bin`     | `Bard.wad.client`          | `DATA/Characters/TestCube/Animations/Skin0.bin`    | `Common.wad.client` |
| `data/characters/cherry_goh_darius/skins/root.bin`       | `Map30.wad.client`         | `DATA/Characters/Darius/Animations/Skin0.bin`      | `Darius.wad.client` |
| `data/characters/preseason_turret_shield/skins/root.bin` | `Map11`, `Map12`, `Map453` | `DATA/Characters/AzirSunDisc/Animations/Skin0.bin` | `Azir.wad.client`   |

Five of the fourteen are Arena's `cherry_goh_*` champion clones in `Map30.wad.client` reaching into
five different champion WADs. If the engine resolved per-WAD, unmodded League would fail those
fourteen dependencies on a normal launch. It does not, so it does not resolve per-WAD.

The single vanilla link that resolves nowhere is worth recording too:
`DATA/Characters/TFT_Template_AnimProp/Animations/Skin0.bin`, declared by two bins in
`Map22.wad.client`. Riot ships a dangling link and the game runs, so "a missing dependency yields
`c0000225`" is stronger than what is observed as well — the crash is a real failure mode, but it is
not the automatic consequence of every unresolved link.

### The fix

Test the link against the **union of every non-blocked overlay WAD**, rather than against the one
WAD the declaring bin was routed into.

Nothing is lost. A link to a bin genuinely removed in a past patch still returns `None` from
`find_wads_with_hash` and is still absent from every override set, so it is still caught — that is
the case the check was written for. The only thing the same-WAD restriction adds on top of it is
"the bin exists, but in another mounted WAD", which the engine resolves and which is therefore not
a finding.

The blocklist has to stay excluded from that union, and the reason is on the reporting machine
itself: `settings.json` carries `wadBlocklist: [{ kind: "exact", value: "ahri.en_us.wad.client" }]`
and `blockScriptsWad: true`. A link that resolves only inside a WAD the build refuses to write
really is missing at runtime. `collect_linked_bin_offenders` already runs after blocked WADs are
removed (`builder/mod.rs:816-817`), so the union must be built from that same post-blocklist set
rather than from `GameIndex` wholesale.

### The same shape has a third consequence, and it is latent

The fan-out that causes the false alarm also writes the same chunk into two WADs. On this build
that is clean: the overlay's `Sett.wad.client` (3,195 chunks) and `Sett.en_US.wad.client` (596
chunks) **share 584 path hashes, and all 584 carry identical checksums**.

It is worth saying why that matters while it is still fine. League validates a chunk shared across
WADs by its compressed checksum and "kills the process over a chunk whose checksum disagrees with
its content" — `X:\dev\league-mod\crates\ltk_overlay\src\wad_builder.rs:131-134`, with the sharing
rule at `:59-62`. The current builder guarantees agreement structurally, by compressing once and
sharing one `EncodedChunk` rather than trusting the compressor to be deterministic across versions.
Any future change that encodes a fanned-out chunk twice would produce two different bodies for one
path and kill the game at mount. That is a rule worth having before the hazard is real rather than
after.

## 8. Other suspected defect classes, ranked

Ranked by how often it happens, times how badly it breaks the game, times how mechanically
repairable it is. Section 6 is the evidence for the top two, and the reason the ranking is not the
one this document would have produced before that crash was run to ground: **the classes the
shipped rule finds are not the classes that crash the game.**

"Detected today" means a shipped surface says something about it, whether or not that surface is
the Problems engine — several of these are already handled at overlay build and are here because
nothing tells the user so.

| #   | Class                                     | Frequency in the specimens   | Breaks the game                | Detected                | Repairable              |
| --- | ----------------------------------------- | ---------------------------- | ------------------------------ | ----------------------- | ----------------------- |
| 1   | A resolver key the mod drops              | 1,151 in one mod             | fidelity, not a crash          | `bin/resolver-key-loss` | not without the install |
| 2   | A Wwise bank with `soundbank_id == 0`     | 2 of 3 mods                  | silent audio loss              | `audio/bank-id`         | no, rebuild only        |
| 3   | A non-block-aligned BC-compressed TEX     | 1 of 260 TEX in one mod      | noise, or crash                | `tex/block-alignment`   | yes, and it does        |
| 4   | A chunk checksum that disagrees           | 0 of 10,574 chunks           | kills the process on read      | the crash is the report | build-time assertion    |
| 5   | The linked-bin same-WAD restriction       | fires on every localized mod | none - it is the false alarm   | fixed in 0.9.6          | fixed in 0.9.6          |
| 6   | A linked file missing from the same WAD   | 0 of 3, has a crash code     | crash                          | yes, badge only         | partly                  |
| 7   | A `Hash` no table names                   | 997 of 3,805 in one mod      | override drops                 | yes                     | no                      |
| 8   | An override the build drops entirely      | 0 of 3                       | content vanishes               | log only                | reportable              |
| 9   | Shipping an unmodified vanilla asset      | 1 of 3, 73 MB of overlay     | none, but drags a whole WAD in | no                      | yes, drop it            |
| 10  | A ritobin text dump in the WAD            | 10 chunks, 24 MB, 1 of 3     | none - magic fails             | no                      | yes, drop it            |
| 11  | A raw chunk whose two sizes disagree      | 0 of 49 raw chunks           | heap overread                  | the crash is the report | build-time assertion    |
| 12  | One path in two WADs with different bytes | 0 of 584 shared paths        | kills the process at mount     | the build prevents it   | build-time assertion    |
| 13  | A chunk in the wrong archive              | all 3                        | none - routed                  | no                      | already handled         |
| 14  | A `PTCH` bin                              | 0 of 3                       | override drops                 | partly                  | no, needs a writer      |
| 15  | A bin `ltk_meta` refuses                  | 0 of 724 bins                | none - game reads it           | as a failure            | needs a recovery reader |
| 16  | Cross-champion or cross-map strays        | 2 of 3                       | none - routed                  | no                      | already handled         |
| 17  | A `PROP` version 1 bin                    | 0 of 724 bins                | bin refused                    | no                      | free                    |
| 18  | A chunk that hashes to nothing known      | all 3                        | none by itself                 | partly                  | not a repair            |
| 19  | Re-compressing a vanilla `ZstdMulti`      | 1 of 3, observed             | costs the partial-mip read     | no                      | yes, leave it alone     |
| 20  | Duplicate bytes under many path hashes    | all 3                        | none                           | no                      | low value               |
| 21  | A backslash-spelled `WAD\` prefix         | 0 of 3                       | entry skipped                  | no                      | yes, upstream           |
| 22  | Subchunked chunks and the SubChunkTOC     | 0 of 3                       | none - stripped                | yes                     | not applicable          |
| 23  | Audio bank references                     | unmeasurable today           | unknown                        | no                      | unknown                 |

**Shipped since this was written.** Classes 1, 2 and 3 now have rules, and class 5 was fixed in
`ltk_overlay` 0.9.6. **Classes 4, 11 and 12 got no rule.** All three are archive states the overlay
build is the right place to guarantee, over the tables of contents the build itself wrote, and all
three reach a user as a game crash if they ever happen - which is the intended flow for them rather
than a row in a health panel. None occurred once across the measured corpus. Every one of those
decisions - the severity each shipped rule carries, the thresholds it uses, why it offers no repair,
and what the three removals cost - is recorded on the matching issue under
`specs/013-mod-defect-rules/issues/`, which is the file to read before re-opening any of them.

### 1. A resolver key the mod drops

**Evidence.** Section 6. 75 `ResourceResolver` objects in one mod lost 1,151 map keys against the
game's copy of the same chunk, 132 of them R-named, and the reported symptom is a crash on R cast.
`Characters/Sett/Skins/Skin66/Resources` went from 231 keys to 63.

The first word for this class was "deletes", and it is wrong. The mechanism is worth naming
exactly. The mod holds **100** `ResourceResolver` objects carrying **one** `resourceMap` between them —
the same 63 keys and the same 63 targets, 100 times over, with only each object's own path hash
rekeyed per slot. That is not a merge that lost keys. It is one skin's resolver cloned into every
slot, and the 100 count is itself the signature: the clone runs over slots 1 to 99 whether or not
the game has a skin there, so the mod ships resolvers for roughly 24 slots vanilla does not have.

**Detected today.** No. Nothing compares a mod's bin against the game's copy of the same bin at
all, and the thing that still asks for the deleted key is the compiled spell script, which lives
outside every bin — so the dangling-reference tests in classes 6 and 18 cannot see it either.

**Repairable. Yes, by merging rather than by binding.** Section 6 carries both measurements. A
rebind reaches none of it: 0 of the 1,151 dropped keys have an equivalent object anywhere in the
mod, against a 4,247-of-4,704 control on the keys it kept, because the mod ships 61 particle
objects and all 61 are already bound while the dropped keys ask for 289 distinct effects. There is
no spare object to find.

A merge reaches all of it, because the loss is an artefact of the mod's chunk replacing the game's
rather than layering over it. Layering restores 1,151 keys and **breaks no link vanilla does not
already leave open**, and it puts back the dropped `SkinCharacterDataProperties` fields on the way,
including the eight a previous fixer nuked. What it costs is a visually mixed skin, an output that
depends on the installed game, and an in-game load that has not been tried.

**A miss can crash, and whether it does depends on the call site rather than on the key.** So the
class is `Fatal`, a per-key severity is not computable from anything a bin holds, and the repair
has to be total — which is what rules out every partial candidate, not just the ones that measured
badly.

### 2. A Wwise bank with an unset soundbank id

**Evidence.** Section 6. Zero of 7,829 banks in the shipped game have `soundbank_id == 0`. Two of
three specimens ship one, in both cases the modder-rebuilt SFX media bank. In "Sett flowerly" it
replaces a real game path whose bank is v145 with an id, while the matching events bank at its own
real path stays vanilla.

**Detected today.** No. `.bnk` and `.wpk` are file-kind labels
(`crates/ltk-manager-core/src/workshop/content.rs:70-71`) and nothing in the stack reads past the
four magic bytes.

**Repairable.** No. The id is assigned by the Wwise toolchain when the bank is built and cannot be
synthesized. The finding is `Fatal` and the fix is a sentence telling the author to rebuild.
Detection costs 16 bytes per bank, which makes this the cheapest high-value rule in the list.

### 3. A non-block-aligned BC-compressed TEX

**Evidence.** `flowery_sett` ships **one** non-conforming texture out of 260: `4842acc351ff014a`,
305×560, format byte 12 (BC3). BCn formats encode 4×4 pixel blocks, so a width or height that is
not a multiple of 4 leaves the bottom and right edges reading past the end of the block buffer. Its
path resolves in no table, so **whether it sits on the R cast path is unverified**, and **what the
engine does with the overrun is unverified** — 305 is not a multiple of 4, but nothing measured
here establishes whether that renders as noise or faults.

**Detected today.** No. Nothing in this stack reads a `.tex` header beyond its magic.

**Repairable.** Yes: round each non-conforming dimension **down** to the nearest multiple of 4,
crop the pixel data, re-stamp the header. It is a
byte transform on one chunk with no dependency on the game, the hashtables, or any other rule — the
same shape as classes 4 and 11. That combination of crash-shaped, common enough to hit a random
specimen, and mechanically fixable puts it high.

### 4. A chunk whose stored checksum does not match its bytes

**Evidence.** A WAD's TOC carries a checksum per chunk, computed over the **compressed** bytes with
XXH3-64 — `ltk_wad-0.5.4/src/builder.rs:130`, and `EncodedChunk::new` recomputes rather than accepts
one "so a caller cannot pass on a value some container claimed" (`rebase.rs:177-180`). A mismatch is
not graceful: League "kills the process over a chunk whose checksum disagrees with its content"
(`X:\dev\league-mod\crates\ltk_overlay\src\wad_builder.rs:131-134`), and the overlay writer verifies
its own output against the source value before adopting stored bytes
(`wad_builder.rs:211-215`).

This matters here because ADR-0005 has a repair rewrite the archive **in place**. A writer that ever
updated a chunk's bytes and not its checksum, or the reverse, would turn a repaired mod into a hard
crash — and it would crash the moment that chunk is first read, which for an ability-only asset is
at cast time. That is the same symptom section 6 opens with.

**Detected today.** No. Verifying all 10,574 chunks across the five archives read for this document
found zero mismatches, so nothing is wrong now.

**Repairable.** Yes, trivially and offline: recompute XXH3-64 over the stored bytes and compare, then
rewrite the TOC entry. `wad/chunk-checksum` is fully verifiable without the game, without the
hashtables, and without decompressing anything — it reads the compressed bytes as they lie. It is
the cheapest safety net in the document and the one that most directly guards the repair path.

### 5. The linked-bin check's same-WAD restriction

**Evidence.** Section 7, in full. `linked_bins.rs:80-86` requires a link to resolve inside the WAD
the declaring bin was routed to, and vanilla itself has 14 links that do not, out of 131,471.

**Detected today.** It _is_ the detection, and that is the problem — it reports a healthy mod as
broken through a modal dialog before launch.

**Repairable.** This is the only entry in the list that is a bug in existing code rather than a
missing check, so "repairable" means fixing the check: resolve against the union of non-blocked
overlay WADs. Small, and it removes a false alarm every localized-WAD mod will hit.

### 6. A bin naming a linked file that is not in the same WAD

**Evidence.** The game resolves a bin's linked paths against the WAD the bin is mounted from, and
a miss yields `STATUS_NOT_FOUND` (`c0000225`) — `X:\dev\league-mod\crates\ltk_overlay\src\linked_bins.rs:1-6`.
This is the one defect class in this note with a documented crash code behind it.

**Detected today, and it is the best-developed check in the stack.**
`collect_linked_bin_offenders` (`linked_bins.rs:54-107`) parses each override bin's linked-files
list (`parse_linked_bins` at `:118-155` — optional `PTCH` header, then `PROP`, then for
`version >= 2` a `u32` count and that many length-prefixed strings, capped at `MAX_LINKED_FILES =
100_000` at `:28`), hashes each link, and considers it present only if the same overlay WAD
provides it — either from another override routed there, or from that WAD's own original chunks
(`:76-86`). The scope is strictly per-WAD, and a dependency living only in a _different_ WAD is
flagged, which is what `dependency_in_other_wad_is_flagged` (`linked_bins.rs:349-375`) pins. It
runs after blocked WADs are removed, so a blocked WAD is neither validated nor counted
(`:52-53`, called from `builder/mod.rs:816-817`).

The manager surfaces it as `LinkedBinOffenderInfo`
(`crates/ltk-manager-core/src/mods/analysis/linked_bins.rs:19-29`), in memory only and replaced
wholesale on each build because offender status depends on the whole enabled set rather than on
one mod (`linked_bins.rs:1-7`). It reaches the user as a badge
(`src/modules/library/components/MissingDepsBadge.tsx:24-31`) and a pre-launch dialog
(`src/modules/patcher/components/LinkedBinWarningDialog.tsx`), gated on
`config.linked_bin_check_enabled` (`crates/ltk-manager-core/src/config.rs:84`).

**Repairable.** Partially, and nobody has tried. Where the missing link is a chunk the mod itself
ships in a _different_ WAD, the fix is to route a copy — the same fan-out `route_targets` already
does for a hash the game owns, applied to a hash only the mod owns. Where the link names a chunk
nothing has, it is a genuine authoring error and only a report is possible.

`PROJECT_PROBLEMS.md:120` lists `bin/missing-link` as a proposed rule and this is the check it
means. Moving it onto the engine would give it a site, a severity and a place in the verdict,
which the badge does not have — the badge is a count.

### 7. A `Hash` no table names, at scale

**Evidence.** 995 unrepairable `VfxAssetRemap.oldAsset` findings in one specimen, out of 3,805.

**Detected today.** Yes, and it is the one thing the rule says it cannot fix
(`unfixable_description` at `mod.rs:87-89`, the sentence at `mod.rs:1109-1114`).

**Repairable.** Not by the manager alone. But it is worth noting where the names could come
from: `VfxAssetRemap.newAsset` is still a `String` and stays one — it is one of many path-bearing
`String` fields the migration left alone — so a remap
object frequently holds the plaintext path of its own _new_ asset beside the unnamed hash of
the old one. A harvest pass over the mod's own bins that hashes every `String` path it finds
with FNV1a32 and writes the pairs into the mod's `hashes/game.hashes.txt` would name a share of
them for free. **Unverified** what share, and it is measurable on this specimen.

### 8. An override the build drops entirely

**Evidence.** `distribute_override_hashes` counts overrides that hash-matched no game WAD and had
no fallback target, and warns that "that mod content will not appear in-game" —
`X:\dev\league-mod\crates\ltk_overlay\src\builder\resolve.rs:344-350`. It happens when the mod's
declared WAD name is unknown to the game _and_ its chunks overlap nothing, so
`resolve_fallback_wad` returns `FallbackTargets::default()` (`builder/metadata.rs:242-251`) and
`route_targets` comes back empty (`builder/mod.rs:154-177`). This is the one routing case where
content silently vanishes.

**Detected today.** Only as a `tracing::warn!` in the log. No verdict, no badge, no report. The
`ModWadReport` the manager persists carries the WADs that _were_ reached and says nothing about
the count that was not, because `from_meta` sums `route_targets` and an empty result contributes
nothing (`builder/mod.rs:435-450`).

**Repairable.** Not by rewriting, and it does not need to be. `ModWadReport` already knows
`override_count` and could carry a dropped count beside it — the routing is computed once and the
number is a subtraction. Reporting it turns a mod that silently does nothing into a mod with a
sentence. **Zero of the three specimens hit it**, because all three had either a known WAD name or
an overlap, so the frequency is **unverified**.

### 9. Shipping an unmodified vanilla asset

**Evidence.** Section 6. "Sett flowerly" ships
`assets/characters/ziggs/skins/skin24/ziggs_skin24_tx_cm.tex` byte-identical to the game's copy.
Because that one path hash is owned by `Ziggs.wad.client`, the build produces a **73,854,706-byte**
overlay of an unrelated champion whose 2,047 chunks are 2,046 byte-equal to vanilla. Across the
whole mod, only 6 of 593 chunks are byte-identical to vanilla, so this is a few strays rather than
a whole vanilla archive — but a single stray is enough to drag in a WAD.

**Detected today.** No. The token `vanilla` appears nowhere in the codebase.
`ScanStatus::BaseWad` ("the game's own copy of the archive") exists as a runtime scan verdict from
the game (`crates/ltk-manager-core/src/diagnostics/incident.rs:1119-1126`), reported after a crash
rather than before a launch.

**Repairable.** Yes, and cleanly: compare each chunk's decompressed bytes against the installed
game's copy at the same path hash and drop the ones that match. That is the same
`find_wads_with_hash` lookup classes 8 and 13 need, plus one comparison. It costs nothing at
runtime and it removes whole overlay WADs.

### 10. A ritobin text dump shipped instead of a compiled bin

**Evidence.** Ten chunks in `flowery_sett` identify as no known League format and begin with the
ASCII bytes `#PROP_text.versi…` — ritobin's human-readable text form, not the binary `PROP` the game
reads. They are 1.9 MB to 3.0 MB each and **23,925,344 bytes in total, 16% of the archive's
uncompressed size**. No path in any table resolves them.

The mod ships them alongside 101 real binary bins, so this is a packaging accident: the author left
the editable text form in the WAD next to the compiled output.

**Detected today.** No. `ltk_file` classifies by magic and `#PROP_text` is not in its table, so it
returns `Unknown`, which every surface treats as "some file we do not have a preview for" rather
than as a defect.

**Repairable.** Yes, by dropping them. They cannot be what any chunk hash is expected to hold,
because the game's reader requires the `PROP` magic. The safer framing is a report: 24 MB of an
archive being an editor artifact is worth telling the author about even if nothing crashes. **Whether
any of the ten sits at a path hash the game would look up is unverified** — if one does, the game
gets a bin whose magic fails and the entry is dropped rather than crashing.

### 11. A raw chunk whose two sizes disagree

**Evidence.** A `None`-compressed chunk's `uncompressed_size` is the length of its own bytes, and
"a TOC where the two disagree makes the client read past the buffer it allocated for the chunk" —
`ltk_wad-0.5.4/src/rebase.rs:170-176`. There is no bounds check on that path, so the overread is the
difference between the two fields.

**Detected today.** No. Measured clean here: the mod ships 15 raw chunks and the built overlay 18,
14 and 17 in the other two archives, and **none of the 49 has mismatched sizes**.

**Repairable.** Yes — set `uncompressed_size` to the actual byte length. One comparison to detect and
one assignment to fix, and it belongs beside class A because both are TOC-consistency checks a
writer can get wrong.

### 12. One path written into two WADs with different bytes

**Evidence.** Section 7. The fan-out writes shared chunks into every WAD that owns the path, and
League validates such a chunk by its compressed checksum across WADs
(`ltk_overlay/src/wad_builder.rs:59-62`), killing the process on disagreement (`:131-134`). On the
build measured here the overlay's two Sett archives share 584 path hashes and all 584 checksums
agree, so nothing is wrong today.

**Detected today.** No, and it is currently prevented by construction rather than by a check: the
builder compresses once and shares one `EncodedChunk` instead of relying on the compressor being
deterministic.

**Repairable.** Not a repair — a build-time assertion. Comparing the checksum of every path written
to more than one overlay WAD costs a hash map and turns a latent process-kill into a build error.

### 13. A chunk in the wrong archive

Ranked here rather than first because it is the complaint that started this and the answer is
that it is not a defect the manager has to fix.

**Evidence.** Riot's locale-segment invariant is exact over 182 WADs and 2,103 chunks (section 3).
"Sett flowerly" violates it for 78 named chunks and ships one `Ziggs.wad.client` chunk,
"Megumin - Kaisa" puts three `/en_US/` VO files in an unlocalized WAD, "Spirit Blossom Rift" ships
a WAD name the game does not have.

**Detected today.** Not reported, but **already handled**. `route_targets` fans each chunk to
every game WAD owning its hash, `find_best_matching_wad` rebases an unknown WAD name by overlap,
and `resolve_unlocalized_wad` adds the unlocalized sibling for a declared localized name. The
persisted `wad-reports.json` on this machine shows all three specimens routed correctly.

**Repairable.** The question does not arise — the build re-derives the placement every time
against the install the user has, which is strictly better than baking a guess into the archive.
What is worth building is the report: a rule saying, per chunk, which archive it will land in.
That is one `find_wads_with_hash` per chunk against an index the manager could hold for the cost
of an `Arc`.

The one case the build still gets by fallback rather than by evidence is a `/en_US/` path in an
unlocalized WAD whose hash matches nothing — the Kaisa VO. It goes to `Kaisa.wad.client` and gets
no localized sibling, because `resolve_unlocalized_wad` only runs for a WAD name carrying a locale
tag (`metadata.rs:263-296`). **Unverified** whether the game reads a VO bank out of an unlocalized
archive, and it is the one place where the locale-segment invariant could still earn a rule.

### 14. A `PTCH` bin anywhere in a mod

**Evidence.** `ltk_meta` cannot write one — `todo!()` at `write.rs:38`. The manager therefore
raises every `PTCH` finding with no fix (`mod.rs:193-198`, `mod.rs:385`) and prints "An override
bin cannot be repaired here" (`mod.rs:1124-1126`). Riot ships `PTCH` layers of their own, patch records use the
same tag vocabulary as ordinary properties, and a patch layer written against the old types drops
exactly the way a full bin does.

**Detected today.** Partially — a `PTCH` with a migration finding is reported unrepairable. A
`PTCH` with any other defect is invisible.

**Repairable.** Not until `ltk_meta` grows a `PTCH` writer. Two extra constraints that writer
would have to honour and that are worth recording now: the inner `PROP` must be version exactly
3 and must declare **no dependencies**, because the client reads the dependency count and never
skips the strings behind it.

**Zero of the three specimens ship a `PTCH`**, so this may be rarer in the wild than its
prominence in the code suggests.

### 15. A bin `ltk_meta` refuses and the game accepts

**Evidence.** The client never reads a complex value's byte size on the parse path and trusts
the count. `ltk_meta` measures every region and returns `InvalidSize`
(`values/struct.rs:99-101`, `container.rs:253-255`, `map.rs:204-206`). A hand-authored or tool-mangled bin with a wrong
size and a right count therefore loads in-game and cannot be read by the manager.

**Detected today.** As a `report.failure`, not a problem (`mod.rs:157`). The run does not fail
as a whole, but the user is told a rule could not finish rather than what is wrong.

**Repairable.** Yes, and easily: parse, re-serialize, and `ltk_meta`'s writer back-patches
correct sizes. The obstacle is that the parse is what failed. A recovery reader that trusts
counts over sizes would be a second bin parser, which `PROJECT_PROBLEMS.md` puts explicitly out
of scope. **Unverified** how often this happens — zero occurrences across the 724 bins in the
three specimens.

### 16. Cross-champion and cross-map strays

**Evidence.** One `Ziggs.wad.client` chunk inside a Sett mod. Two map-WAD chunks inside a Kaisa
mod. Both measured.

**Detected today.** No. `skinhackCheck.ts` (`src/modules/library/utils/skinhackCheck.ts:1-31`)
is an author and description blocklist, pure string matching against two names, and the runtime
`ScanStatus::Skinhack` (`crates/ltk-manager-core/src/diagnostics/incident.rs:1110-1129`) is the
game's own scan reported after a crash. Neither inspects content.

**Repairable.** Nothing to repair — `route_targets` already sends the Ziggs chunk into
`Ziggs.wad.client`, and `wad-reports.json` records that it did. The value is entirely in the
_report_: "this Sett mod also writes into Ziggs" is a sentence a user can act on, the manager
already computes it at install, and no surface says it.

### 17. A `PROP` version 1 bin

**Evidence.** The client requires version 2 or 3 and refuses version 1 outright and silently.
That gate has been unchanged for many patches. `ltk_meta` accepts `1..=3`
(`ltk_meta-0.6.1/src/tree/read.rs:53-57`).

**Detected today.** No. `bin.version` is read and never checked by any rule.

**Repairable.** Trivially — `Bin::to_writer` always writes version 3
(`ltk_meta-0.6.1/src/tree/write.rs:8-12`). A one-line rule and a free fix. None of the three
specimens has one (all 724 of their bins are version 3), so **the frequency is unmeasured** and
may be near zero. Cheap enough to be worth it anyway.

### 18. A chunk that hashes to nothing known

**Evidence.** 505 of 593 chunks in "Sett flowerly", 342 of 428 in "Megumin - Kaisa", 324 of 580
in "Spirit Blossom Rift", against the mimir `game` table alone. Some of that is recoverable: the
manager's own harvest at import recorded `namesAdded: 339, unharvestable: 166` for
`sett-flowerly` in `library.json`, so the archive's own files named most of them and the number
that is genuinely nameless is 166, not 505.

This is normal for a mod shipping its own assets under new paths, so it is not by itself a defect.

**Detected today.** Partially. A nameless chunk gets `hex_name(chunk.path_hash)` as its path and
its kind sniffed from magic (`crates/ltk-manager-core/src/problems/engine/archive.rs:299-322`),
and the frontend sorts hex names last (`src/modules/workshop/utils/contentTree.ts:117-127`).
`PROJECT_PROBLEMS.md` names `wad/unknown-path` as a proposed rule that does not exist.

**Repairable.** Not as such. The defect underneath it is the orphan: a chunk nothing points at.
Collecting every `File` and `String` path from the mod's own bins, hashing them, and subtracting
from the WAD's chunk set is the other half of class 6 and finds dead weight rather than crashes.
**Unverified** — I did not run that cross-reference.

### 19. Re-compressing a vanilla `ZstdMulti` chunk as plain `Zstd`

**Evidence.** Section 6, observed rather than theorized. The Ziggs texture is `ZstdMulti` in the
game and `Zstd` in the mod and in the built overlay, which is the only reason the overlay's copy
differs from vanilla at all. `SubchunkToc::subchunks_of` returns `None` for a chunk that is not
`ZstdMulti` (`ltk_wad-0.5.4/src/subchunk.rs:72-79`), so `Wad::load_subchunks` — the partial-mip
read the crate root documents — has nothing to work with once a texture is re-compressed.

Neither writer in this stack can produce `ZstdMulti`: `ltk_wad`'s builder returns
`UnsupportedCompressionType` (`ltk_wad-0.5.4/src/builder.rs:236-238`), `ltk_fantome`'s delta path
refuses a subchunked body (`X:\dev\league-mod\crates\ltk_fantome\src\delta.rs:281-294`), and
`ltk_overlay`'s pass-through refuses it because the table lives in the source WAD
(`wad_builder.rs:270-282`). So any tool that unpacks a vanilla texture and repacks it loses the
subchunking, permanently.

**Detected today.** No.

**Repairable.** Only by not shipping the chunk at all, which is class 9's fix — and for a chunk the
mod genuinely modified, not at all, because nothing here can write `ZstdMulti` back.
**Whether losing the partial-mip path costs anything visible in-game is unverified.**

### 20. Duplicate bytes under many path hashes

**Evidence.** 51 groups covering 122 chunks in "Sett flowerly", 22 groups covering 54 files in
"Megumin - Kaisa", 2 groups in "Spirit Blossom Rift". Riot does it too — 244 repeated-checksum
groups in `Sett.wad.client`.

**Detected today.** No. `WadChunks::from_iter` (`ltk_wad-0.5.4/src/chunks.rs:22-33`) sorts by
path hash and builds a `HashMap<WadHash, usize>` index, so a genuine duplicate _path hash_ would
keep both entries in the vector while `get` reached only one. Zero occurrences measured, so the
condition is theoretical.

**Repairable.** Low value. cslol dedups on both read and write, `ltk_wad`'s builder does not
(`ltk_wad-0.5.4/src/builder.rs:97-152` writes every chunk's bytes). Worth an `Info` at most.

### 21. `ltk_fantome` does not recognize a backslash-spelled `WAD\` prefix

**Evidence.** `strip_prefix_ci` compares against the literal `"WAD/"`, `"RAW/"` and
`"META/hashes/"` (`X:\dev\league-mod\crates\ltk_fantome\src\reader.rs:746-750`, call sites at
`:661`, `:674`, `:678`), while `is_contained` splits on both separators for its `..` scan
(`reader.rs:737-739`). So backslashes are separators for safety and not for classification. An
entry spelled `WAD\Aatrox.wad.client` classifies as `None`, is placed nowhere on extraction, and
is raw-copied by normalize. There is no test either way.

**Detected today.** No — the entry is silently skipped, which is the worst shape for this.

**Repairable.** Yes, in `ltk_fantome`, by making `classify_entry` separator-agnostic the way
`is_contained` already is. Zero backslash entries across the three specimens, so **the frequency
is unmeasured**.

### 22. Subchunked chunks, and the SubChunkTOC

**Evidence.** `ZstdMulti` needs the archive's subchunk table, discovered by shape rather than by
name (`ltk_wad-0.5.4/src/subchunk.rs:104-140`), and `SubchunkToc::covers` validates that every
`ZstdMulti` chunk's records sum to its own sizes (`subchunk.rs:82-101`). `ltk_wad`'s builder
cannot write `ZstdMulti` at all — `UnsupportedCompressionType` at `builder.rs:236-238` — and
`ltk_fantome`'s delta path refuses a subchunked body outright
(`X:\dev\league-mod\crates\ltk_fantome\src\delta.rs:281-294`). `ltk_overlay`'s pass-through
refuses it for the same reason, that the subchunk table lives in the source WAD
(`wad_builder.rs:270-282`).

**Detected today, in the one form that matters.** `GameIndex` computes the `.wad.SubChunkTOC` path
hash for every game WAD and keeps a `subchunktoc_blocked` set, and mod overrides matching those
hashes are stripped during the build — `X:\dev\league-mod\crates\ltk_overlay\src\game_index.rs:81-85`.
So a mod cannot corrupt the game's subchunk loading even by shipping the table. The manager itself
names `subchunk_toc` in exactly one place, to sniff a chunk's magic
(`crates/ltk-manager-core/src/problems/engine/archive.rs:357`).

**Repairable.** Not applicable in practice. **Zero `ZstdMulti` chunks across all three
specimens** — the game uses them heavily (1,696 of 2,689 chunks in `Sett.wad.client`) and mods do
not, because no writer in this stack emits them. The theoretical cost is the reverse: a mod that
re-packed a vanilla `ZstdMulti` chunk as plain `Zstd` costs the game its partial-mip read path.
**Unverified** whether that matters in-game.

### 23. Audio bank references pointing at ids the bank does not hold

Nothing in this stack parses a `.bnk` or a `.wpk` beyond the four magic bytes. `WwiseBank` and
`WwisePackage` are file-kind labels
(`crates/ltk-manager-core/src/workshop/content.rs:70-71`) and nothing else. So this class is
**entirely unverified** and would need a Wwise bank parser before it could be checked. Recorded
because the question was asked, not because there is evidence for it.

## 9. Where this contradicts what is already written

Four places, flagged per `docs/agents/domain.md`.

**The rule's own header overstates the game's reaction.** `bin_property_type/mod.rs:1-7` says "a
mod that ships the old type is a mod the game rejects". The client silently drops the property
and reports success. `PROJECT_PROBLEMS.md`'s severity table says `Fatal` means "The game crashes
on this", and `severity()` (`mod.rs:1073-1080`) assigns `Fatal` to every live finding of this
rule. Nothing here argues for changing the severity — a dropped texture override is a mod that
does not work, which is what a user cares about — but the sentence a user reads should not
promise a crash the client does not produce.

**A healthy verdict is not a claim that the mod works.** `ModHealthVerdict::from_run`
(`crates/ltk-manager-core/src/mods/health.rs:401-426`) reads `Healthy` off a run with zero live
problems, and with one rule installed that means "the one thing we check is fine". Section 6 has a
mod that crashes the game carrying that word. `MOD_HEALTH.md` should say what the badge is a claim
about, because a user reads `healthy` as "safe to play".

**The premise that a localized-WAD mod is broken does not survive the evidence.** `ltk_overlay`
0.9.5 routes each chunk to every game WAD owning its hash, rebases an unknown WAD name by overlap,
and adds the unlocalized sibling for a declared localized name. `wad-reports.json` on this machine
records all three specimens routed correctly. Any plan that describes a WAD split as the fix is
describing work already done elsewhere, and doing it a second time at import would bake a guess
where the build derives an answer.

**ADR-0005's "a repair that applies nothing must not repack" is load-bearing for any rule that
moves bytes.** Moving a chunk between two archives inside one mod is not a property rewrite, it
changes which file a chunk lives in, and it is not idempotent the way the shipped rules are.
ADR-0005's clause about a rule that would lose something asking before writing is the governing
text, and it is one more reason the routing rule should report rather than write.

**ADR-0008 names the follow-up this work lands next to.** "A permanently unreadable archive — a
truly corrupt file — is retried and fails identically every launch, with only a log line of
detail. Routing that case into the health-verdict system is the agreed follow-up." Class 15 above
is the same shape from the other side: a bin the manager cannot read inside an archive it can.

## 10. Open questions for the maintainer

1. **Should the manager hold upstream's `GameIndex`?** `ltk_overlay::GameIndex::hash_index` and
   `load_or_build` are both `pub`, the index is disk-cached at
   `{storage}/profiles/{slug}/game_index.bin` with a fingerprint, and it is TOC-only to build.
   Holding an `Arc` of it beside the existing browser index, invalidated where
   `refresh_game_index` already invalidates, is what would let a rule answer "which archive will
   this chunk land in?" without a whole-mod `analyze_single_mod`. That is the enabling change for
   classes 8, 9, 13 and 16.
2. **Should `ModWadReport` carry the dropped count?** The routing is computed once and the number
   is a subtraction. It turns class 8 from a log line into a fact a verdict can hold.
3. **Answered. A `ResourceResolver` miss can crash, depending on the call site.** Not on the key,
   which is what makes it awkward: the same absent key is fatal from one caller and harmless from
   another, and the callers are outside every bin. So class 1 is `Fatal` for the whole class, a
   per-key severity is not computable, and the repair has to restore every key rather than the
   ones that look dangerous. Section 6 carries what that rules out.
4. **Does a `{key}` map subscript resolve in a live client?** The `PTCH` patch record that a
   resolver rebind would need is `resourceMap{"Sett_R_AoE"}`, and the map subscript is the one
   branch of the path grammar no shipped record exercises — zero of 23,047, inferred from the
   client's own header rather than observed. One patch file with one record answers it, and it
   decides whether a mod can ever ship this as a delta instead of the manager merging it at build
   time.
5. **Is the linked-bin same-WAD restriction worth fixing before anything else here?** It is the
   only entry in the ranked list that is a bug in shipped code, it fires on every mod that declares
   bins inside a localized WAD, and section 7 shows vanilla itself violating the premise 14 times.
   The change is small and the union it should test against already exists post-blocklist.
6. **Should the linked-bin check become a rule?** It has a site, a severity and a plausible fix,
   it is the only class in this note with a documented crash code, and `PROJECT_PROBLEMS.md`
   already reserves `bin/missing-link` for it. Today it is a count on a badge and a pre-launch
   dialog, and it never reaches a health verdict.
7. **Is the `VfxAssetRemap` harvest worth measuring?** Whether `newAsset`'s surviving plaintext
   paths name a useful share of the 995 unresolved `oldAsset` hashes is one afternoon on the
   specimen, and it decides whether class 7's worst case has a floor.
8. **Does a `PROP` version 1 bin exist in the wild?** Zero across 724 specimen bins. Worth one
   pass over a mod corpus before building a rule for something the game silently refuses.
9. **Should a bin `ltk_meta` cannot read be a problem rather than a rule failure?** Today it is a
   `RuleFailure`, which reads as "the manager broke" rather than "the mod is malformed" — and per
   the size-versus-count asymmetry the game may well load it.
10. **Is the doubling worth avoiding?** A chunk that matches no game WAD is written into both the
    declared localized WAD and its unlocalized sibling. For "Sett flowerly" that is 505 chunks
    twice. It is correct and it is not free.

11. **Is the `soundbank_id == 0` rule worth shipping on its own?** It is 16 bytes per `.bnk`, zero
    false positives against 7,829 shipped banks, and it is unrepairable by construction — so it is a
    pure-report rule. That makes it the cheapest thing in this document to build and the first test
    of whether the Problems panel is a good home for a finding no fix can clear.

12. **Does losing the subchunking of an overridden texture cost anything in-game?** Any chunk a mod
    overrides that was `ZstdMulti` in vanilla comes out `Zstd`, because no writer in this stack can
    emit type 4. The archive stays valid and the surviving type-4 entries stay consistent with their
    table, so the only loss is the partial-mip read path. Whether that shows up as a pop-in, a
    memory cost, or nothing at all is **unverified**, and it decides whether class 19 is worth more
    than an `Info`.

13. **May a repair merge a mod into the installed game's copy rather than replacing it?** The
    question was first written as whether a repair may _pull_ content out of the game into a mod,
    and the measurement in section 6 changed its shape: a merge reaches the whole class without
    copying anything, so provenance and patch staleness stop being questions and the result
    recomputes on every build. What remains ADR-shaped is that the output now depends on the
    installed game, which is a property no repair has had before. `015-game-as-parts-source` holds
    it, and it is not decided here.
14. **Should a second rule table exist for renames and missing fields?** The shape of
    `bin/property-type` cannot reach either, and a rename is the likelier of the two to land on a
    live patch. A `(class, from_field) -> to_field` table and a `(class, path, field, value)`
    ensure-table are both small, and both are checkable the same way the current rule is.
