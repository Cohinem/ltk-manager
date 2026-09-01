# Issue 015-004: Overlay merge implementation

**Spec**: `015-game-as-parts-source`  
**Labels**: `area: patcher`, `ready-for-human`, `priority: high`  
**Status**: Open  
**Blocked by**: nothing

## Context

[ADR-0012](../../../docs/adr/0012-the-overlay-merges-a-mod-over-the-games-copy.md) was accepted on
2026-08-31 and nothing implements it. It is the only accepted decision in the series with no work
behind it, and two things already depend on it: `bin/resolver-key-loss` ships reporting a defect
whose only fix this is, and `015-003` exists to stop the badge telling those users to go and find a
different mod in the meantime.

The decision, in one line: the overlay build layers a mod's chunk over the game's copy instead of
letting it replace the chunk, with `PTCH` semantics - a plain value replaces, a map combines key by
key, an object or embedded struct combines field by field.

## What makes this bigger than the ADR implies

**`ltk_overlay` does not parse bins.** It routes chunks and moves bytes. `GameIndex` is a path
index - `find_wad`, `find_wads_with_hash`, `subchunktoc_blocked` - and it never reads a chunk's
content. `linked_bins.rs` reads bin headers by hand with `byteorder` to find dependency links, and
the crate has no `ltk_meta` dependency at all. The merge takes it from moving bytes to parsing two
object graphs, merging them and re-encoding, plus a content read out of the game's own WADs at
build time.

**The cost of "recomputed on every build" is unpriced.** ADR-0012 stores no result, and argues that
purely as correctness: nothing goes stale on a patch and there is nothing to invalidate. Both are
true. What it does not say is what it costs to parse, merge and re-encode every bin every enabled
mod overrides, on every build, in a crate that carries a `builder/incremental.rs` because build time
matters. That number should be measured before the shape is fixed, and if it turns out to matter the
ADR is the place to reopen it rather than the implementation.

## Acceptance criteria

- The build merges a mod's bin chunk over the game's copy where the game holds the same path, and
  mounts a chunk the mod introduces unchanged. Per ADR-0012's second bound.
- The specimen's 1,151 dropped resolver keys are present in the built overlay, its own 4,788
  bindings and 84 additions survive, and no link the game leaves open is broken.
- Nothing is written to the mod, on any path through the build.
- A measurement of what the merge adds to a build, over a library where several mods override game
  bins. Recorded whatever it says.
- Tests run without a real install, against the synthetic game index the overlay tests already use.

## Notes

Upstream in `X:\dev\league-mod`, crate `ltk_overlay`, currently 0.9.6. Published before the
manager's dependency moves - never a path dep.

Once this lands, the verdict question ADR-0012 opened stops being hypothetical: a mod carrying only
this defect plays correctly and its stored verdict still says `unrepairable`. `015-003` covers the
badge, not the word. See **Compensated** in `CONTEXT.md`.
