# Issue 014-001: Cross-archive dependency lookup

**Spec**: `014-linked-bin-cross-wad`  
**Labels**: `area: patcher`, `ready-for-agent`, `priority: high`  
**Status**: Done  
**Blocked by**: nothing

## Context

The dependency check treats a dependency as resolved only when the archive holding it is the same
archive as the one holding the declaring bin. The engine does not resolve that way: its chunk
lookup walks every mounted archive in mount order and returns the first that holds the path, and a
bin's linked files are acquired through that lookup.

The result is a false warning on every mod that ships its content in a localized archive, because
routing puts the content in two archives and the dependency lives in only one of them.

## Acceptance criteria

- A dependency counts as resolved when its path is present in any non-blocked archive the build
  produces.
- The present set is the union, per archive, of original chunks and routed overrides.
- A blocked archive contributes nothing.
- A dependency present in no archive is still reported.
- A dependency the mod ships itself still resolves.
- The offender record, the dialog and the counts are unchanged.

## Notes

The fix lives in the overlay crate upstream, so it needs a release there and a dependency bump
here. Do not change versioned dependencies to local path dependencies to test it - publish first.

## Decided during implementation

Shipped upstream in `ltk_overlay` 0.9.6 and reached this repo through the dependency bump.
`PresentSet::holds` answers from the union of every override the build routes into any archive and
every chunk the installed game holds in a non-blocked archive, which is each acceptance criterion
in one predicate.
