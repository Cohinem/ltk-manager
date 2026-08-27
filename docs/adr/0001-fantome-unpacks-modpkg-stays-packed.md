# ADR-0001: A fantome unpacks, a modpkg stays packed

Status: accepted (2026-08-26), amended by [ADR-0002](0002-library-json-is-the-only-record.md) and
[ADR-0003](0003-the-layout-migration-moves-files-it-does-not-convert-them.md), and extended by
[ADR-0004](0004-the-storage-mode-is-a-per-mod-choice.md)

ADR-0003 narrows this one to mods arriving now. A mod already in the library is moved onto the slug
layout rather than converted, and keeps reading out of its archive.

## Context

A mod reaches the library as a `.fantome` or a `.modpkg`, and until now both were stored the same
way: the archive under `<storage>/archives/<uuid>.<ext>`, and a near-empty `<storage>/mods/<uuid>/`
holding the extracted `mod.config.json` and a thumbnail. Every overlay build re-read the archive.

The two formats are not alike, though, and treating them alike costs one of them.

`.modpkg` is a format we own. It is mountable — reading its chunk table costs one seek, and a
single chunk can be read without touching the rest. Its metadata is structured, its paths survive
intact, and the same file is the source of truth for its content. Streaming it is what it was
designed for.

`.fantome` is a zip somebody else's tool wrote. In practice they arrive with bad CRC32 values that
the zip crate rejects outright, with WADs stored _packed_ inside the zip (so reading one file means
mounting a WAD inside an archive), and with `RAW/` entries whose paths only mean something once
routed through the game index. A packed WAD's chunks carry no names at all — resolving them needs
the hashtables, which is work that has no business happening once per overlay build. None of that
gets cheaper by being deferred: it is paid on every build, and the failure modes are paid at the
worst possible moment.

## Decision

**A fantome is materialized as a mod project at install time.** `FantomeImporter` unpacks it into
`mods/<slug>/content/base/`, resolving packed-WAD chunk names through the hashtables once, and the
overlay reads it through `FsModContent` from then on. The archive is kept at `mods/<slug>.fantome`,
beside the directory it belongs to, only if the user asked for it — deleting it changes nothing
about whether the mod works.

**A modpkg stays packed.** Its archive lives at `mods/<slug>.modpkg`, is never optional, and the
overlay reads it through `ModpkgContent`.

**The provider is chosen by storage, never by provenance.** A mod entry records where its content
is, and `format` records only the file it came from. Nothing branches on `format` beyond "is this a
modpkg". A mod project discovered under `mods/` that this app never installed records its source as
`unknown` and reads exactly like an imported fantome does.

## Consequences

Reveal in Explorer opens a folder with a name and real content in it, which is most of why users
asked for this. Overlay builds stop paying the unpack, and a malformed zip fails once, at install,
where it can be reported — instead of at patch time.

Disk use goes up for a fantome the user keeps the archive of, roughly doubling that mod. The
`retainModArchives` setting is the answer, and it is on by default because throwing away the only
copy of what a user installed is not a default.

Every library written before this needs its files moved onto the slug layout, which is the layout
migration. ADR-0003 has it move them rather than convert them, so the mods already installed keep
reading out of their archives — and ADR-0004 lets the user convert any one of them afterwards.

A **sanitized-fantome storage mode** is left open — a repacked, well-formed archive that
`FantomeContent` could stream, which would recover the disk cost without giving up the guarantees.
It is blocked upstream by the fantome packer dropping RAW files, and the entry's `storage` field is
what makes adopting it later a value change rather than another layout migration.
