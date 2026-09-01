# Feature Specification: Repairing a mod with parts from the installed game

**Feature Branch**: `015-game-as-parts-source`
**Created**: 2026-08-30
**Status**: Largely answered by [ADR-0012](../../docs/adr/0012-the-overlay-merges-a-mod-over-the-games-copy.md),
which settles the defect class this spec was written for by merging at build time rather than
pulling parts into the mod. What survives is the general question - whether a repair may ever read
the installed game as a parts source - which stays unasked until a measured defect class needs it,
and none does. See `015-001` for the answer and `015-003` for the one loose end.
**Input**: An architectural gap in our repair model, recorded in `docs/plans/mod-autofixer-gaps.md`.

## Problem Statement

A repair can only rewrite what the mod already ships. It reads the mod's files, derives a fix from
them, and writes them back. Nothing it does can add something the mod does not have.

That is fine for the defects we repair today, which are all rewrites of a value already present.
It is not fine for the largest class we found. A mod that ships its own skin bin replaces the
game's object wholesale rather than merging into it, so anything the modder did not carry forward
is simply gone. In one specimen the merged view defines 847 objects where the game defines 1,473 —
**676 objects removed**, and 1,151 resolver keys with them. Nothing in the mod can repair that,
because the missing material is not in the mod. It is in the game, sitting on the same disk.

The gap is in how we treat the install. We read it only as ground truth to compare a mod against,
never as somewhere to read parts out of. A repair able to pull entries out of the installed game's
bin closure and into the mod would reach this class, and nothing but that framing stops it.

There is also a detection consequence. A rule that looks for a dangling reference cannot see this
class at all: the specimen deleted the referencing fields along with the objects they pointed at,
so there is nothing dangling to find. Only a comparison against the game's own copy sees it, and
only a repair that can reach into the game can act on it.

## Solution

Let a repair read the installed game as a source of parts, not only as a reference to compare
against.

The manager already holds an index of the installed game, and the overlay build already resolves a
mod's content against it. What is missing is permission and a shape: a repair that may say "this
object should be here, the game has it, put it back."

This changes what a repair is, so it is a decision to record rather than a rule to add. Three
things make it different in kind from every repair we ship today:

- The output depends on the machine. A repaired mod carries bytes that came from that install, at
  that patch. The same mod repaired on two machines is not the same mod.
- A repair becomes patch-sensitive in a new way. Parts pulled from one build may be wrong on the
  next, where today a repaired mod stays valid until a rule changes.
- It reintroduces a dependency the check already has but the repair does not, which is that the
  answer is only as good as the installed game the manager can see.

None of those is disqualifying, and all three want stating before code is written.

## User Stories

1. As a mod user, I want a mod broken by objects its author dropped to be repairable, so that a mod
   I already have keeps working instead of being written off.
2. As a mod user, I want to know that a repair used parts from my installed game, so that I am not
   surprised when the same mod behaves differently elsewhere.
3. As a mod user, I want a repair that pulled parts to still be reversible in the ways I already
   rely on, so that the guarantees I have do not quietly change.
4. As a mod user, I want a repair to refuse rather than guess when the installed game cannot supply
   a part, so that a half-repaired mod does not look repaired.
5. As a modder, I want to know which parts of my mod came from the game rather than from me, so
   that I can carry them forward deliberately in the next version.
6. As a modder, I want a repair never to pull a part that contradicts something I shipped on
   purpose, so that a fixer does not undo my intent.
7. As a maintainer, I want the machine-dependence of a repaired mod recorded as a decision, so that
   it is a choice we made rather than a property we discovered later.
8. As a maintainer, I want a pulled part to be identifiable after the fact, so that a later patch
   can invalidate exactly what came from the previous one.
9. As a maintainer, I want this capability scoped to the defects that genuinely need it, so that
   repairs which can be derived from the mod alone keep being derived that way.
10. As a maintainer, I want the decision written before any rule depends on it, so that a rule is
    not designed around a capability we have not agreed to.

## Requirements

### Functional Requirements

- A repair may read the installed game through the index the manager already holds.
- A repair that used game parts records that it did, and records the build it read.
- A repair refuses where the installed game cannot supply the part, rather than partially applying.
- A pulled part is distinguishable from the mod's own content after the repair.
- The existing **preserved names** guarantee continues to hold for anything a pull hashes.
- The **basis** of a verdict accounts for a repair having been derived from a specific game build.
- No rule that can derive its fix from the mod alone is rewritten to use this.

### Key Entities

- **Parts source** — the installed game, read for content rather than for comparison.
- **Pulled part** — an object or asset a repair copied from the installed game into a mod.
- **Provenance** — the record of which parts were pulled and from which build.

## Implementation Decisions

Nothing here is decided. This spec exists to hold the question until it is, and the questions are:

- **Where the boundary sits.** Which defect classes may pull, and which must keep deriving from the
  mod alone. The candidate was the wholesale-replacement class, where a mod's object is a strict
  subset of the game's and the missing part is unambiguous. **The specimen that motivated this spec
  does not meet that description**, and it is worth not designing around the belief that it does.
  Its resolver maps hold 84 keys the game's do not, 4,289 shared keys carry a different target, and
  the objects a restored key would need were never shipped — so the mod is a replacement rather
  than a subset, and the missing part is only unambiguous if restoring the game's own content
  counts as unambiguous. Whether a genuine strict-subset class exists in the wild is unmeasured,
  and this spec needs one before its boundary means anything.
- **Whether a pull is a repair or an overlay-time act.** Copying into the mod changes the mod.
  Supplying the part at build time does not, and the overlay build already holds the game index.
  The second is less invasive and may not need a repair at all, which would make most of this spec
  unnecessary — that possibility should be tested first.

  It has now been tested, on the specimen, and it works. Layering the mod's objects over the
  game's rather than replacing them — objects merged field-wise, maps merged key-wise — restores
  1,151 resolver keys, keeps all 4,788 of the mod's own bindings and its 84 additions, and breaks
  no link vanilla does not already leave open. It also puts back the `SkinCharacterDataProperties`
  fields the mod dropped. Nothing is copied into the mod, so provenance and staleness stop being
  questions and the answer recomputes on every build.

  Two consequences for this spec. Most of it may indeed be unnecessary, because the operation
  wanted here is a **merge** rather than a **pull** — the game supplies a base to layer onto, not
  parts to lift out. And the merge rule is the same semantic a `PTCH` patch record carries, so a
  build-time merge and a mod that ships a delta are one operation at two different times. That
  argues for naming the operation once, in whichever of the two lands first.

- **Whether a merge belongs in this spec at all.** A pull reaches into the game for a named part.
  A merge never removes the game's content in the first place. They solve the same defect and are
  not the same act, and this spec is written entirely around the first.

  The defect is now confirmed rather than suspected: a resolver miss can crash, depending on the
  call site rather than on the key. Because nothing in a bin says which caller asks for a key, the
  severity cannot be computed per key and a partial repair leaves an unknown subset of crashes
  standing. A repair here has to restore every dropped key, and merge is the only candidate that
  does.

- **How provenance is recorded.** Preserved names already solve an adjacent problem, so the same
  shape may extend to it.
- **What happens on the next patch.** A pulled part may be stale. Whether that is detected, ignored,
  or re-pulled is open.
- **Whether the user is asked.** A repair that copies game data into a mod is a different act from
  one that rewrites the mod's own values, and it may warrant saying so.

Because this changes what a repair means rather than adding one, it wants an ADR before
implementation, in the same series as the decisions that already govern repair.

## Testing Decisions

Not specified. The testing approach depends on which of the open questions above is answered, and
particularly on whether this is a repair-time or a build-time capability. Two constraints are
already clear:

- Any test must run without a real game install, because CI has none. The existing synthetic game
  index used by the overlay tests is the natural seam.
- The property most worth asserting is refusal: a repair that cannot obtain a part must leave the
  mod untouched rather than applying part of itself. That is the same guarantee the current repair
  already gives, and it must survive.

## Out of Scope

- Any rule. This spec adds a capability, not a check.
- The rules in `013-mod-defect-rules`, all of which are detection only and none of which need this.
- The dependency-check fix in `014-linked-bin-cross-wad`, which changes a check and not mod content.
- Repairing an audio bank or a texture. Neither is a parts problem.
- Shipping game content anywhere it would leave the user's machine.

## Further Notes

**This is the only route to repairing the largest class we measured.** A rule can report a
resolver that lost keys, but restoring them safely means restoring only those whose target still
resolves, and the targets live in the game. Without a parts source the honest verdict for that class
is `unrepairable`, which is a legitimate answer and may be the right one for now.

**The build-time alternative deserves testing first.** The overlay build already routes a mod's
content against the game index and already copies original chunks through untouched. If a missing
object can be supplied there, the mod on disk never changes, provenance is a non-question, and
staleness resolves itself on the next build. That would be a much smaller change than this spec
describes, and it should be ruled in or out before anything here is designed.

**The upstream lazy reader makes the measuring half of this cheap.** `ltk_meta` is growing a
mounted handle that yields a bin's object table without materializing values, plus a batch lookup
that visits a requested set in file order rather than in the order it was asked for. Establishing
that a mod's object is a strict subset of the game's is then two object tables compared by path hash
and no parsed values at all, and reading the bodies a restored part would come from is the batch
path's own case. That answers none of the open questions above and does not move this spec onto the
critical path — the rules in `013` and the false positive in `014` both come first — but it does
mean the detection half is cheaper than it looks from here.
