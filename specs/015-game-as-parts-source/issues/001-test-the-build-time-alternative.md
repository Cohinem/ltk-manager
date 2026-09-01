# Issue 015-001: Build-time alternative, ruled in or out

**Spec**: `015-game-as-parts-source`  
**Labels**: `area: backend`, `ready-for-human`, `priority: high`  
**Status**: Done  
**Blocked by**: nothing

## Context

Before designing a repair that copies game content into a mod, establish whether the overlay build
can supply the missing part instead.

The build already holds the game index, already routes a mod's content against it, and already
copies original chunks through untouched. If an object a mod dropped can be supplied at build time,
then the mod on disk never changes, provenance is a non-question, staleness resolves itself on the
next build, and most of this spec is unnecessary.

This is the cheapest possible answer to the largest defect class we measured, so it should be
eliminated before anything more elaborate is designed.

## Acceptance criteria

- A written answer to whether the overlay build can supply an object a mod's replacement dropped.
- If it can: an outline of what that would take, and this spec is narrowed or closed.
- If it cannot: the reason, in enough detail that the repair-time design starts from it.
- Either way, the answer is recorded in the spec rather than only in a conversation.

## Notes

Investigation, not implementation. Deliberately labelled for a human because it is a judgement
about architecture rather than a task with acceptance tests.

## Answer

**It can, and the spec is narrowed to it.** Layering the mod's content over the game's - objects
merged field by field, maps merged key by key - restores all 1,151 dropped resolver keys on the
specimen, keeps its 4,788 own bindings and its 84 additions, and breaks no link the game does not
already leave open. The alternative it was measured against, rebinding a dropped key onto the mod's
own equivalent object, reached none of the 1,151.

Recorded in the spec under "Implementation Decisions", and decided in
[ADR-0012](../../../docs/adr/0012-the-overlay-merges-a-mod-over-the-games-copy.md). The operation
is a **merge** rather than a **pull**, so the game supplies a base to layer onto rather than parts
to lift out, and most of what this spec describes is not needed.
