# Issue 013-009: Rule: wad/raw-size, raw chunk size disagreement

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: low`  
**Status**: Not a per-mod rule - see below  
**Blocked by**: `013-001`

## Context

For an uncompressed chunk the game allocates and verifies against one recorded size and then
reports the stream length from the other. A difference between them hands the consumer a read past
the end of the buffer, of exactly that difference, with no bounds check on that path.

One comparison detects it.

## Acceptance criteria

- Reports an uncompressed chunk whose stored compressed and uncompressed sizes are not equal.
- Names both sizes and their difference in the finding.
- Reports nothing for a compressed chunk, where the two sizes are expected to differ.
- Reports nothing on a directory-backed layer.

## Notes

The specimen's 15 uncompressed chunks are all consistent. Preventive, like `013-008`, and cheaper.

## Decided during implementation: this does not belong to a mod check

The rule was written, tested and then taken out again, for the reasons that took `013-008` out
with it. A disagreement between a chunk's two recorded sizes is a table-of-contents inconsistency,
it reaches the user as a crash, and the place to hold that invariant is the overlay build over
what the build itself wrote - not a pass over every mod in a library. Zero of 49 raw chunks trip
it.

It differed from `013-008` in one way only, and that way did not save it: the check is the chunk
table the scan already walked, so it costs nothing to run. Cost was never the whole objection. A
check that predicts a crash the user is going to get anyway, over a state the build is the right
place to prevent, is a row in the panel and not a defect a mod author can act on.

**What it would be, if it is ever wanted again.** One comparison, in the build rather than here:
for a chunk recorded as `WadChunkCompression::None`, `compressed_size` and `uncompressed_size` are
the same bytes and so have to be the same number. The game sizes its buffer from one and reports
the stream length from the other, with nothing on that path bounding the second by the first, so
the difference is the exact length of the overread.

**One consequence worth someone's decision.** `013-001` widened `ProjectFile.chunk` from a bare
hash to the whole `ChunkInfo` record so that this rule and `013-008` could read it. With both
gone, `hash` is the only field with a reader - `FileHandle::wad_hash`, and `audio/bank-version`'s
guard through it. `compression`, `compressed_size`, `uncompressed_size` and `checksum` are written
by the scan and read by nothing but two engine tests. The plan's own argument for the widening was
that it "costs nothing beyond the table of contents", which is still true, so keeping it is
defensible - but it is now a record kept for a reader that does not exist.
