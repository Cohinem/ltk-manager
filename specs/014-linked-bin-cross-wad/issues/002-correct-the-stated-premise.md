# Issue 014-002: Linked bin lookup premise correction

**Spec**: `014-linked-bin-cross-wad`  
**Labels**: `area: patcher`, `ready-for-agent`, `priority: low`  
**Status**: Done  
**Blocked by**: `014-001`

## Context

The check's own module documentation states that the game resolves each linked path against the
archive it is mounted from. That sentence is why the code was written with a per-archive
restriction, and leaving it in place invites the restriction back.

## Acceptance criteria

- The module documentation states how resolution actually works: a lookup across every mounted
  archive, first hit winning by mount order.
- It states what the check therefore tests, which is presence anywhere in the built overlay minus
  blocked archives.
- It does not overstate the consequence of an unresolved dependency. Vanilla ships one that
  resolves nowhere, so an unresolved dependency is a risk rather than a certain crash.

## Notes

Cite the behaviour, do not reproduce a derivation. The claim is defensible from the installed game
alone, which is where the evidence in `014-003` comes from.

## Decided during implementation

The sentence naming the old premise was already gone, cut in a pass over the module for verbosity.
What survived it was `LinkedBinOffenderInfo`'s own summary, "linked dependencies that don't resolve
against the overlay WADs they land in", which is the same restriction stated as the type's purpose.

So the terser form did not satisfy this on its own, and re-expanding what was cut was not the
answer either. The summary now says what the type is, and one sentence under it says the lookup is
across every mounted archive and what the check therefore tests. Nothing says what an unresolved
dependency costs, which is the third criterion met by leaving it unsaid.
