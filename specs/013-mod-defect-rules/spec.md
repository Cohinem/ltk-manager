# Feature Specification: Rules for the defects that actually break mods

**Feature Branch**: `013-mod-defect-rules`
**Created**: 2026-08-30
**Status**: Draft
**Input**: Investigation of the mod autofixer's mixed results after its first release, recorded in `docs/plans/mod-autofixer-gaps.md`.

## Problem Statement

A mod user installs a skin, the manager checks it, the badge says nothing is wrong, and the game
crashes anyway.

That is not a hypothetical. One mod in the library carries the verdict `healthy`, `fixable: 0`,
zero findings at every severity, and it is reported to kill the game on one ability cast. The
verdict is not stale and the engine is not broken. The log records the repair running at install
and applying every fix it derived: 101 files, 1,073 applied, 0 skipped, 0 left. **The repair did
its entire job, recorded an honest verdict, and the mod still breaks the game.**

The reason is that the one rule that exists looks for a thing that does not crash. A property whose
declared type is not the one the game reads is skipped by the reader, which then returns success.
Riot ships tens of thousands of such dropped values every patch on purpose. So `bin/property-type`
describes a mod that silently does not work, which is worth knowing, but it is not the class that
takes the game down. Every defect measured in the specimens that plausibly does take the game down
is invisible to every rule the manager ships.

A verdict of `healthy` on a mod that crashes is worse than no verdict at all. It is the one thing a
check must never say wrongly, because the user acts on it — they keep the mod enabled and go
looking for the problem somewhere else.

## Solution

Add the rules that see the defects we measured, so a mod that will break the game says so before it
does.

Every rule here was derived by measuring real mods against a real install, not by reasoning about
what might go wrong. Each one names a state we found in a shipped mod, and each states plainly
whether a machine can repair it. Several cannot be repaired at all, and that is a useful answer:
`unrepairable` sends the user to look for a different version of the mod, which is exactly what
Mod health exists to tell them.

The rules divide into two groups by what they read:

**Content rules** read a file's bytes and judge them against what the game accepts. These work
identically for a `project` mod and an `archive` mod, because the existing seam already hides that
difference.

**Archive rules** read facts that only a packed WAD has — its stored checksums, its compression
types, its recorded sizes. These report nothing on a directory-backed layer, in the same way a
dormant rule reports nothing on a project the change has not reached.

One correction runs through all of it: **a file's kind comes from its content, never its
extension.** A chunk whose path no hashtable names is written under sixteen hex digits and has no
extension at all. A scan of one specimen by extension found 167 textures. The same scan by content
magic found 260. The 93 it missed included the only defective one.

## User Stories

1. As a mod user, I want a mod that will crash my game to carry a warning badge, so that I stop
   guessing which of my mods is at fault.
2. As a mod user, I want a mod whose defect no machine can repair to say so plainly, so that I go
   and find a different version instead of pressing Repair and hoping.
3. As a mod user, I want a check to keep saying `healthy` only when it has actually looked for the
   things that break games, so that the word means something.
4. As a mod user, I want the rules that find crashes to run at import without me asking, so that I
   learn about a bad mod before I play rather than after.
5. As a mod user, I want Repair all to fix everything fixable in one press and tell me plainly what
   it could not reach, so that I know where I still stand.
6. As a modder, I want a shipped audio bank with an unset soundbank id to be reported, so that I
   find out before my users do.
7. As a modder, I want a texture whose dimensions are not block-aligned to be reported with its
   size and format, so that I can re-export it correctly.
8. As a modder, I want a bin I accidentally shipped as a ritobin text dump instead of a compiled bin
   to be reported, so that I do not ship megabytes the game cannot read.
9. As a modder, I want a rule to name the file by the path I recognise where a hashtable can name
   it, and by its chunk hash where none can, so that the site I read is the file I go and fix.
10. As a modder, I want the Problems panel to group these findings the same way it groups the
    existing ones, so that a new rule is a row and not a new panel to learn.
11. As a modder, I want a rule to tell me which of its findings a repair will not reach before I
    press Repair, so that I am not surprised by what is left afterwards.
12. As a modder, I want a rule that reads an archive-only fact to stay silent on my unpacked
    project rather than reporting a false finding, so that the panel stays trustworthy.
13. As a mod user, I want a mod whose archive is internally inconsistent — a stored checksum that
    does not match its bytes — to be caught before the game reads that chunk, so that a repaired
    mod never becomes a hard crash.
14. As a modder, I want a raw chunk whose recorded sizes disagree to be reported, so that I do not
    ship a chunk that hands the consumer a heap overread.
15. As a maintainer, I want each new rule to carry a stable id in the existing two-part form, so
    that a user can search for what they were told.
16. As a maintainer, I want a rule's cost measured against the largest specimen we have, so that
    adding rules does not make the check too slow to run at import.
17. As a maintainer, I want the rules that found nothing in our specimens to still ship, so that
    the preventive ones are in place before a mod trips them.
18. As a mod user, I want the health sweep to re-check my library when a release adds rules, so
    that new rules reach mods I installed before them.

## Requirements

### Functional Requirements

**The seam**

- `ProjectFile` gains the facts a packed chunk carries — its compression type, its stored
  compressed and uncompressed sizes, and its stored checksum — present for an archive-backed layer
  and absent for a directory-backed one.
- `ProjectFiles` gains an accessor over every file, mirroring the existing bin accessor, so a rule
  can read any file rather than only a bin.
- A file's kind is decided by content magic. Extension is a hint and never the decision.
- Both additions sit inside the existing seam. No rule learns whether it is reading a directory or
  an archive.

**The rules**

- `audio/bank-version` reports a bank the installed game's reader will not load, which is a version
  below the floor that reader accepts, or an older version carrying more than media.
- `tex/block-alignment` reports a block-compressed texture whose width or height is not a multiple
  of four, naming both dimensions and the format, and repairs it by resampling down to the nearest
  valid size.
- `bin/text-dump` reports a file shipped as a ritobin text dump where a compiled bin is expected.
- `bin/resolver-key-loss` reports a resource resolver that defines materially fewer keys than the
  game's object at the same path. Reports only, and does not repair.
- `wad/chunk-checksum` reports a chunk whose stored checksum does not match its stored bytes.
- `wad/raw-size` reports an uncompressed chunk whose stored compressed and uncompressed sizes
  disagree.
- `wad/inconsistent` reports one path hash carrying different bytes in two archives that
  will both be mounted.
- Every rule states, through the existing unfixable description, which of its findings a repair does
  not reach.

**Behaviour**

- A rule that reads an archive-only fact reports nothing on a directory-backed layer.
- These rules run inside the existing run, under the existing budget, and produce the existing
  finding shape.
- A finding names its site by resolved path where the hashtable cache can name it, and by chunk
  hash where it cannot.
- Adding these rules moves the manager version in the **basis**, so the health sweep makes every
  stored verdict due again on the release that adds them.

### Key Entities

- **Chunk info** — what a packed chunk records about itself: compression type, compressed size,
  uncompressed size, stored checksum. Absent for a file in a directory-backed layer.
- **File handle** — a rule's view of one file in one layer, the non-bin counterpart of the existing
  bin handle.
- **Bank header** — the leading bytes of an audio bank, carrying its version and soundbank id.
- **Texture header** — the leading bytes of a texture, carrying its dimensions and format.

## Implementation Decisions

- **One seam, extended, not a second one.** `LayerSource` already documents itself as the seam
  between which files a run sees and what a file's bytes are. Archive facts are carried on
  `ProjectFile` beside the existing chunk hash rather than through a parallel archive-report type.
  A second finding shape would contradict the Problems goal that a new check is a rule and a row
  and never a new panel.
- **Content magic decides kind.** Measured: 260 textures by magic against 167 by extension in one
  specimen, and the single defective texture was among the 93 that extension missed. Any rule
  keying on extension is wrong by construction, because a chunk no hashtable names has none.
- **There is no bank-id rule, and the reason is worth keeping.** A bank header carries a soundbank
  id, no shipped bank has it set to zero, and 44 of 179 banks across 161 community mods do. Two
  independent tools treat that as a defect, and so did a draft of this spec, which went as far as
  deriving the correct value: the id is the 32-bit FNV-1 hash of the bank's own file name, matching
  for all 345 banks measured across every champion archive. It was wrong. The engine reads that
  field in exactly one function, which nothing calls, and takes a bank's identity from the request
  instead. The game ships 18 banks whose id does not match their name and they work. An invariant
  in shipped data is not evidence that departing from it breaks anything, and this is the case that
  proves it.
- **The audio rule keys on what the reader actually gates.** A bank's version matters only in
  combination with what the bank contains, so the predicate is both. Version alone would fire on 97
  of 179 corpus banks and be wrong about 57 of them.
- **The bank version bound is written down, and the predicate only judges downwards.** Reading the
  reader's current version off the install means scanning archives until a current bank turns up,
  because the game ships 836 legacy media-only banks a small sample could land entirely inside. That
  is seconds of work to learn a number that moves twice a year. The constants are safe only because
  a bank at or above the known-current version is never reported: a ceiling read naively would call
  every newly-authored bank defective on the release after Riot bumps the version, which is a false
  positive on a health check and the one thing this spec exists to prevent. Judged downwards, a
  stale constant goes quiet instead. What it costs is the mod authored against a newer Wwise than
  the player's game, which no rule here sees.
- **A rejected bank is repaired by removal, not by rewriting it.** An overlay archive is the game's
  archive with the mod layered over it, so removing a mod's bank leaves the game's own bank rather
  than a hole. 15 of 17 rejected banks sit at a path the game holds, 14 of those ship their media
  bank as well, and the one case measured end to end matches the game's media ids exactly — so the
  removal lets the mod's own sounds play through the game's events. The two the game does not back
  are left alone, because a request that finds no file anywhere is the class the diagnostics table
  calls a crash. That is `013-012`, held out of this release by the repair path having no removal.
- **The texture repair loses fidelity, deliberately.** A block-compressed texture admits no in-place
  correction, so the fix decodes and re-encodes, which degrades content it did not need to touch.
  That is a first for this codebase and it narrows a promise ADR-0006 made — see ADR-0011.
- **The resolver rule reports before it repairs, if it ever does.** A skin mod that deliberately
  collapses every skin onto one look legitimately drops per-skin keys, so a raw count is an upper
  bound on a defect rather than a defect count. A missing key degrades to a placeholder effect and
  a log line rather than crashing. If a repair is added later, the safe form is to restore only
  those keys whose target still resolves in the merged view, because restoring a key whose target
  the mod deleted trades a clean miss for a dangling link.
- **The archive rules do not ship, and finding nothing is why.** All 10,574 chunks across five
  archives passed the checksum and raw-size checks. The case for shipping them anyway was
  preventive: a repair rewrites an archive in place, so a writer that ever recomputes bytes without
  their checksum turns a repaired mod into a crash at the moment that chunk is first read, which
  for an ability-only asset is at cast time. That case survives - what did not is the idea that a
  per-mod check is where to make it. The writer is the manager's own, so the assertion belongs
  beside the write, in the overlay build over the tables of contents it just produced.
- **The specimen corpus is part of the deliverable.** Three mods with known defects, plus the
  measurements taken against a real install, are what these rules were derived from and what they
  are tested against.
- **Version 3 is the only version written, and that is deliberate.** `ltk_meta` reads a bin at
  versions 1 through 3 and always writes 3, and the version gates only whether the header carries a
  dependency list — object bodies are byte-identical across all three. An older bin read and written
  back is therefore lifted rather than damaged, and support for the older versions means support for
  reading them. No rule in this spec checks the version and none needs to. Recorded because the delta
  writer described in Further Notes promises to pass a file's version through, which is the opposite
  of what we want here.

## Testing Decisions

A good test here asserts what a rule reports, never how it reached it. The rule's id, the site it
names, its severity, and whether a fix is offered are the external behaviour. Which bytes it read
in what order is not.

- **The seam is the test surface.** Every rule is tested by running the existing analysis entry
  point over a fixture project and asserting on the resulting findings, which is how
  `bin/property-type` is already tested. No test reaches inside a rule.
- **Every rule is tested through both layer sources.** The same fixture content, once as a
  directory and once as an archive, must produce the same findings — except the archive-only rules,
  which must produce none on the directory and their findings on the archive. This is the one
  property most worth locking down, because it is what the seam exists to guarantee.
- **Fixtures are minimal and hand-built.** A bank header with a zero id, a texture header with an
  odd dimension, a file whose first bytes are a text dump marker. Full specimens are too large to
  check in and too slow to run.
- **Kind detection is tested against extension deliberately.** A fixture with a hex-named chunk
  carrying texture magic and no extension must be found. A fixture named with a texture extension
  but carrying different content must not be judged as a texture.
- **Rust tests live in a sibling `tests.rs`, declared with `#[cfg(test)] mod tests;`**, matching the
  existing convention in this crate rather than an inline module.
- **Cost is measured, not assumed.** A test asserts the whole run over the largest specimen stays
  inside the existing budget, so import stays fast.

## Order of Work

Three issues are blocked by nothing and everything else waits behind one of them, so this order is a
consequence rather than a preference. The reason to state it is that all three crash-relevant rules
sit one hop from a single seam.

**Start immediately. These three are independent of each other:**

- **`013-002`**, the file handle and content-magic kind. Five of the eleven issues sit behind it,
  including every crash-relevant rule, and it is the correction that makes the others correct rather
  than a convenience.
- **`013-001`**, the chunk info on `ProjectFile`. Independent of `013-002`, so it is what a second
  pair of hands takes.
- **`013-011`**, the basis bump. Blocked by nothing, and without it a shipped rule reaches nobody
  whose verdict is already stored — which is every mod a user already has. A rule that finds a crash
  and never runs against the library holding it is worth nothing.

**Then the two rules of this release, which ship together because they share that seam:**

1. **`013-005`** (`tex/block-alignment`) — the only confirmed crash in the spec, and the only rule
   that repairs. Zero counterexamples in 436,150 shipped textures.
2. **`013-004`** (`audio/bank-version`) — 17 banks across 7 archives whose contents the game drops
   without a word. Reports only.

**Then `013-012`, as soon as the removal path exists.** It repairs what `013-004` reports, and on
the corpus it does not merely restore the game's audio but lets the mod's own audio play. It is out
of this release only because nothing in the repair path can delete a file, and the missing piece is
upstream.

**Everything else can wait.** `013-007` reports fidelity rather than a crash. `013-008`, `013-009`
and `013-010` found nothing across 10,574 chunks, so they buy a guarantee rather than a fix.
`013-006` is deferred outright, because what it measured is our own text format shipped as build
residue, which is untidy rather than broken. `013-003` is gone: it reported a state the engine
never reads. **The three archive rules are gone too** - `013-008`, `013-009` and `013-010` - and
the requirements above still name them. Each describes a state the overlay build is the right place
to guarantee, over what the build itself wrote, and each reaches a user as a crash if it ever
happens. Their own files carry the reasoning.

**In the other crate, in parallel: `014-001`.** It is blocked by nothing, and it is the only item
across these three specs that removes something wrong the manager says today rather than adding
something it does not yet say. Reaching a user takes an upstream release and a dependency bump, so
starting it early is worth more than its size suggests.

## Out of Scope

- Repairing an audio bank, a texture, or a resolver map. These rules report.
- Converting a rejected audio bank so its events survive. That is `016-audio-bank-conversion`.
- Any rule that requires reading the installed game as a source of repair parts. That is
  `015-game-as-parts-source`.
- The linked-bin false positive. That is `014-linked-bin-cross-wad`.
- Deciding what Riot changed. The migration table remains an input the manager does not derive.
- Extending the migration table's shape to express field renames and missing fields. Real and
  needed, and a separate piece of work — see Further Notes.
- A second parser for any format. Kind detection reads leading bytes and does not parse.
- Any change to how a verdict is drawn. These rules produce the existing finding shape and the
  existing surfaces render them unchanged.

## Further Notes

**The migration table's shape is a ceiling, and it is not this spec.** Our table carries 395 rows
across 14 distinct type pairs, so the original worry that we handled only two migrations was
answered in the opposite direction. But a table keyed by `(class, field)` to `(old type, new type)`
cannot express a field **rename**, nor a **missing field** the game requires and the mod omits, at
any row count. The limit is the shape, not the row count. That deserves its own spec.

**`ltk_meta` is growing a lazy reader and a delta writer, and neither blocks this spec.** The
upstream design is `docs/design/bin-streaming.md` in `league-toolkit`. A mounted handle reads a bin's
header and object table without materializing values, and a write-back copies untouched objects
through byte for byte. Three things follow for the rules here, all of them about what a rule costs
rather than about what it checks:

- **Reading a bin's shape stops costing the bin.** One sweep yields every object's path hash, class
  hash, offset and size, and the declared dependency list is free at mount. The budget this crate
  spends is sized against a parsed bin being several times its size on disk, so a check that needs
  only shape stops competing for it. `bin/resolver-key-loss` counts map keys and `bin/text-dump`
  reads a magic, and neither wants a materialized tree.
- **A repair stops rewriting the whole file.** A fix today parses a bin, changes what it must, and
  re-encodes every object including the ones it never touched, so a repair's blast radius is the
  file. The delta writer raw-copies an untouched object out of its own byte range, which narrows
  that to the objects a fix addressed. It refuses on a bin using the legacy property-kind numbering,
  because copied and re-encoded objects would then disagree, and an upstream sweep of a live install
  found no file that uses it.
- **Comparing a mod against the game gets cheap.** Two object tables matched by path hash is what
  `015-game-as-parts-source` needs to size its problem, and the upstream table is `Clone` and
  serializable specifically so this manager's object index can detach it.

Nothing here waits on any of it. Every rule is written against the seams we have and the handle
substitutes behind them, so the note exists to stop these rules being designed around an eager parse
we do not intend to keep.

**The bank name is worth checking, where the id was not.** A bank's identity to the engine is the
hash of the name it is _requested_ under, and that request comes from a skin bin's list of the banks
it needs. So the defect worth looking for is a name mismatch rather than an id mismatch: a mod
shipping a bank under a name nothing asks for, or a skin bin naming a bank the mod does not ship.
Neither has been measured, and neither is in this spec.

**A crash is still unproven for the leading candidate.** Two local runs of the specimen did not
reproduce the reported crash, and the probable reason is that the ability under test needs a real
champion target, which a practice session does not provide. The rules in this spec do not depend on
that outcome — each names a state we measured and can defend on its own — but the ranking between
them will sharpen when a reproduction lands.

**Three candidate causes remain open for that specimen**: the zero soundbank id, one
non-block-aligned texture, and a material that fails to bind its reflected resources. The third is
not a rule in this spec because we have not yet established that particle emitters take the
material path at all.

**A rename fix would destroy data on our specimen.** Rewriting a field to its new spelling assumes
the new spelling is absent. On `flowery_sett` both spellings are already present and their hashes
collide, so a blind rename drops one of the two values. Any rename table a successor to this spec
grows has to check for the destination field before it writes one.
