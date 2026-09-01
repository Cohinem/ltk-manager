# Issue 013-002: Non-bin file reads for rules

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: high`  
**Status**: Done  
**Blocked by**: nothing

## Context

Rules today reach bins and nothing else. `ProjectFiles` hands out a bin handle that names a file
and parses it on demand, and the only other accessor returns a layer and a file record with no way
to get at the bytes, because the layer's read is private to the engine.

Both rules in this release read a file that is not a bin, so the seam has to widen. It does not
have to widen far. Kind detection by content already works in both layer sources: the directory
walk sniffs a hex-named file's leading bytes, the archive scan does the same through a bounded
prefix decode, and both audio and texture kinds already exist. What is missing is only the reading.

**A bounded read is the point, not an optimisation.** The budget a run spends is bytes held at
once rather than threads, and both rules answer from a header. A corpus of 161 mods holds 179 audio
banks whose largest is 44 MB, and every one of them can be judged from its first 2,684 bytes.

## Acceptance criteria

- `ProjectFiles` exposes every file through a handle carrying its layer, its path and its kind.
- The handle reads a bounded prefix, and reads a whole file separately.
- A bounded read of an archive-backed file decompresses only the prefix, as the existing scan does.
- A bounded read of a file shorter than the bound returns what there is rather than failing.
- The bin handle keeps working unchanged, and no rule that reads a bin is touched.

## Notes

An earlier draft of this issue also asked for kind to be decided by content rather than extension.
That is already true where it matters: a chunk no hashtable names is written as bare hex and is
sniffed in both layer sources. The remaining gap is a file whose extension disagrees with its
content, which no rule in this spec depends on.

The doc comment on the directory walk still states the older premise, that an extension decides
wherever there is one to read. Correct it while the seam is open, the same way `014-002` corrects
the linked-bin premise, because the wrong sentence is what invites the wrong code back.
