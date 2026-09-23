# ADR-0045: A map backdrop draws the visibility flags the reader toggles

- **Status:** Accepted (2026-09-21)
- **Date:** 2026-09-21
- **Crates:** none. The rule is frontend, in `src/modules/viewport/assets/parsing/mapBuffer.ts`
- **Related:** Supersedes the layer sentence of
  [ADR-0044](0044-a-map-backdrop-ships-in-one-buffer.md), which drew layer 0 alone.
  [A variant at mask 255 stacks in every layer](https://github.com/LeagueToolkit/ltk-manager/issues/653)
  holds the visibility controllers, which this decision leaves out.

## Context and problem statement

Every mesh of a `.mapgeo` carries an 8-bit visibility mask, and the engine draws a mesh when its
mask shares a bit with the active flags. A backdrop fixed to bit 0 draws Summoner's Rift, Howling
Abyss, Arena and Map453 whole, and draws some TFT boards close to empty.

A TFT board is two variants of itself on two layers, with bit 0 reached only by the few meshes
every layer shares. Measured over the 16.18 install:

| map    | files | bit 0 draws under half | examples                                       |
| ------ | ----: | ---------------------: | ---------------------------------------------- |
| Map11  |    26 |                      0 | SR draws 71.4% at bit 0, the rest is variants  |
| Map12  |     5 |                      0 | every mesh at `0xff`                           |
| Map22  |   157 |                     22 | `05f66766c8a9e452` 0.1%, `4a5521e34950a70c` 0% |
| Map30  |     9 |                      0 | every mesh at `0xff`                           |
| Map453 |     1 |                      0 | every mesh at `0xff`                           |

`05f66766c8a9e452` is the pattern: every board piece twice, `Project_Arena_Board_A_Mat` on `0x40`
and `Project_Arena_Board_A_Level7_Mat` on `0x08`, 812 triangles each.

No bin read here names the flags a map starts on. `MapVisibilityFlagDefinitions` holds a flag
range and a random pick, and no object of that class is in `Map11`, `Map22`, `Global`, `DATA`,
`TFTCommon`, `TFTSet16` or `TFTSet17`.

## Decision

**The active flags are a mask the reader toggles, one tick per layer the map names.** A mesh draws
when its mask shares a bit with the active set, the engine's own test, so two variants ticked
together stack.

**A map opens on bit 0 while bit 0 draws at least half its triangles, and otherwise on the layer
that draws the most.** A tie goes to the lower bit. This keeps every non-TFT file on bit 0 and opens
each of the 22 boards on one whole variant.

**The same flags filter the particles and structures a map stands**, which carry masks of their
own, so a board's props match the board drawn.

**Where a subject stands is taken from the opening flags, not the active ones.** A toggle moves no
subject and reframes no camera, and a reader who clears every tick still has a map to stand on.

## Consequences

**The menu lists only the layers some mesh names**, with the triangles each draws, shared meshes
counted on every layer they sit on. Summoner's Rift lists all eight, since its `0xff` meshes name
them.

**A mesh at mask 0 draws under no flags.** 295,984 of Map11's 22.4M triangles and 14,533 of Map22's
sit there. What turns them on is outside the mask, and so outside this menu.

**The layer is a bit index, not a name.** Summoner's Rift names its elemental variants in
`MapSkin.mAlternateAssets`, but by flag name, and nothing read here maps a name to a bit. The menu
reads `Layer 1` through `Layer 8`.

**The flags reset per map.** A toggle is held against the geometry it was made on, so choosing
another variant opens on that variant's own flags.
