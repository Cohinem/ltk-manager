# ADR-0005: A repair rewrites the archive in place

Status: accepted (2026-08-28)

Builds on [ADR-0004](0004-the-storage-mode-is-a-per-mod-choice.md), which made a mod's storage
switchable and promised that no conversion deletes the archive.

## Context

Mod health repairs an installed mod by running the Problems rules over it. A mod stored
`project` has a tree the rules write to directly, with a restore point. A mod stored `archive`
has no tree: its content is the archive, so a repair has to unpack into staging, fix there, and
pack the result back into a fantome.

That repacked fantome has to go somewhere. Two designs were on the table:

- **Replace the archive in place.** The repaired fantome takes the archive's path, and the
  original is gone.
- **Keep the original aside.** The repaired fantome takes the path and the pristine download is
  kept beside it, so a later repair recomputes from the original rather than from the last
  repair.

## Decision

**The repaired archive takes the archive's path, and no copy of the original is kept.**

The repack happens in staging, next to the unpacked tree, and the swap is rename-aside,
rename-in, delete-aside - a failed repack cannot lose the original, only a completed one
replaces it.

The recompute-from-original property was the argument for keeping a copy, and it is worth less
than it looks. The shipped rules are lossless and idempotent: a repaired value is a value the
rule stays quiet about, so a chain of patch-day repairs converges rather than compounds. A
future rule that would lose something in repair must ask before writing - that is a property
the rule carries, not one an archive copy can restore.

## Consequences

The repaired archive **is** the mod from then on. Unpacking it, converting its storage, and
building the overlay all read the repair. The file is no longer byte-identical to what the user
downloaded, which is already true of every archive the preserve step rewrote.

ADR-0004's promise holds: the archive is never _removed_, and both storage directions keep
working after a repair. What changes is which bytes the promise protects.

Undo exists only where a tree does. A project-storage repair leaves a `.ltk/restore/` point and
reverses like any fix run. An archive-storage repair is reversed by reinstalling the mod, which
is the same recovery its user had before the repair existed.

A repair that applies nothing must not repack, because a byte-identical round trip is not
guaranteed and a no-op that rewrites the file would invalidate caches keyed on it for nothing.
