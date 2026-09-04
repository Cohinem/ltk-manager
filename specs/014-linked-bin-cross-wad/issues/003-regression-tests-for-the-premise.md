# Issue 014-003: Cross-archive lookup regression tests

**Spec**: `014-linked-bin-cross-wad`  
**Labels**: `area: patcher`, `ready-for-agent`, `priority: high`  
**Status**: Done  
**Blocked by**: `014-001`

## Context

The restriction is easy to reintroduce because it reads as a reasonable thing to do. The tests need
to make it fail immediately.

The check already builds a synthetic game index in its unit tests, which is the right seam. Each
case below is a different arrangement of archives and one assertion about the offenders produced.

## Acceptance criteria

Four cases, all at the existing test seam:

- **Cross-archive dependency**: a bin routed into a localized archive, with its dependency present
  only in the base archive, produces no offender. This is the regression, and it must fail under
  the old restriction.
- **Genuinely absent dependency**: a dependency present in no archive still produces an offender.
- **Blocked archive**: a dependency present only in a blocked archive still produces an offender.
- **Self-shipped dependency**: a dependency the mod ships produces no offender.

## Notes

Vanilla contains 14 dependencies that resolve only across archives, out of 131,471 declared across
49,150 bins. If a test is ever run against a real install, those 14 are the natural corpus and they
fail loudly under the old restriction. The synthetic cases carry the guarantee where no install is
available.

## Decided during implementation

All four cases ship upstream in `ltk_overlay` 0.9.6, at the synthetic-game-index seam this issue
named: `dependency_in_another_mounted_archive_resolves` and
`dependency_in_the_base_archive_resolves_on_the_localized_pass` are the regression,
`missing_dependency_is_flagged` the absent case, `dependency_only_in_a_blocked_archive_is_flagged`
the blocked one, and `new_bin_shipped_in_same_wad_resolves` the self-shipped one.
