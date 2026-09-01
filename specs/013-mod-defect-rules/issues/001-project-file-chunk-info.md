# Issue 013-001: Packed chunk info on ProjectFile

**Spec**: `013-mod-defect-rules`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: high`  
**Status**: Done  
**Blocked by**: nothing

## Context

Every archive rule in this spec needs what a packed chunk records about itself and nothing
currently surfaces: its compression type, its stored compressed and uncompressed sizes, and its
stored checksum. `ProjectFile` already carries the chunk's hash for exactly this reason, so the
rest of that record belongs beside it.

`LayerSource` documents itself as the seam between which files a run sees and what a file's bytes
are. Extending `ProjectFile` keeps that seam intact. A parallel archive-report type would give the
manager a second finding shape and a second surface, contradicting the Problems goal that a new
check is a rule and a row and never a new panel.

## Acceptance criteria

- `ProjectFile` carries the chunk info, present for an archive-backed layer and absent for a
  directory-backed one.
- No rule can tell which layer source it is reading. The chunk info is the only difference, and its
  absence is a normal state rather than an error.
- Reading it costs nothing beyond the table of contents the layer already reads. No chunk is
  decompressed to populate it.
- Tested through the existing analysis entry point over the same fixture content in both forms.

## Notes

Absence is the archive rules' silence condition. A rule that finds no chunk info reports nothing, in
the same way a dormant rule reports nothing on a project the change has not reached.
