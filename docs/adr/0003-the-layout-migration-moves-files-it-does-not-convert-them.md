# ADR-0003: The layout migration moves files, it does not convert them

Status: accepted (2026-08-26). The quarantine it gave a failed conversion is superseded by
[ADR-0008](0008-a-failed-conversion-stays-in-the-legacy-layout.md), which leaves the mod in the
legacy layout and retries it.

Amends ADR-0001, which had the migration unpack every fantome in an existing library.
[ADR-0004](0004-the-storage-mode-is-a-per-mod-choice.md) builds the per-mod toggle this one reserved
room for.

## Context

ADR-0001 decided that a fantome is materialized as a mod project at install time, and treated the
layout migration as the moment to apply that to every mod already installed. Each mod was unpacked
through `FantomeImporter`, verified against its archive byte for byte, and its old files deleted
only after the new directory matched.

That is a lot of machinery pointed at a library that already works. It cost:

- **Time and disk.** Every mod is rewritten. The modal had to survey free space and refuse to start
  under 3x the archive size, and refuse again when Windows long paths were off, because unpacking a
  WAD tree writes paths the move never would.
- **Risk concentrated at one moment.** Every mod's content provider changed at once, for a user who
  asked for none of it.
- **A worse failure mode.** A conversion that failed quarantined the mod, so a user could open the
  app to find part of their library greyed out.

Meanwhile the thing being avoided — `FantomeContent` reading a zip on every overlay build — is what
every v1 library does today and has always done. The migration was not fixing a broken state. It was
upgrading a working one, at the cost of being the riskiest thing the app does.

## Decision

**The layout migration moves files and nothing else.** For each mod, `mods/<uuid>/` is renamed to
`mods/<slug>/` and `archives/<uuid>.<ext>` is renamed to `mods/<slug>.<ext>` beside it. Two renames,
same volume, no unpack and no copy. The entry records `storage: archive`, which is where its content
was before and still is.

**A migrated mod reads exactly as it read before.** `FantomeContent` for a fantome, `ModpkgContent`
for a modpkg, chosen by `storage` as always. The only thing that changed is where the file sits.

**Installing still unpacks.** ADR-0001's reasoning holds for a mod arriving now: the cost is paid
once, at import, where a malformed archive can be reported to the person who just chose it. New
fantome installs are `storage: project` and nothing about that changes.

**The two storage modes coexist, per mod, permanently.** `storage` is a field, so a library holds
both, and a future per-mod toggle can convert either way without another layout migration.

## Consequences

The migration is now fast enough to be uninteresting, needs no free space, and cannot strand a mod
on a long-path limit. The free-space and long-path gates are gone, along with the inline
keep-archives switch, which had nothing left to decide.

**And so is the modal.** A blocking question is worth asking about a pass that rewrites a library.
It is not worth asking about two renames per mod, where the only honest answer is yes and the cost
of waiting for it is the app not starting. The migration runs at startup, ahead of the first
reconcile, holding the index lock for the whole run — so every other reader blocks on it rather than
seeing a library half-moved. A toast reports it, and a dialog lists what could not be moved.

Migrated mods keep the overlay-build cost ADR-0001 wanted to remove, and Reveal in Explorer opens a
metadata directory rather than readable content. Both are what those mods already did. Users who
want the unpacked layout get it by reinstalling the mod today, and by the storage toggle when it
lands.

The migration still opens each archive once, to read `META/info.json` or a modpkg header. Two things
depend on that. An archive that cannot be opened faults the mod, in a list at the end of the run
rather than at patch time. And a fantome's cached config gets its layer table restored: the pre-slug
layout wrote it through `ModProject::from(FantomeInfo)`, which resets the table to `default_layers()`
and silently drops every string override the archive declares. Nothing reads the archive's metadata
again after this, so the migration is the last chance to repair it.

`verify_fantome` is gone, since nothing converts any more. The golden tests that compare an archive
against its import remain, holding the _install_ path to the same faithfulness the verifier checked.
