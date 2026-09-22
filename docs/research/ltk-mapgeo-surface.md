# What ltk_mapgeo gives a map backdrop, and what a parse costs

Research note for wayfinder ticket #637, on the map #635. It answers the ticket's eight questions
in its own numbering. Section 9 records what it does not settle.

Every count, byte figure and timing below was measured on 2026-09-20 against a live install,
`C:/Riot Games/League of Legends/Game`, content version
`16.18.8175716+branch.releases-16-18.content.release`. Nothing was written to the install.

## Method

Two throwaway binaries outside this repository did the measuring. The first mounts every
`.wad.client` under `Game/DATA/FINAL`, sniffs each chunk's magic through
`LeagueFileKind::identify_from_bytes` over a decompressed prefix, and writes out every chunk whose
bytes read as `OEGM`. That yields 201 files, 2.5 GB. The second parses all of them through
`EnvironmentAsset::from_reader` and reports shape, layout, resident-set delta and wall time. A
third walks the same files by hand, byte for byte against `ltk_mapgeo/src/read/`, to measure what a
manifest would cost if the crate offered one.

The crate came in by path from the working copy at `~/dev/lol/league-toolkit` under WSL, after
checking that copy against the published 0.1.7 (section 1). Version compatibility was settled in a
separate scratch crate carrying this repository's exact `[patch.crates-io]` block. Nothing was
added to this repository's own `Cargo.toml`.

Where this note names a map file, it names the WAD chunk hash rather than a path, except where the
path is resolved. `data/maps/mapgeometry/map11/base_srx.mapgeo` is chunk `f906e4fcae07efa9` of
`Map11.wad.client` and is the live Summoner's Rift geometry, which
`docs/research/map-data-layout.md` establishes independently. Its figures here match that note's
section 6 field for field.

## Sources

- `~/dev/lol/league-toolkit/crates/ltk_mapgeo/src/` - the whole crate, read rather than its docs
- `~/dev/lol/league-toolkit/crates/ltk_mesh/src/mem/` - `VertexBuffer`, `IndexBuffer`,
  `VertexBufferAccessor`, `vertex_element.rs`
- `~/dev/lol/league-toolkit/crates/ltk_shader/src/` - `lib.rs`, `loader.rs`, `toc.rs`, `defines.rs`
- `~/.cargo/registry/src/index.crates.io-*/ltk_mapgeo-0.1.7/` - the published crate
- `Cargo.toml` and `Cargo.lock` at this repository's root
- `crates/ltk-manager-core/src/preview/mesh.rs` - the shape a preview reader is handed
- `docs/research/map-data-layout.md` - the sibling note on where map files live and how a material
  resolves

## Headline

- **The published crate drops in.** `ltk_mapgeo` 0.1.7 is byte-identical to the working copy and
  resolves against the pins already in `Cargo.toml`. It needs no `[patch.crates-io]` entry.
- **There is no header-only read, and the plan does not need one.** `from_reader` is the only
  entry point and it materialises every vertex buffer. A manifest costs a full parse, so a
  `MapCache` warmed by `read_map` covers it. The parse is not the expensive half anyway: the WAD
  chunk takes 160 to 185 ms to decompress against 48 to 58 ms to parse.
- **An SR asset costs 85.7 MiB resident.** Two held at once cost 173.6 MiB. The largest shipped
  container would make that 221 MiB.
- **`LTKM` cannot assume `f32`.** The second UV set is `Texcoord7`, and normals and both UV sets
  ship packed as `f16` on four of the five map ids. `ltk_mesh`'s accessor has no half decoder and
  does not check the format it is asked for.

## 1 Publication

Confirmed on all three counts.

`ltk_mapgeo` 0.1.7 was published 2026-09-14 from `202d02ca`. All twenty files under `src/` in the
registry copy are md5-identical to the working copy at `3c2d68c`, which has no uncommitted change
under `crates/ltk_mapgeo`. Every measurement in this note therefore holds for the published crate.

Its manifest asks for `byteorder`, `bitflags`, `thiserror`, `glam`, `ltk_io_ext` 0.4.5,
`ltk_primitives` 0.3.5 and `ltk_mesh` 0.4.6.

A scratch crate carrying this repository's four patch entries verbatim, plus `ltk_mapgeo = "0.1.7"`
beside `ltk_mesh` 0.4.6, `ltk_wad`, `ltk_file`, `ltk_hash`, `ltk_meta` and `glam` 0.27, compiles
clean. The resolution:

| crate            | resolves to                   | copies |
| ---------------- | ----------------------------- | -----: |
| `glam`           | 0.27.0 from the registry      |      1 |
| `ltk_mesh`       | 0.4.6 from the registry       |      1 |
| `ltk_primitives` | 0.3.5 at the patched git rev  |      1 |
| `ltk_io_ext`     | 0.4.4 patched, 0.4.5 registry |      2 |

`ltk_primitives` matters most and comes out single. `ltk_mapgeo`, `ltk_mesh` and `ltk_meta` all
take the patched 0.3.5, so `AABB` is one type across the three and a bounding box read out of a
mapgeo is the same type the bin side already uses.

The `ltk_io_ext` split is not new. The patch pins that crate to a rev whose version is 0.4.4, which
does not satisfy `ltk_mapgeo`'s `^0.4.5`, so cargo takes the registry 0.4.5. Both copies are
already in `Cargo.lock` today, at lines 3257 and 3268, because `ltk_mesh` and `ltk_wad` are on the
0.4.5 side and `ltk_meta` on the patched side. `ltk_mapgeo` joins the side that already exists and
adds nothing. `ltk_io_ext` is an extension-trait crate with no type crossing the boundary here.

**No `[patch.crates-io]` entry is needed.** One line under `[workspace.dependencies]` is the whole
change.

Two facts about the top-level type that a cache wants:

- `EnvironmentAsset` is `Send + Sync`, verified by a compiled bound. All its fields are owned
  plain data.
- It derives `Debug` alone. There is no `Clone` and no `Default`, so a cache holds it behind an
  `Arc` and hands out borrows.

## 2 Header-only parsing

**A manifest costs a full parse.** `MapCache` warmed by `read_map` covers it, and nothing in the
backdrop plan has to change.

The file's order, from `read/mod.rs`:

```
magic "OEGM"              4 bytes
version                   u32
separate point lights     u8, version < 7 only
shader texture overrides
vertex declarations
vertex buffers            length-prefixed, seeked past on the first pass
index buffers             length-prefixed, read in full
meshes                    name, buffers, submeshes, AABB, transform, quality, visibility
scene graphs
planar reflectors         version >= 13
vertex buffers            seeked back to and decoded
```

A mesh's `bounding_box()`, `transform()`, `quality()`, `visibility()` and its submeshes'
`material()` all sit in the mesh table, which follows both buffer blocks. Both blocks are
length-prefixed, so the format allows walking to the mesh table without decoding a single vertex.

The crate does not expose that walk, and cannot be coaxed into it:

- `from_reader` is the only public entry point. There is no feature flag and no second reader.
- Materialising the vertex buffers is unconditional and cannot be reordered. The file does not say
  which declaration a vertex buffer uses, so the crate infers it from the meshes that reference the
  buffer. It reads the mesh table first, then seeks back for the bytes. Skipping the buffers would
  mean forking the reader, not calling it differently.

A hand-rolled walk shows what is on the table and why it is not worth taking. Skipping both buffer
blocks by their length prefixes reaches the end of the mesh table over an in-memory slice in:

| file                              | version | mesh table ends at | of file bytes | walk |
| --------------------------------- | ------: | -----------------: | ------------: | ---: |
| `map11/base_srx.mapgeo`           |      18 |         85,171,458 |    91,726,524 | 57us |
| `map11/base.mapgeo`               |      14 |         22,439,845 |    27,582,633 | 95us |
| `map12/base.mapgeo`               |      17 |         18,145,527 |    21,349,027 | 36us |
| `Map453` chunk `d953dd2da196161a` |      18 |         26,447,148 |    40,030,784 | 46us |

The walk reports the same 586 meshes, 600 submeshes and 183 distinct materials for `base_srx` that
the crate reports, so the two agree on the manifest.

Against 48 to 58 ms for the full parse that looks like a thousandfold saving, and it is not one,
because the bytes have to be there first. The geometry is a zstd chunk inside the archive, so a
seek in the file is a decode of everything before it. Measured on `Map11.wad.client`, three runs,
warm page cache:

| step                              | cost          |
| --------------------------------- | ------------- |
| mount the archive                 | 25 ms         |
| decompress the chunk              | 160 to 185 ms |
| `from_reader`, first in a process | 48 to 58 ms   |
| `from_reader`, warm allocator     | 6 to 7 ms     |

23,050,378 compressed bytes become 91,726,524. The decompress is three to four times the parse and
a manifest cannot avoid it. A manifest that skipped the parse would save at most a fifth of the
cost of having a manifest at all.

`from_reader` takes `Read + Seek`, which it needs for the seek back to the buffer offsets. A
`Cursor<&[u8]>` over the decompressed chunk satisfies it, and that is the shape
`preview::mesh::render(bytes: &[u8])` is already handed.

## 3 Memory

A parsed asset costs about what its file costs. Across the 200 files that parse, the sum of owned
allocations tracks the file size to within a couple of percent, because the vertex and index
payloads are over 90 percent of both.

Live Summoner's Rift, `base_srx.mapgeo` at v18, 91,726,524 bytes on disk:

| measure                             |      cost |
| ----------------------------------- | --------: |
| resident-set delta, one asset held  |  85.7 MiB |
| resident-set delta, two assets held | 173.6 MiB |
| sum of owned allocations            |  87.8 MiB |

The two agree to 2.5 percent, which is the allocator's own overhead. Where it goes:

| block           |    KiB |
| --------------- | -----: |
| vertex buffers  | 78,150 |
| scene graphs    |  6,404 |
| index buffers   |  5,008 |
| mesh records    |    280 |
| strings         |     50 |
| submesh records |     28 |

Mesh records, submesh records and every string in the file together come to 358 KiB, a 0.4 percent
tail on the buffers. A manifest is free to hold, whatever it costs to produce.

Sizing an LRU of two:

- Two SR-class assets cost 173.6 MiB, measured with both alive at once.
- The largest container shipped is a Map11 v18 skin at 115,308,265 bytes, which parses to
  110.4 MiB. Two of those cost about 221 MiB.
- On top of either sits one decompressed chunk in flight, 91.7 MiB for SR, alive from the WAD read
  until `from_reader` returns.

**An LRU of two wants a 175 MiB budget for the common case and 225 MiB for the worst, plus one
file buffer.** Nothing in the crate offers a cheaper hold. There is no borrow of the source bytes,
no memory mapping and no way to drop the vertex buffers while keeping the manifest.

## 4 Version coverage

**Nothing shipped falls outside `SUPPORTED_VERSIONS`.**

Every `.wad.client` under `Game/DATA/FINAL` was swept, the twelve in `Maps/Shipping` and the thirty
beside them. All 201 mapgeo chunks are in the five map archives. `Common.wad.client` holds 78
chunks and none of them is geometry, and neither `Global`, `Companions`, `Scripts`, `UI`,
`ShaderCache.dx11` nor any `TFTSet*` archive holds one.

| archive             | v13 | v14 | v15 | v17 | v18 | total |
| ------------------- | --: | --: | --: | --: | --: | ----: |
| `Map11.wad.client`  |     |   4 |   3 |     |  19 |    26 |
| `Map12.wad.client`  |     |     |     |   4 |   1 |     5 |
| `Map22.wad.client`  |  91 |   3 |     |  65 |     |   159 |
| `Map30.wad.client`  |     |     |     |  10 |     |    10 |
| `Map453.wad.client` |     |     |     |     |   1 |     1 |
| total               |  91 |   7 |   3 |  79 |  21 |   201 |

Five versions are in the wild: 13, 14, 15, 17 and 18. The crate lists eleven, so six of them - 5,
6, 7, 9, 11 and 12 - are support for files no live install carries. v18 is where Summoner's Rift
and the newest containers sit. v13 dominates by count only because TFT ships 91 small per-set
containers.

The module docs in `read/version.rs` say the client's own parser accepts v19 and v20 and that no
map has ever shipped above v18. This sweep agrees with the second half.

**One of 201 files does not parse.** `Map22.wad.client` chunk `e7fc4d80c9e89d6d`, v17, 907,748
bytes, a TFT Set16 carousel container. `from_reader` fails with
`ParseError::Reader(... invalid utf-8 ...)` while reading a string at offset 361,510. A byte walk
written independently of the crate desyncs at the same offset, so the failure is not a crate bug in
the ordinary sense.

The cause is one mesh record. The file holds six. Meshes 0, 1, 3, 4 and 5 carry the full v17 tail -
a baked-light channel, a stationary-light channel, an override count and a baked-paint scale and
bias. Mesh 2 ends 40 bytes early: it carries one channel and stops. Resyncing past it reads meshes
3 to 5 cleanly, ends the mesh table at 362,794 and lands exactly on a scene-graph count of 1. The
file is well-formed everywhere else.

It is a TFT carousel container, so no map a backdrop would draw is affected. What it does mean is
that a `read_map` over an arbitrary container needs a failure path, and the ticket's own decision
that a failed option stays visible and disabled with a one-line reason is the right shape for it.

## 5 Scene graph availability

**Every shipped file that holds a mesh carries at least one.** Reading it is not a choice - it is
on the path `from_reader` already takes.

`asset.scene_graphs()` returns `&[BucketedGeometry]`. For a file below v15 the reader synthesises
exactly one legacy graph rather than reading a count, so a v13 or v14 file always reads back one.
From v15 the file carries a count and a map may hold many.

Across the 200 files that parse: 769 graphs, none disabled. One file has none, a 100-byte Map30
v17 stub with zero meshes. Summoner's Rift at v18 carries 29.

This corrects one row of `docs/research/map-data-layout.md` section 6, which records
`base.mapgeo` v14 as carrying no scene graph. Through this crate it carries one, of 16,384 buckets.

What SR's graph 0 holds:

| field            | value                       |
| ---------------- | --------------------------- |
| buckets          | 128 x 128, so 16,384        |
| bucket size      | 119.95 x 120.56 world units |
| bounds on X      | -523.17 to 14,830.28        |
| bounds on Z      | -540.83 to 14,891.10        |
| global stick-out | 2,809.70 x 2,796.35         |
| vertices         | 196,057 `Vec3`              |
| indices          | 577,527 `u16`               |
| face visibility  | 192,509 flags               |

All 29 graphs together hold 303,592 vertices and cost 6.3 MiB, about 7 percent of the parsed asset.

Worth reading, for two reasons that have nothing to do with the bucket decision:

- `world_to_bucket(x, z)` and `bucket_at(x, z)` are a ready grid index over the map, and graph 0's
  128 x 128 cell of about 120 units is the game's own answer to the cell size a streaming radius
  would otherwise have to invent.
- `face_visibility_flags()` is the only per-triangle visibility data in the file. Everything else
  is per mesh.

One caveat a ground-height raycast has to respect: the graph's triangles are a simplified proxy for
spatial queries, not the drawn geometry. Its 196,057 vertices stand against the drawn asset's
2,042,809.

## 6 Vertex layout

What a mesh hands back:

```
EnvironmentMesh
|-- vertex_buffer_ids() -> &[usize]     one or two indices into the asset
|-- index_buffer_id()   -> usize        one index into the asset
|-- vertex_count(), index_count()
|-- submeshes()         -> &[EnvironmentSubmesh]
|                           material(), start_index(), index_count(), min_vertex(), max_vertex()
|-- bounding_box(), transform(), quality(), visibility(), render_flags()
```

`asset.meshes_with_buffers()` iterates meshes with their buffers and index buffer already resolved.

A mesh has one or two vertex streams. Of the 30,856 shipped meshes, 20,132 have one and 10,724 have
two, and the attributes divide across them: a second stream that carries only `Texcoord0`, or only
`Normal` and `Texcoord0`, is ordinary. A consumer joins them by vertex index.

`VertexBuffer` is interleaved bytes plus the layout describing them: `as_bytes()` for an upload
without a copy, `stride()`, `count()`, `elements()` mapping each `ElementName` to its byte offset,
and `accessor::<T>(ElementName)` for a typed view. `IndexBuffer<u16>` throughout - the format has
no 32-bit index path, so a bucket's index range is bounded at 65,536 vertices by the file itself.

Every element name and format the 200 files use, counted by vertex buffer:

| element        | format            | buffers |
| -------------- | ----------------- | ------: |
| `Position`     | `XYZ_Float32`     |  23,557 |
| `Normal`       | `XYZ_Float32`     |  14,708 |
| `Normal`       | `XYZW_Float16`    |   6,179 |
| `Texcoord0`    | `XY_Float32`      |  10,791 |
| `Texcoord0`    | `XY_Float16`      |   4,301 |
| `Texcoord7`    | `XY_Float16`      |   3,245 |
| `Texcoord7`    | `XY_Float32`      |   1,729 |
| `Texcoord5`    | `XYZ_Float32`     |   2,333 |
| `PrimaryColor` | `BGRA_Packed8888` |   1,822 |
| `Texcoord6`    | `XYZW_Float16`    |       1 |

Four findings follow.

**The second UV set is `Texcoord7`, not `Texcoord1`.** `Texcoord1` through `Texcoord4` never
appear. 10,522 of 30,856 meshes carry `Texcoord7`, which is exactly the number of meshes with a
non-empty baked-light texture, so it is the lightmap UV. `ltk_mesh` names it that way too.

**Coverage is total on the three attributes a backdrop needs.** Every one of the 30,856 meshes
carries `Position`, `Normal` and `Texcoord0` across its streams. 9,217 carry `PrimaryColor`, packed
BGRA. `SecondaryColor` never appears. `Texcoord6` as four halves appears on one buffer in the whole
install, which is the slot `ltk_mesh` reserves for a tangent.

**`Texcoord5` carries three floats.** 2,333 buffers use it, always as `XYZ_Float32`, always in
layouts that also carry `Position` and `Normal`. What it holds is not established here.

**Half formats are common and the accessor cannot read them.**
`VertexBufferAccessor` implements its `Format` trait for `f32`, `Vec2`, `Vec3`, `Vec4` and
`[u8; 4]` only, all of them four bytes per component, and the constructor states in its own doc
that the type is not checked. Asking a `XY_Float16` element for a `Vec2` reads eight bytes where
the element is four and returns two garbage floats, silently. The formats are not a corner case:

| map id            | files using a half format |
| ----------------- | ------------------------- |
| `Map22`, TFT      | 157 of 158                |
| `Map11` v18, SR   | 0 of 19                   |
| `Map11` v14 / v15 | 3 of 7                    |
| `Map12` v18       | 1 of 1                    |
| `Map30`           | 3 of 10                   |
| `Map453`          | 1 of 1                    |

Live Summoner's Rift is entirely `f32`, which is a trap of its own: a `LTKM` writer built and
tested against SR alone passes and then returns garbage on the first TFT or Map453 container. The
writer needs its own half decode, reading `[u8; 4]` through the accessor or slicing `as_bytes()` by
`stride()` and the offset out of `elements()`, and it has to branch on
`buffer.description().elements()` rather than assume a layout.

Summoner's Rift for scale: 586 meshes, 600 submeshes, 571 vertex buffers of 79,882,112 bytes, 401
index buffers of 5,116,044 bytes, 2,042,809 vertices and 910,783 triangles. Per mesh the index
count runs from 6 to 42,963 with a median of 1,455.

## 7 `ResolvedDiffuseTexture` and `resolve_diffuse_texture`

**The crate does not resolve a texture per mesh, and the `.materials.bin` read stays necessary.**

The signature says it. `resolve_diffuse_texture(default_diffuse: &str)` takes the default diffuse
the caller already holds, and the caller can only hold it by having read the material. The crate
never opens a bin. All the method decides is whether to keep that default on UV channel 0 or
replace it with a baked-paint override on UV channel 1, with the scale and bias the mesh carries.

Across all 200 files, **2 meshes of 30,856 take the override branch**: one in a Map30 Cherry
container and one in a Map12 Howling Abyss container. For the other 30,854 the method hands back
the string it was given, `uv_channel` 0, scale `(1, 1)` and offset `(0, 0)`.

On live Summoner's Rift it is the identity. Zero of 586 meshes carry a stationary-light path, a
baked-light path or a texture override, which agrees with `docs/research/map-data-layout.md`
section 6. The method is worth calling for correctness on other maps and buys nothing on SR.

What the crate does give without a bin, per mesh:

- `EnvironmentSubmesh::material()`, the full bin entry path of a `StaticMaterialDef`, which is what
  makes the bin read a direct lookup rather than a search. `material_hash()` is always zero in
  files.
- `MISSING_MATERIAL`, the `-missing@environment-` sentinel the client uses.
- `stationary_light()`, `baked_light()` and `baked_paint()`, each a texture path with a UV scale
  and offset. Non-empty on 15 and 10,522 meshes respectively across the install, and empty on all
  of SR.
- `texture_overrides()`, the v17 per-mesh sampler overrides. These do carry texture paths - the
  Map30 mesh above overrides sampler 0 with
  `ASSETS/Maps/BakedPaint/Maps/MapGeometry/Map30/ArenaA/0.tex`.

One thing the accessor names badly. `asset.shader_texture_overrides()` yields
`ShaderTextureOverride`, whose `texture_path()` returns a **sampler name**, not a path, on every
shipped v17 and v18 file. Both entries on Summoner's Rift are the literal strings
`BAKED_DIFFUSE_TEXTURE` and `BAKED_DIFFUSE_TEXTURE_ALPHA` at sampler indices 0 and 1. That matches
the binding-by-`strcmp` mechanism `docs/research/map-data-layout.md` section 3 cites. Code reading
that table should not treat the value as a path.

## 8 `ltk_shader` 0.3.6

**It carries nothing the material path wants.**

Its whole surface:

```
ltk_shader
|-- ShaderType             Vertex | Pixel
|-- GraphicsPlatform       Dx9 | Dx11 | Glsl | Metal
|-- ShaderMacroDefinition  a name, a value and their hash
|-- ShaderToc              base_defines, shader_hashes, shader_ids
|-- ShaderLoader           load_toc, load_bytecode, load_bytecode_by_id, read_bundle
|-- create_shader_object_path, create_shader_bundle_path
```

It takes a shader object path, a type, a platform and a set of macro defines, finds the matching
entry in a table of contents keyed by the xxh64 of the filtered define string, and returns that
shader's compiled bytecode as a `Vec<u8>`. It does not parse the bytecode. There is no material
model in it, no sampler binding, no parameter name, no texture path.

The material path here translates a `StaticMaterialDef` out of the sibling `.materials.bin` into a
three.js material, through `MaterialPreview` and `applyBinding`. That is bin data. The two do not
meet.

Two costs if it were added anyway. `ShaderLoader` takes a `&mut Wad<R>`, and the backdrop reads
bytes through `DocumentAssets::locate` rather than a mounted archive. And the crate wants
`ltk_wad` at 0.5.5 where this repository asks for 0.5.4, which resolves but moves the floor.

It becomes interesting only if a backdrop ever wants to read Riot's own compiled shaders to
reproduce a map material exactly, and the map puts that out of scope in favour of the lambert
translation that already exists.

## 9 What this note does not establish

- **Why one Map22 v17 mesh record is 40 bytes short, and whether the client reads it.** Settling it
  needs the client's own mapgeo loader on that branch, or a second install at a different patch to
  see whether the file changes. Nothing here says whether the crate is wrong or the file is.
- **What `Texcoord5`'s three floats carry.** 2,333 buffers use it and the crate has no opinion.
- **Whether `ResolvedDiffuseTexture::uv_channel == 1` means `Texcoord7`.** Both shipped baked-paint
  meshes carry `Texcoord7` and no shipped buffer carries `Texcoord1`, so in practice it must, but
  the crate never names the element.
- **Cold-disk cost.** Every timing here has the archive in the page cache. The first read of a
  2.4 GB archive on a cold disk is not measured, and it is the number a first backdrop draw after
  launch actually pays.
- **Whether two is the right LRU depth.** This note sizes one asset and two held together. It says
  nothing about how often a creator switches map.
- **Cost on a debug build.** All timings are `--release` with `debug = true`. This repository
  builds dependencies at `opt-level = 3` in dev, so `ltk_mapgeo` would be optimised there too, but
  that was not measured.
