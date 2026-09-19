# ADR-0043: A built-in mod is a generated project above every mod

- **Status:** Accepted (2026-09-19)
- **Date:** 2026-09-19
- **Crates:** `ltk-manager-core`, in `overlay/builtin_mods`
- **Related:** CONTEXT.md, **Built-in mod**. [ADR-0012](0012-the-overlay-merges-a-mod-over-the-games-copy.md),
  the merge a built-in mod's chunks stay outside of.
  [ADR-0024](0024-a-setting-id-is-its-key-in-settings-json.md), whose flat file the
  `builtinMods` group departs from.

## Context and problem statement

Some changes to the game are a switch rather than a mod. Default ward skins is the first: every
ward shows its own base skin, whatever skin its owner equipped. The user authors nothing, and the
content depends on the installed patch, since each patch can add ward skins.

Every ward kind reads skin N out of SightWard's `skin<N>.bin` in the map archives. The game
falls back to the ward's own `skin0.bin` when that chunk fails to load. A missing chunk fails,
and so does one whose bytes do not start with a bin's magic. A valid bin holding no objects
loads, and leaves the ward with no skin at all.

The overlay builder adds and replaces chunks. It removes none.

## Decision

**A built-in mod is a mod project the manager writes before each build.** It lives under
`<storage>/builtin/<slug>`, is read through `FsModContent` like a workshop project, and is
generated against the installed game. A file whose bytes are unchanged is left alone, so the
builder's content fingerprint holds and an unchanged overlay is reused. The project of a mod
turned off is deleted.

**A built-in mod outranks every other mod.** The order is built-in mods, workshop projects,
enabled mods. The setting is a promise about the game, so an installed mod that ships the same
chunk loses to it.

**Default ward skins breaks each skin bin with four bytes, `JUNK`.** It overrides every
`data/characters/sightward/skins/skin<N>.bin` with N from 1 to 511 that an archive in
`DATA/FINAL/Maps/Shipping` holds, in that archive. Ids are generated and matched against each
archive's chunk table, so no hash list is needed and a new patch's skins are picked up.

## Consequences

- Turning a built-in mod on makes the overlay carry its own copy of each archive it touches. For
  default ward skins that is every map archive, several GB.
- The effect is on the user's screen alone. Every other player's wards show default there, and
  the server still names the equipped skin.
- `JUNK` stands in for a removal the builder cannot make. Chunk removal in `ltk_overlay` replaces
  it, and the project then declares removals rather than files.
- A **merge** must pass a built-in mod's chunk through untouched. A `JUNK` chunk merged over the
  game's bin would load, and the fallback would not fire.
- A second built-in mod is a variant of `BuiltinMod`, a generator returning a
  `GeneratedProject`, and a field of `BuiltinMods` in the settings.
- The switches nest under one `builtinMods` object in `settings.json`, the one group in a file
  ADR-0024 keeps flat. The row's id is `patching.defaultWardSkins` and its key the path
  `builtinMods.defaultWardSkins`.
- A built-in mod on is something to patch. Play and the patcher start with no library mod
  enabled while one is on.
