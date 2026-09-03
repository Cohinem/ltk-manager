# ADR-0025: A repair reads the archive where it lies

- **Status:** Accepted (2026-09-03)
- **Date:** 2026-09-03
- **Crates:** `ltk-manager-core`
- **Related:** [ADR-0005](0005-a-repair-rewrites-the-archive-in-place.md), which puts the
  repaired bytes back by editing the archive, and
  [ADR-0006](0006-a-repair-preserves-names-instead-of-keeping-a-restore-point.md), whose table
  the edit has to carry. The rule is stated in "The check and the repair, per storage" in
  `docs/ux/MOD_HEALTH.md`.

## Context and problem statement

An archive-storage repair unpacked the whole archive into a staging directory, analyzed the tree
it had just written, applied the fixes there, read the fixed files back, and edited them into the
archive. The check had already stopped unpacking: `ProjectFiles::in_archive` lists a packed WAD
off its table of contents and reads a chunk where it lies. The repair still wrote every chunk of
the mod to disk to change a handful of bins, and the unpack ran whether or not the check found
anything to fix. Measured on two archive mods with nothing to fix, in a release build:

| Mod                     | Unpack, then analyze the tree | Read where it lies |
| ----------------------- | ----------------------------- | ------------------ |
| `sett-flowerly` (50 MB) | 308 ms + 102 ms               | 197 ms             |
| `dawnbringer-irelia`    | 603 ms + 71 ms                | 228 ms             |

What pinned the repair to a directory was the fix run, not the rules. `FixRun` read and wrote
under a project root, the audio rules opened the project themselves to compute a fact, and
`PreservedNames` merged its table into a project on disk.

## Decision

**A fix run over an archive reads the files the check scanned and holds what it writes until the
edit.** The run serves a rule's read out of the archive, or out of what an earlier rule of the
same run wrote, and keeps every written file and the merged name table as the edit's own bytes.
Nothing touches the disk until `apply_delta` rewrites the archive. A rule's fix body reads the
project and its facts through the run, which is what lets one body serve both storages.

The unpack, fix and repack path stays, as the fallback for an archive the edit refuses: one
shipping its WADs as loose files, a layer Fantome has no place for, or a table declared outside
`hashes/`. The refusal comes before anything is written, so the fallback starts from the archive
as it was.

## Consequences

- **Positive:** a repair costs the bins it reads and the chunks it writes, and a mod with nothing
  to fix costs its check. The staging directory, and the sweep that clears one left behind, are
  reached only by the fallback.
- **Negative:** the fallback runs the analysis and the fixes twice for the archive it is taken
  on. It is logged when taken, so a library where it is common is visible.
- **Neutral:** verification after the edit re-reads the archive only where a rule skipped, as
  the tree path re-read the tree. The verdict a repair records is taken against the edited
  archive.
