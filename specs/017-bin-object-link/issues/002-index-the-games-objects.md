# Issue 017-002: Game object index for link resolution

**Spec**: `017-bin-object-link`  
**Labels**: `area: backend`, `priority: low`  
**Status**: Blocked  
**Blocked by**: a released `ltk_meta` carrying the bin streaming reader, and the manager's pin
moving to it

## Context

Issue 001 reports a link the mod does not resolve. That covers two different risks under one
sentence:

- the installed game defines the target, so the link resolves whenever that bin is loaded
- nothing defines the target anywhere, so the link is null on every machine

The second is worth saying much more loudly than the first, and today the rule cannot tell them
apart. Doing so needs the set of object hashes the installed game's bins define.

## Why this is blocked

Building that set means sweeping the object table of every bin in every game archive. The parse the
manager has today reads a bin into a full tree, materialising every property of every object, which
is the wrong shape for reading a list of hashes out of thousands of files.

`league-toolkit` has a streaming reader built for exactly this - mount a bin, sweep its object
table, skip each body by its size field - and it is **not in the published crate**. `ltk_meta`
0.8.0 as released carries no streaming surface. The manager depends on released versions and does
not take path dependencies, so this work starts when that reader is published and the pin moves.

## Acceptance criteria

- An index of the object hashes the installed game's bins define, built from the game's archives.
- Keyed on the game build and cached, in the manner of the existing game index, so it is built once
  and not per sweep.
- Dropped and rebuilt when the game build changes, and when a hashtable sync changes what can be
  named.
- `bin/object-link` consults it and words its finding differently for a target the game defines and
  one nothing defines.
- A machine with no installed game keeps issue 001's behaviour rather than losing the rule.
- Building the index does not block a health check that could otherwise run.

## Out of scope

Runtime residency. Even knowing the game defines a target, whether its bin is loaded when the link
evaluates is not a static property. The wording must stay a statement about what can resolve, never
a promise that it will.
