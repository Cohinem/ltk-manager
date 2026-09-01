# Feature Specification: A dependency check that stops crying wolf

**Feature Branch**: `014-linked-bin-cross-wad`
**Created**: 2026-08-30
**Status**: Draft
**Input**: A missing-dependency warning raised against a mod whose named dependency is present in the installed game. Investigated in `docs/plans/mod-autofixer-gaps.md`.

## Problem Statement

A user enables a mod, the overlay builds, and a dialog tells them the mod is missing a game file:

> **A mod is missing dependencies.** These enabled mods reference game files that aren't installed.
> League may glitch or crash when it loads them.
> `DATA/Characters/Sett/Sett.bin`

That file is not missing. It is the champion's main bin, it ships with the game, and it sits in the
archive the game mounts. The mod loads it correctly and the warning is wrong.

The check is not broken by accident. It encodes a premise about the engine that the engine does not
hold: that a bin's declared dependency resolves only inside the archive the declaring bin came
from. Resolution is not scoped that way. The client's chunk lookup walks every mounted archive in
mount order and returns the first that holds the path, and a bin's linked files are acquired
through that same lookup.

The warning fires here because the mod declares its content in a **localized** archive. Routing
sends that content to both the localized archive and the base one, and on the localized pass the
dependency resolves to the base archive, which is not the archive being examined, so it is reported
missing. Every mod that ships its content in a localized archive will trip this.

The cost is trust. A user who is told twice that a working mod is broken stops reading the third
warning, which is the one that matters.

## Solution

Judge a dependency against everything the game will mount, rather than against one archive.

A dependency is resolved when its path is present in any archive the build will produce and the
game will mount, which is the union of the original chunks of every non-blocked archive and every
override routed into them. It is missing when it is present in none of those, which is the state
that actually breaks a load.

This narrows the check rather than widening it. A dependency naming a bin Riot removed in a past
patch is still present in no archive, so it is still reported. What stops being reported is the
case where the dependency exists and is mounted, which was never a problem at runtime.

The blocklist stays excluded. A user can block an archive by name, and the scripts archive is
blocked by a setting. A dependency that resolves only inside a blocked archive genuinely will not
be there, so a blocked archive must not count as present.

## User Stories

1. As a mod user, I want a missing-dependency warning only when a dependency is genuinely absent,
   so that I keep trusting the warnings I am shown.
2. As a mod user, I want a mod that ships its content in a localized archive to load without being
   called broken, so that I do not disable a mod that works.
3. As a mod user, I want the warning, when it does fire, to name a dependency that is really
   missing, so that "look for a new version of this mod" is sound advice.
4. As a mod user, I want a dependency that resolves only inside an archive I have blocked to still
   be reported, so that blocking an archive does not quietly hide a real breakage.
5. As a modder, I want the check to agree with what the game does, so that a mod passing the check
   actually loads.
6. As a modder, I want a mod that ships a dependency itself to keep resolving through its own
   shipped copy, so that a self-contained mod is never flagged.
7. As a maintainer, I want the check's premise recorded where the check lives, so that the next
   person does not reintroduce the same restriction.
8. As a maintainer, I want a regression test built from real game data, so that the premise cannot
   silently return.
9. As a maintainer, I want the fix to change a check rather than mod content, so that no mod's
   bytes are rewritten to satisfy a bug of ours.

## Requirements

### Functional Requirements

- A declared dependency counts as resolved when its path is present in any archive the build
  produces and the game will mount.
- The present set is the union, across every non-blocked archive, of that archive's original chunks
  and every override routed into it.
- A blocked archive contributes nothing to the present set.
- A dependency present in no archive of that union is reported, exactly as today.
- A dependency the mod ships itself continues to resolve, unchanged.
- The reported shape does not change. The same offender record, the same dialog, the same counts.
- The module's own documentation is corrected, because it currently states the wrong premise in
  prose as well as in code.

### Key Entities

- **Declared dependency** — a path a property bin names as a linked file.
- **Present set** — every path the built overlay will offer the game across all non-blocked
  archives.
- **Offender** — a mod with at least one dependency present in no archive of the present set.

## Implementation Decisions

- **Widen the lookup, keep everything else.** The change is which set a dependency is tested
  against. The traversal, the offender record, the dialog and the counts stay as they are.
- **The blocklist exclusion is load-bearing and already correct.** The traversal already runs after
  blocked archives are removed. That must survive the change, because it is the one case where an
  existing path is genuinely unavailable.
- **The fix belongs upstream, in the overlay crate.** That is where the check lives, which means a
  release of that crate and then a dependency bump here. It cannot share the seam used by
  `013-mod-defect-rules`.
- **We are not adopting the alternative approach.** This class can be avoided entirely by merging
  dependency bins into their parent so there is nothing left to resolve. We are not doing that. It
  rewrites mod content to work around a defect in a check, it changes the file layout that every
  site addresses by path, and a first-wins merge silently discards an object, which is the same
  silent-deletion class the defect rules exist to catch.

## Testing Decisions

A good test here asserts which dependencies are reported for a given arrangement of archives, and
nothing about how the traversal walks them.

- **The existing test seam is the right one.** The check already has unit tests that build a
  synthetic game index and assert the offenders produced. Every case below is expressible there.
- **The regression case is the specimen's shape**: a bin declaring a dependency, routed into a
  localized archive, with the dependency present only in the base archive. It must produce no
  offender.
- **The still-reported case**: a dependency present in no archive at all must still produce an
  offender, so the fix does not turn the check off.
- **The blocklist case**: a dependency present only in a blocked archive must still produce an
  offender.
- **The self-shipped case**: a dependency the mod ships must produce no offender, which already
  passes and must keep passing.
- **A test built from real game data guards the premise.** Vanilla contains dependencies that
  resolve only across archives. A test that walks the installed game, if one is run where an install
  is available, would fail loudly under the old restriction. Where no install is available the
  synthetic cases carry it.

## Order of Work

**`014-001` is blocked by nothing and should start before anything in `013`.** Every rule in that
spec adds a finding a user has never seen. This one deletes a warning shown against mods that are
fine, and a check that cries wolf costs every other check its credibility.

`014-002` and `014-003` follow it and are both small. The fix and its tests live in the overlay
crate, so reaching a user means an upstream release and a dependency bump here rather than a change
in this repository — which is a reason to start early rather than a reason to defer.

## Out of Scope

- Any new rule. This is a fix to a shipped check.
- Changing the dialog, its wording, or where it appears.
- Merging linked bins into their parents, for the reasons above.
- The routing that puts one mod's content into several archives. That behaviour is correct and is
  what makes these mods work.
- Whether an unresolved dependency crashes. See Further Notes.

## Further Notes

**The premise is disproven by vanilla itself.** Scanning every property bin in the installed game -
49,150 bins declaring 131,471 dependencies - found 131,421 resolving inside the declaring bin's own
archive, **14 resolving only in a different archive**, and 1 resolving nowhere. The 14 are ordinary
retail content: one champion's skin root declaring another champion's animation bin, a map's clones
reaching into five separate champion archives. Under the per-archive premise, unmodded League would
fail those fourteen on a normal launch. That settles it without any need to read the engine.

**A dependency that resolves nowhere is not automatically fatal.** One vanilla dependency, declared
twice, resolves in no archive at all, and the game ships that way. So the check should be worded as
a real risk rather than a certain crash. That is a wording question for the dialog and is noted
rather than specified here.

**The dependency list is parsed by hand today, and it need not stay that way.** The check reads a
bin's declared links with a byte-level parser of its own, written because the meta crate reads a bin
all-or-nothing while this check wants a few fields out of a header. The lazy reader that crate is
growing hands the same list back free at mount, so that parser becomes a call. Worth doing when the
dependency moves, and deliberately not part of this spec — `014-001` changes which archives a link
is looked up in, and where the list came from does not bear on that.

**Why the dialog named one dependency and not two.** The specimen declares two. The other one the
mod ships itself, so it is caught by the existing branch that resolves against the mod's own
overrides on both passes. Only the unshipped one falls through to the archive test. Useful to know
when reading a report: the count is dependencies that fell through, not dependencies declared.
