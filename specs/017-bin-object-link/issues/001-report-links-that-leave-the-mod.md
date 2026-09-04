# Issue 017-001: Object link resolving outside the mod

**Spec**: `017-bin-object-link`  
**Labels**: `area: backend`, `ready-for-agent`, `priority: high`  
**Status**: Open  
**Blocked by**: nothing

## Context

An object copied out of a game bin brings its `ObjectLink` properties with it. Those links name
other objects by hash, and inside the bin they came from those objects were present. In the mod's
own bin they may not be, and the game resolves such a link to null and reports the load a success.

What that costs is decided by the class reading the link, not by the mod. Shipped game data holds
both behaviours - a class that null-checks the resolve and falls back, and one that dereferences it
directly - so the same unresolved link is a missing effect for one consumer and an access violation
for another.

No rule reads `ObjectLink` values today, so a mod in this state passes every check and its verdict
reads `healthy`.

## Acceptance criteria

- A new `bin/object-link` rule reports every `ObjectLink` whose target hash no bin in the mod
  defines.
- A link whose target any bin of the same mod defines is silent, including across files.
- Links are found at any depth: inside containers, unordered containers, structs, embedded objects,
  optionals, and as both map keys and map values.
- An object that links to itself is silent.
- Each site is its own finding, so two links to the same absent object report twice.
- A finding names the property path, the target hash, and the target's name where a hashtable knows
  it.
- Severity is `Warning`. The rule offers no fix and carries `unfixable` wording saying so.
- The rule reads a mod stored as an archive without unpacking it.
- A bin that cannot be parsed reports a failure and yields no findings.
- The object hashes a bin defines and the links it holds are collected in one pass over that bin.

## Out of scope

Deciding whether the installed game defines the target - see issue 002. This issue's wording must
therefore not claim a link is missing everywhere, only that it is not resolved by the mod.
