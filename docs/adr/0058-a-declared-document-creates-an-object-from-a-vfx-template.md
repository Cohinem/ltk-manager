# ADR-0058: A declared document creates an object from a VFX template

- **Status:** Accepted (2026-09-29)
- **Date:** 2026-09-29
- **Crates:** `ltk-manager-core`
- **Related:** Extends the origins of [ADR-0049](0049-a-declared-document-creates-and-removes-objects-through-a-target-module.md).
  `docs/plans/vfx-templates.md` sections 2.4 to 2.6.

## Context and problem statement

ADR-0049 gives a new object two origins: a clone of an object the document holds, and an empty
object of a class. A VFX system started from nothing draws nothing, and the editor ships starter
systems an author begins from. Neither origin can carry one, and a class-made object filled
through property edits would be one undo step per edit.

## Decision

**A new object has a third origin, a template.** `NewObject::Template { id }` names a system
template of the core crate's catalog. The object is the template's value, with its `particleName`
and `particlePath` rewritten to the new name as a clone rewrites its own-name strings, and it is
declared as `class` with a `set` of the value. The plan is checked and taken back as every
creation of ADR-0049 is.

**A plain bin creates no object from a template either.** The template's emitters land in a system
the document already holds instead, as one property edit.

## Consequences

- **Positive:** a new effect is one step and one undo step, and it previews at once.
- **Negative:** the declaration carries the template's whole value, so a template's manifest entry
  is long.
- **Neutral:** the catalog lives in the core crate, which the command reads and which the Rust
  checks cover.
