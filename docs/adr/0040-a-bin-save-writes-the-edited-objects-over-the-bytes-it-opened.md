# ADR-0040: A bin save writes the edited objects over the bytes it opened

- **Status:** Accepted (2026-09-14)
- **Date:** 2026-09-14
- **Crates:** `ltk-manager-core`, `src-tauri`
- **Related:** [ADR-0026](0026-a-saved-bin-is-written-from-the-tree-the-backend-holds.md), whose
  save sentence this replaces. League-toolkit ADR-0016, the delta write-back, and
  `bin-streaming.md` section 10. The editing rules are "Editing" in `docs/ux/BIN_EDITOR.md`.

## Context and problem statement

ADR-0026 keeps the parsed `Bin` in the backend for as long as a document is open, and names the
save as a write of that whole `Bin`. `Bin::to_writer` encodes every object and writes version 3
whatever version the file was read at. A version 1 or 2 bin saved that way changes version for a
one-float edit.

`ltk_meta` carries a second writer. `BinStream::write_patched` takes a mounted base and a
`BinDelta` of replaced, removed and appended objects. Every object the delta does not name is
copied from its byte range, and the header writes the version the base mounted. A base latched
onto the legacy kind numbering refuses the write with `DeltaLegacyNumbering`. The problems repair
of `bin/property-type` saves through this writer and transcodes whole on that refusal.

A leaf edit changes one value of one object. The object keeps its path hash and its class. The
file keeps its object set.

A layer file has other writers: the VS Code handoff, the problems repair, a checkout. Any of them
changes the file under an open document.

## Decision

**A document holds the bytes its tree parsed from beside the tree, and the path hash of every
object a patch touched.** Reads and patches go to the tree, as ADR-0026 has them.

**A save mounts the base bytes and writes the touched objects over them.** Each touched object is
read out of the base, which settles the numbering latch, and then replaced in a `BinDelta` by
its copy from the tree. `write_patched` encodes the delta. A base the read latches onto the legacy
numbering is transcoded whole through `Bin::to_writer`.

**A save compares the file on disk with the base before it writes.** A file whose bytes differ
refuses the save as `BinChangedOnDisk`, and nothing is written. The tree keeps its edits until the
reader reloads the document.

**The write lands through a temp file beside the target and a rename.** The written bytes become
the base, and the touched set empties.

A `PTCH` document and a document over a `GameChunk` or a `File` source take no patch. The
header names which of the three a read-only document is.

## Consequences

- **Positive:** an object no patch touched keeps every byte, including a kind with no widget and
  a hash no table names. The guarantee of ADR-0026 holds for the objects outside the tree walk as
  well as inside it.
- **Positive:** a save keeps the file's version. The version-3 write of "The version-3 write" in
  `docs/ux/BIN_EDITOR.md` applies only to a legacy-numbered base.
- **Positive:** the editor's save and the problems repair share one writer and one fallback.
- **Negative:** an open document holds its file's bytes twice, once parsed and once raw. Eight
  documents of a few megabytes each are inside the 200MB budget.
- **Negative:** a save reads the file before it writes, which costs one read of the file per
  save.
- **Negative:** a change on disk and an edit in the tree do not merge. The reader chooses the
  file by reloading, and the edits in the tree are lost.
- **Neutral:** ADR-0026's decision on where the tree lives, the bound of eight, and the refusal to
  evict a document with unsaved edits stand unchanged.
