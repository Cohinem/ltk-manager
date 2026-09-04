# Issue 013-008: Rule: wad/chunk-checksum, chunk checksum mismatch

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: high`  
**Status**: Not a per-mod rule - see below  
**Blocked by**: `013-001`

## Context

A chunk whose stored checksum does not match its stored bytes is not a degraded read. The game
verifies on read and the failure is fatal - the process dies rather than recovering. Because the
check happens when the chunk is first read, a defect in an asset used by one ability lands at the
moment that ability is cast.

A repair rewrites an archive in place, so a writer that ever recomputes bytes without recomputing
their checksum turns a repaired mod into a hard crash. This rule guards our own repair path as much
as it guards incoming mods.

## Acceptance criteria

- Reports a chunk whose stored checksum does not match its stored bytes.
- Verifies over the stored bytes, matching what the game verifies.
- Reports nothing on a directory-backed layer, where no stored checksum exists.
- Verifying the whole of the largest specimen stays inside the run's budget.

## Notes

All 10,574 chunks across five archives currently pass. This rule ships preventively, and its value
is that it fails loudly the day our own writer gets it wrong.

## Decided during implementation: this does not belong to a mod check

The rule was written, measured and then taken out again. Three things decided it, and the third is
the one that matters.

**It is the only rule whose cost is the whole mod.** Verifying a chunk means reading it, so a
check over an archive went from the table of contents plus the bins to every stored byte. The
startup sweep runs over a whole library, and a library of a couple of hundred mods is gigabytes of
sequential read on that path every time the basis moves.

**A mismatch reaches the user as a game crash, and that is the intended flow.** The game verifies
on read and dies, which is a loud and correct failure. A check that predicts it buys nothing a
user does not already get, and it was measured at zero occurrences across 10,574 chunks.

**Where it does belong is the overlay build, over what the build itself wrote.** The invariant
worth holding is that the overlay is consistent with the game, and the place to hold it is a pass
over the written tables of contents as one of the last steps of the build - not a pass over every
mod in the library. That is upstream in `ltk_overlay`, and it is **not in scope**: it fixes no
issue anyone has today.

This is the same shape as `013-010`, and for the same reason. Both describe a state the build is
the right place to guarantee, and neither is something a per-mod check should spend a user's disk
on. What the removal cost is written down here so it is not re-derived: `ProjectFiles::read_stored`
went with it, and so did the `xxhash-rust` dependency.

## What the rule was, if it is ever wanted again

A predicate over the stored bytes: `xxh3_64` of the chunk as the WAD holds it, against the
`checksum` field `013-001` put on `ChunkInfo`. Two things it learned that a rewrite should not
have to learn twice:

- **Read one mount per WAD, never one per chunk.** A mount parses the whole table of contents, so
  a chunk-by-chunk read costs the square of their number. Measured: 2,000 chunks took 275 ms and
  4,000 took 1,000 ms; batched by WAD, the same 4,000 took 3 ms.
- **A recorded zero is no record, not a wrong one.** Some packers leave the field alone, and
  reporting those calls every chunk of the mod fatal with no repair to offer.
