# ADR-0002: `library.json` is the only record of a mod

Status: accepted (2026-08-26)

Amends ADR-0001, which described a `.ltk/` directory inside each mod.

## Context

The slug layout gave every installed mod a `.ltk/identity.json` holding its id, its installed-at
timestamp and the format it came from, and kept the archive beside it at `.ltk/archive.<ext>`. The
sidecar existed to survive a lost `library.json`: a directory that says who it is can be
re-registered under the id the profiles already name.

Two things are wrong with that.

The identity is a **second copy of what the index already holds**. Every field on it is a field on
the mod entry, so the two can disagree, and the code that reads a mod has to decide which one wins.

The recovery it buys is **mostly imaginary**. The profiles, the folders and the enabled sets live in
`library.json` too. A library that has lost it has lost everything the ids referred to, so restoring
the ids restores nothing. The one case left is a `library.json` restored from an older backup beside
a newer `mods/`, which is not worth a file per mod on every install.

`.ltk/` also made the archive hard to find. A user wanting the file they installed from had to open
a dot directory inside the mod, and deleting a mod by hand meant knowing to look there.

## Decision

**The mod entry in `library.json` is the whole record.** It carries the id, the installed-at
timestamp, the format, the slug, the fault, and a `storage` field saying where the content is. There
is no `identity.json` and no `.ltk/` inside an installed mod.

**The archive sits beside the directory it belongs to**, at `mods/<slug>.<ext>`. A mod is then two
adjacent entries under `mods/` with the same name, which is what makes it manageable by hand.

**A directory under `mods/` that no entry claims is adopted as a new mod**, with a fresh id. What
sits beside it says how to read it: a `.modpkg` means the content is in the archive and the
directory holds only extracted metadata, and anything else means the directory is the content.

## Consequences

A lost `library.json` costs the ids. The mods themselves come back — every directory under `mods/`
is re-adopted on the next reconcile — but they come back as new mods, so profiles restored from a
backup no longer name them. This is the trade the second paragraph above accepts.

Storage is now recorded rather than inferred. `is_packed` was `format == modpkg || slug.is_none()`,
a guess that a fantome awaiting the layout migration made subtle: it is packed despite its format,
because its content is still in `archives/`. The v1-to-v2 schema migration writes `archive` onto
every entry it carries forward, and the layout migration writes the real answer as it converts each
one.

`mods/` now holds files as well as directories. Discovery skips non-directories, and slug assignment
treats a directory and the archive beside it as one claim on the name, so an archive whose directory
is gone cannot be inherited by the next mod that slugifies the same way.

Nothing migrates a library that already has `.ltk/` in it. That layout only ever existed on a branch
between two commits, so no released build wrote one, and carrying a repair pass for it forever would
be paying for a state no user can reach.
