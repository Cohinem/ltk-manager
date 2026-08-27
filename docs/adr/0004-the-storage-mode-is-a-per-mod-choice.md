# ADR-0004: The storage mode is a per-mod choice

Status: accepted (2026-08-26)

Builds on [ADR-0003](0003-the-layout-migration-moves-files-it-does-not-convert-them.md), which left
both storage modes live at once and reserved the field that says which one a mod is in.

## Context

After the layout migration a library holds two kinds of fantome. One installed since this release is
an unpacked mod project: Reveal opens readable content, and the overlay builds without touching a
zip. One the migration moved is still read out of the archive beside it, exactly as it was before.

Which of the two a mod ended up in is an accident of when it was installed. That is a bad thing to
be permanent, in both directions:

- A user who wants the unpacked layout for a mod they have had for a year can only get it by
  uninstalling and reinstalling, which loses the id — and with it the mod's place in every profile,
  its folder, and its layer states.
- A user short on disk has no way to hand back the unpacked copy of a mod whose archive they kept,
  which is the duplicate ADR-0001 accepted.

ADR-0003 already made this a value change rather than a layout change. Nothing about the directory
moves, and nothing outside the mod refers to what is inside it.

## Decision

**A mod's storage is switchable from its card, both ways.** _Unpack_ writes the archive out as a mod
project, _repack_ deletes the unpacked tree, and the entry's `storage` records which one is now
true.

**Unpacking is the install path, pointed at a mod already in the library.** The same
`FantomeImporter`, the same staging directory outside the index lock, the same swap under it. There
is no second implementation of "turn a fantome into a project" to keep in step with the first, and a
mod that unpacks now is byte-identical to the same mod installed fresh.

**What the user typed survives the round trip.** An import describes the archive, so a fresh one
would revert the display name, the tags, the champions, the maps and the thumbnail to whatever the
author shipped. Those five are carried across from the config being replaced. The layer table is
not: it came from the archive to begin with.

**The archive is never deleted by a conversion, whatever `retainModArchives` says.** That setting is
about what an install keeps. Here the archive is the only thing either direction can convert
against, so removing it would silently make the choice one-way — and after a repack it would be the
only copy of the mod at all.

**A modpkg is not offered either direction.** Its archive is where its content lives, so there is no
unpacked form of it to switch to. Neither is a mod that has faulted, or one whose archive is gone.

## Consequences

`storage` stops being a record of when a mod was installed and becomes something the user owns. The
two modes have to keep working side by side indefinitely, which they already did.

A repack is not reversible on a mod whose archive was never kept, and the card simply offers
nothing. That is the same dead end `retainModArchives` off has always produced, surfaced one step
earlier.

The conversion invalidates the mod's cached WAD report and forces one clean overlay build, because
the provider underneath it changed while nothing in the builder's reuse key moved.

A future sanitized-fantome mode — ADR-0001's open door — is a third value here and a third menu
entry, not another migration.
