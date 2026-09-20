# ADR-0044: A map backdrop ships in one buffer

- **Status:** Accepted (2026-09-20)
- **Date:** 2026-09-20
- **Crates:** `ltk-manager-core`, in `preview/map`
- **Related:** [ADR-0035](0035-a-skinned-preview-is-a-skinned-mesh-posed-by-a-baked-clip.md), whose
  `ltk-asset` buffer forms this one joins. The decision issue is
  [Bucket grid size and draw radius](https://github.com/LeagueToolkit/ltk-manager/issues/644),
  which holds the measurement, and
  [LTKM wire format](https://github.com/LeagueToolkit/ltk-manager/issues/643), which holds the
  format table.

## Context and problem statement

A preview draws its subject over a flat grey plane. Putting the game's own map behind it means
getting a `.mapgeo` to the webview, and a shipped one is large: Summoner's Rift is 586 meshes and
2,042,809 vertices, and the largest in the install is 723 meshes and 2,611,249.

Every comparable renderer answers this with a spatial grid. Geometry is cut into cells, a manifest
says what each cell holds, and a radius around the camera decides what is fetched. The effort was
charted that way: a bucket was one grid cell crossed with one material, streaming was continuous,
and the draw budget was a radius.

The engine's own data offers the grid ready-made. Every file with a mesh carries a scene graph, and
graph 0 is a 128 by 128 bucket grid of roughly 120 units.

## Decision

**A map is one buffer, fetched once, holding every mesh.** There is no grid, no radius, no
manifest and no streaming.

**Every mesh's vertices are concatenated into one flat block per channel, with the mesh's own
transform baked in and its indices made absolute.** A mesh table and a submesh table delimit them.
The webview builds one `BufferGeometry` and adds one group per submesh, so a draw call is a
submesh and the whole map is one upload.

**A visibility layer is filtered by rebuilding the group list**, not by refetching. One layer is
drawn, defaulting to layer 0.

The format is `LTKM` v1, written by `preview/map.rs` and read by
`src/modules/viewport/assets/parsing/mapBuffer.ts`, beside the `LTKG`, `LTKS` and `LTKA` buffers
already on the `ltk-asset` scheme.

### Why not the grid

Measuring what a grid would save, against live Summoner's Rift:

| cell | buckets | manifest | max verts in a bucket |
| ---- | ------: | -------: | --------------------: |
| 120  |  21,155 |  661 KiB |                 4,064 |
| 500  |   4,017 |  126 KiB |                23,754 |
| 1000 |   1,892 |   59 KiB |                47,004 |
| 2000 |     951 |   30 KiB |                91,816 |

The best grid saves roughly six times the bytes and one and a half times the draws. It buys that
with a manifest, a streaming budget, a bucket definition fixed before the map is read, and a ground
raycast that has to cope with geometry not yet uploaded.

Two figures decide it rather than the ratio. A whole map is 600 draws, which three.js draws without
complaint, so the grid was never buying a draw-call budget. And the largest cells put more than
65,536 vertices behind one material, which the source files' own `u16` index buffers cannot
address, so they were not available anyway.

For a photo mode a creator opens to take one picture, a fetch of 73 to 93 MiB once is the right
trade against a streaming system that is never idle.

## Consequences

**The wire cost is the whole map.** 72.8 MiB for Summoner's Rift and 93.1 MiB for the largest file
in the install, at `f32` positions, normals and `uv0`, `u32` indices, and `uv1` only where the map
has it. A creator waits seconds on first open, and nothing after.

**32-bit indices, not 16.** A flat block holds more vertices than a `u16` addresses. This costs
10.4 MiB on Summoner's Rift over 16-bit indices and retires the source format's 65,536 cap rather
than working around it.

**Baking duplicates a shared buffer.** A `.mapgeo` reuses one vertex buffer across meshes that
differ only by transform, up to 35 of them. Baking writes each mesh's own copy. Measured at 2.7%
more vertices on Summoner's Rift and none at all on Map12, Map30 or Map453.

**A per-mesh bound is computed, not copied.** A mesh the game places through a map region states
its bounding box in the region's space, so the file's own box disagrees with the drawn vertices for
13 of Summoner's Rift's 586 meshes. The encoder writes the bound it computed and sets a flag bit on
those meshes.

**Adding a channel later is not a version bump.** The flags word carries `uv1` and reserves bits
for vertex colour and `Texcoord5`, so the channels v1 leaves out are added under a bit the way
`LTKG` v2 added its skin block.

**The webview reads views rather than copies.** Blocks are four-byte aligned and the strings are
last, so a typed array is constructed over the arriving buffer. At this size the alternative is
roughly 15 million `DataView` calls and a second copy of the map in memory.
