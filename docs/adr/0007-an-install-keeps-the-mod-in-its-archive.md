# ADR-0007: An install keeps the mod in its archive

Status: accepted (2026-08-29), reversing the install default of
[ADR-0001](0001-fantome-unpacks-modpkg-stays-packed.md) and amending the
never-deleted clause of [ADR-0004](0004-the-storage-mode-is-a-per-mod-choice.md)

## Context

ADR-0001 had `FantomeImporter` materialize every fantome as a mod project at install time. The
costs it was paying for — mounting a WAD inside a zip on every build, resolving nameless chunks
through the hashtables per build, malformed zips failing at patch time — were real, but two things
have moved since.

First, the preserve. An import now copies the archive through `preserve_archive_names`, which
embeds the names the community tables cannot recover into the archive itself. The archive stopped
being a lossy keepsake and became self-carrying: everything a later unpack needs rides inside it.

Second, the archive read path never went away. ADR-0003 left every pre-migration library reading
fantomes out of their archives through `FantomeContent`, and that path has been the shipped
behavior for those libraries all along. Bad CRC32 values are read past, packed WADs mount
in-memory, and the overlay routes chunks by hash, so hex names cost a build nothing.

What the unpacked default cost, meanwhile, was disk — roughly double per mod with retention on,
which it was by default — and an install that did the whole unpack whether or not the user ever
wanted a project on disk.

## Decision

**An install lands as `archive` storage, for every format.** Staging copies the archive (through
the preserve, for a fantome) and extracts its metadata — `mod.config.json` and the thumbnail —
into the mod directory, and nothing else. `installed_storage` maps `Fantome` and `Modpkg` both to
`Archive`. Only `Unknown`, a discovered project directory with no archive at all, records
`Project`.

**Unpacking is the opt-in, not the default.** ADR-0004's per-mod switch is unchanged and is now
the only path that writes a content tree into the library. A user who wants Reveal to open real
content, or wants to edit the tree, unpacks that one mod from its card.

**An unpack consumes the archive, and a repack rebuilds one.** Once the tree stands, the archive
is a second copy of the same mod, which is the disk cost this ADR exists to stop paying — so the
unpack deletes it. The way back is `ProjectPacker` packing the tree into a fresh archive, the same
pack a repair of an `archive` mod already runs. Exactly one of the two — tree or archive — is the
mod at any moment, and the switch stays offered both ways. What the fantome format carries on that
trip is the pack format's contract, owed upstream, not something this decision re-litigates.

**The `retainModArchives` setting is removed.** It governed whether a project-storage install kept
its source archive, and no install produces one of those any more. The archive is the mod for
`archive` storage and consumed by an unpack, so the setting had nothing left to govern. The key
still parses in an existing config and is ignored.

**The long-path preflight moves entirely to the unpack.** An install writes no content tree, so
nothing at install can exceed the legacy Windows path limit. The conversion's own preflight and
post-write verification, which already existed, are now the only guards.

## Consequences

Installs get cheaper by exactly the unpack, and a library of fresh installs takes roughly half the
disk it did. Overlay builds pay the fantome archive read for new installs — the same cost every
pre-migration library has been paying without complaint, and one clean build after an unpack was
already the rule when a provider changes.

Reveal in Explorer opens a directory holding metadata rather than content, which walks back part
of ADR-0001's stated motivation. The unpack from the card is the answer for the user who wants
that, per mod, at the price of that mod's disk.

A malformed fantome again fails at first content read rather than at install — except that the
preserve still opens and walks the archive at install, so an unreadable zip still refuses there.

A repacked archive is a packed one, not the file the author shipped: the round trip goes through
the pack format, so the original bytes are gone after the first unpack. The preserve already made
the tree carry the mod's names, which is what makes that acceptable.
