# Map materials against the StaticMaterialDef path

Research note. **The existing path applies unchanged.** Every shipped map material is a
`StaticMaterialDef` whose pass links a `CustomShaderDef` in the same `data/shaders/shaders.bin`
the champion path already opens, and `crates/ltk-manager-core/src/material/mod.rs` reads all
8,265 of them with one warning in total. The differences are matters of degree rather than of
kind, and they are listed in section 7.

Every count below was measured on 2026-09-20 against a live install,
`C:/Riot Games/League of Legends/Game`, content version
`16.18.8175716+branch.releases-16-18.content.release`. Nothing was written to the install.

Method. WAD tables of contents were read directly and path hashes resolved against
CommunityDragon's `hashes.game.txt` of 2025-12-03. Chunks were decompressed with Node's zstd and
bins converted with `ritobin_cli`. The resolver of `material/mod.rs` was ported line for line to
JavaScript, including `BASE_EXACT`, `BASE_LIKE`, `NOT_BASE`, `COLOR_MAP_PATH`, the warning list
and `RenderState`, and run over the whole corpus with a stand-in `AssetLookup` that answers from
the install's own chunk tables. `.mapgeo` files were parsed against the layout in
`X:/lol/dev/league_structs/docs/reversing/MapgeoLoader.md`. Property types and defaults come from
the `rito-meta` CLI and from
`.claude/worktrees/static-material-note/docs/research/static-material-studio-rendering.md`.
Claims about the client's own code are cited to `league_structs` rather than re-derived.

## 1 The corpus

Every `.materials.bin` the hash list names inside the five installed map archives, 183 files:

| map wad      | materials bins | `StaticMaterialDef` entries |
| ------------ | -------------: | --------------------------: |
| `Map11.wad`  |             26 |                       5,121 |
| `Map12.wad`  |              4 |                         564 |
| `Map22.wad`  |            144 |                       2,425 |
| `Map30.wad`  |              9 |                         155 |
| `Map453.wad` |              0 |                           0 |

8,265 materials in all. `Map453` contributes nothing because the December 2025 hash list names
none of its chunks, not because it has none. Three of Map11's bins sit under
`data/maps/mapgeometry/sr/` rather than `map11/`, which is the directory wrinkle
`docs/research/map-data-layout.md` records.

The detailed figures below are quoted for Summoner's Rift,
`data/maps/mapgeometry/map11/base_srx.materials.bin`, 1,770,390 B, 183 materials, which is the
container the Default map skin draws.

## 2 Shaders

Map materials reference **87 distinct `CustomShaderDef` objects, and every one resolves out of
`data/shaders/shaders.bin`.** No pass links a shader the file does not declare, across all 8,265
materials, so `MaterialWarning::UnresolvedShader` never fires.

`data/shaders/shaders.bin` is 665,751 B and holds 350 `CustomShaderDef` entries. The copy in
`Shaders/Shaders.wad.client` and the copy in `Global.wad.client` are byte-identical, which
confirms the pair of locations `material/mod.rs:26` names.

The file divides by namespace, and maps take the half champions do not:

| namespace              | entries in `shaders.bin` | of those, ones maps link |
| ---------------------- | -----------------------: | -----------------------: |
| `Shaders/SkinnedMesh/` |                      217 |                        5 |
| `Shaders/StaticMesh/`  |                       91 |                       81 |
| unnamed                |                       19 |                        0 |
| `Shaders/UI/`          |                       13 |                        0 |
| `Shaders/PostProcess/` |                        5 |                        1 |
| `Shaders/Particles/`   |                        5 |                        0 |

So 81 of the 87 are `Shaders/StaticMesh/` environment shaders. A spot check of `skin0.bin` for
Annie, Ahri and Jinx finds only `Shaders/SkinnedMesh/` links, so the two halves of the file are in
practice disjoint. None of the 87 is map-only in the sense that matters to a reader: there is one
shader file and it holds them all.

The nine shaders Summoner's Rift uses, with how many of its 183 materials link each:

```
Shaders/StaticMesh/DefaultEnv_Flat_AlphaTest              107
Shaders/StaticMesh/DefaultEnv_Flat                         42
Shaders/StaticMesh/SRX_DynamicEffect                       16
Shaders/StaticMesh/DefaultEnv_Flat_AlphaTest_DoubleSided   12
Shaders/StaticMesh/VertexDeform                             2
Shaders/StaticMesh/SRX_Blend_Ocean                          1
Shaders/StaticMesh/SRX_Blend_Decal_Cloud                    1
Shaders/StaticMesh/SRX_Blend_Chemtech_Decal                 1
Shaders/StaticMesh/Indicator_Faelights                      1
```

Two shapes hold for every material in the corpus without exception. Each has exactly **one
technique, named `normal`**, which is the one `NORMAL_TECHNIQUE` selects, and that technique has
exactly **one pass**. `MaterialWarning::SecondPass` and `MaterialWarning::NoPass` never fire.
40 materials of 8,265 carry a `dynamicMaterial`, so the `animated` flag is exercised.

## 3 Sampler names and base texture selection

Map materials name their albedo `DiffuseTexture`, without the underscore champion materials use.
Both spellings are already in `BASE_EXACT`, at positions 2 and 1.

Every sampler name the 8,265 materials write, by how many materials write it, down to 15:

```
DiffuseTexture   7,373      Mask_Texture      223      Emissive_Texture   35
Diffuse_Texture    774      Decal_Texture     146      ColorGradingTex.   18
Noise_Texture      491      NoiseTexture       92      TintTexture        18
Emission_Tex       368      ColorTexture       55      Flow_Map           17
Mask_Tex           368      MaskTexture        55      Flowing_Normal_Map 17
FlagMask_Texture   368                                 VertexDeformationMask 17
```

The tail is 51 further names, none reaching 17 materials. Summoner's Rift uses nine names in all:
`DiffuseTexture` (179), `Emission_Tex`, `Mask_Tex` and `FlagMask_Texture` (16 each),
`Diffuse_Texture` (3), `Noise_Texture` (2), and `Mask_Texture`, `EmissionMaskTex` and
`EmissionTex` (1 each).

Which rule of `pick_base` picks the base, over the whole corpus:

| rule                       | materials | what it means on map data                                                              |
| -------------------------- | --------: | -------------------------------------------------------------------------------------- |
| `Exact`                    |     8,118 | `DiffuseTexture` 7,343, `Diffuse_Texture` 772, `_MainTex` 2, `Glass_Diffuse_Texture` 1 |
| `NameLike`                 |        55 | `ColorTexture` on `DefaultEnv_Transition`, `BASE_LIKE` matching                        |
| `ExactPlaceholder`         |        20 | `DiffuseTexture` holding `white.tex` (18), `Diffuse_Texture` holding `gray.tex` (2)    |
| no base at all             |        72 | section 4                                                                              |
| `SwitchOverride`           |         0 | the switched shader is a skinned one                                                   |
| the three colour-map rules |         0 | never reached                                                                          |

On Summoner's Rift the split is 182 `Exact` and one material with no texture at all.

Two facts about the colour-map rules. They never fire because `Exact` almost always hits first,
and they could not fire often if it did not: **a map texture usually has no name.** 3,758 of the
8,193 base textures resolve to a path string, and the other 4,435 carry sixteen hex digits,
because CommunityDragon's list does not name the chunk. `COLOR_MAP_PATH` tests the file name of
the path, and a hash has none. The same holds for `PLACEHOLDER`, which means an unnamed
placeholder texture reads as a real one. On Summoner's Rift only 23 of 182 base textures carry a
path.

That does not stop the texture loading. `Locator::chunk` falls back to the sixteen hex digits as
the path and asks `AssetLookup::locate_chunk`, which `DocumentAssets` answers out of the game
index by chunk hash. **All 8,193 base textures the rules pick are present in this install**, so
`MaterialWarning::TextureNotFound` fires zero times.

## 4 What the heuristics get wrong

Across 8,265 materials the resolver raises **one** `MaterialWarning`: an `UndeclaredSwitch` for
`MULTIPLY_ALPHA` on `Maps/KitPieces/TFT/Spirit_Blossom/Materials/Default/Path_Decal_Kami_MAT` in
`map22/spiritblossom_kami.materials.bin`. Summoner's Rift raises none. Every sampler, parameter
and switch a map material writes is declared by the shader its pass links, every shader link
resolves, every technique is `normal`, every pass is the only one, and every base texture is on
disk.

The 72 materials with no base divide in two.

**47 name no texture at all**, and neither does their shader. They link five shaders that each
declare an empty `textures` list: `Indicator_Faelights` (19), `Emissive_Basic` (12), `ENV_Glass`
(7), `ENV_UVGradientColorMapping` (6) and `ENV_Glass_Vertex_Offset` (3). The material is a tint
and a set of parameters, and it draws untextured, which is what the engine does with it.

**25 name textures the rules reject.** The rejections that look like a missed albedo:

```
_LayerTex01.._LayerTex03, _MaskTex, _NoiseTex01.._NoiseTex03, _DeformTex   14 materials
Scrolling_Texture                                                           3
ScrollingA_Texture, ScrollingB_Texture, Mask_Texture                        2
FlipBook_Texture                                                            1
```

`NOT_BASE` carries `scroll`, so `ENV_ScrollingColor`'s `Scrolling_Texture` and
`ENV_ScrollingDiffuse`'s `ScrollingA_Texture` are rejected although the shader names say they are
the diffuse.
`_LayerTex01` matches neither `BASE_EXACT` nor `BASE_LIKE`. The remaining rejections are correct:
`MatCap_Tex` on `HKG_MatCap_Only`, and `TFT_Water`'s `Distortion_Texture`, `Reflection_Texture`
and `Thickness_Texture` set, have no albedo to find.

So the rules miss a plausible albedo on at most 20 materials of 8,265, which is 0.24 percent, and
on none of Summoner's Rift's 183.

One ordering risk in `pick_base` does not fire on shipped data. `BASE_EXACT` lists
`Diffuse_Texture` before `DiffuseTexture`, and `Reader::samplers` merges the shader's default
textures in after the material's own, so a material writing `DiffuseTexture` under a shader
declaring `Diffuse_Texture` with a default path would take the shader's default over its own
sampler. The base comes from a shader default in **0** of the 8,265 materials, and no material
writes both names.

**A material name that resolves to nothing does not occur on Summoner's Rift.** This corrects
`docs/research/map-data-layout.md` section 3, which reports three of the 183 names dangling. All
183 resolve. The three are declared in `base_srx.materials.bin` under entry keys the hash list
cannot name, so a text conversion prints them as numbers and a name-to-name join misses them:

```
Maps/KitPieces/SRS/Base/Materials/Default/HoL_TristanaStatue_A_MAT        -> 0xc304851a
Maps/KitPieces/SRS/Base/Materials/Default/HOL2026_Ground_C3_MidLane_A_MAT -> 0x832b0607
Maps/KitPieces/SRS/Base/Materials/Default/HOL2026_Periph_Top_H_MAT        -> 0x33df0c7d
```

Joining on FNV-1a-32 of the lowercased string, which is what a resolver does, hits all 183 of 183
and all three resolve to `StaticMaterialDef` objects with a base texture present on disk. The
real number of container-local misses on Summoner's Rift is zero.

What a genuinely absent name would draw is still worth stating, because nothing guarantees the
next container joins totally. `linked_material` returns a `MaterialPreview` with `missing` set,
every slot empty and no warnings, and `applyBinding` in
`src/modules/viewport/character/utils/submeshBinding.ts` draws that as `colors.errored`, flat,
double sided, with no map. `ltk_mapgeo::MISSING_MATERIAL` is the format's own name for the case,
`-missing@environment-`.

## 5 Blending and culling

4,606 of 8,265 map materials set `blendEnable`, which is 56 percent. The pairs of blend factors,
with the enum from `StaticMaterialPassDef::BlendFactor` in
`league_structs/docs/reversing/enums/lol_enums.txt` and the class defaults One and Zero from the
studio note:

| src                 | dst                 | materials | what the engine does      |
| ------------------- | ------------------- | --------: | ------------------------- |
| `kOne` (default)    | `kOneMinusSrcAlpha` |     3,283 | premultiplied alpha       |
| `kSrcAlpha`         | `kOneMinusSrcAlpha` |       965 | straight alpha            |
| `kOne` (default)    | `kZero` (default)   |       320 | no blend despite the flag |
| `kSrcAlpha`         | `kOne`              |        21 | additive                  |
| `kOneMinusSrcColor` | `kZero` (default)   |        17 | inverse-colour modulate   |

`RenderState` carries five of the six things those passes need. It reads `blendEnable`,
`dstColorBlendFactor`, `cullEnable`, `windingToCull`, `writeMask` and `depthEnable`, and it takes
`premultiplied` from the `PREMULTIPLIED_ALPHA` shader macro, which 3,006 map materials set. It
does not read `srcColorBlendFactor`. Four consequences, all small and all measured:

- **406 premultiplied passes carry no macro.** The pass is `(kOne, kOneMinusSrcAlpha)` and
  nothing says premultiplied, so the preview draws straight alpha where the engine premultiplies.
  391 of the 406 come out `Normal` and so are drawn at all. 12 of those are on Summoner's Rift,
  all under `DefaultEnv_Flat_AlphaTest_DoubleSided`.
- **112 straight-alpha passes carry the macro**, the mirror of the above, of which 108 come out
  `Normal`.
- **695 blended passes come out `Opaque`**, because `reads_alpha` keeps a `Normal` blend only
  where an opacity or alpha-test parameter is set. 364 are real `(kSrcAlpha, kOneMinusSrcAlpha)`
  blends and 3 of those are on Summoner's Rift. 307 are `(kOne, kZero)` and 17 are
  `(kOneMinusSrcColor, kZero)`, where opaque is the right answer for the wrong reason. The
  remaining 7 are premultiplied passes.
- **17 materials modulate by `kOneMinusSrcColor`**, which neither `Blending` nor three.js
  `NormalBlending` expresses.

After those rules the corpus resolves to 4,354 `Opaque`, 3,876 `Normal` and 35 `Additive`. 47
percent of map materials therefore reach three.js with `transparent` set, which is a sorting
question for a backdrop rather than a correctness one.

The rest of the render state is quiet. 424 materials of 8,265 clear `cullEnable`, 164 clear the
depth-write bit of `writeMask`, 51 clear `depthEnable`, and **no map material culls the other
winding**, so `RenderState::inverted` is never true from the material side.

### `EnvironmentMesh::disable_backface_culling`

The per-mesh flag is rare and it does not replace the material's own state. Counts:

| geometry                | version | meshes | meshes with the flag | materials on them |
| ----------------------- | ------: | -----: | -------------------: | ----------------: |
| `map11/base_srx.mapgeo` |      18 |    586 |                   14 |                 5 |
| `map12/base.mapgeo`     |      17 |    342 |                    3 |                 1 |
| `map30/arenaa.mapgeo`   |      17 |    104 |                    1 |                 1 |

`MapgeoLoader.md`, correction 1, records what the client does with it: each submesh material is
looked up as `"<name>|flipped"`, and where that does not exist the base material is cloned and the
clone's rasterizer cull mode is inverted before being registered under the suffixed name. The same
flag remaps the render-flag word, `if (flags & 0x40) flags = (flags & ~0x40) | 0x80`, which marks
bit 6 as the backface-culled depth variant and bit 7 as the two-sided one.

**No `|flipped` entry exists in any of the 183 shipped materials bins**, so the clone branch
always runs.

Which state wins is therefore not a choice between the two: the drawn state is the material's cull
mode with the mesh flag applied on top of it. The decisive measurement for a consumer is that
**every material on a flagged mesh is also used by unflagged meshes** -- all 5 on Summoner's Rift,
the 1 on Map12's base, the 1 on Map30's Arena A. A single per-material `RenderState` cannot carry
both states, so the flag belongs at the point a mesh is bound rather than folded into
`MaterialPreview`. On Summoner's Rift four of the five materials already clear `cullEnable`
themselves, and only `Maps/KitPieces/SRS/Base/Materials/Default/Ocean_Puddle_A_MAT` differs
between its flagged and unflagged meshes.

## 6 Lightmaps

**No map material anywhere in the corpus declares a baked-light sampler.** Not one of the 8,265
writes `BAKED_DIFFUSE_TEXTURE`, `BAKED_DIFFUSE_TEXTURE_ALPHA` or any name matching
`baked`, `lightmap` or `stationary`. The resolver cannot mistake a baked-light texture for a base
because it never sees one.

Baked light reaches a mesh from the geometry, not from the material. The `.mapgeo` sampler table
is the same two entries in every version-17 and version-18 file read:

```
0  BAKED_DIFFUSE_TEXTURE
1  BAKED_DIFFUSE_TEXTURE_ALPHA
```

The version-17 per-mesh overrides bind against that table by key, and the stationary-light and
baked-light paths are per-mesh fields of their own. Measured on the two maps that use them, which
Summoner's Rift does not:

- `map12/base.mapgeo` gives 330 of 342 meshes a stationary-light path under
  `ASSETS/Maps/Lightmaps/Maps/MapGeometry/Map12/Base/`.
- `map30/arenaa.mapgeo` gives 103 of 104 meshes one under
  `ASSETS/Maps/Lightmaps/Maps/MapGeometry/Map30/ArenaA/`, and one mesh carries a version-17
  sampler override binding key 0 to
  `ASSETS/Maps/BakedPaint/Maps/MapGeometry/Map30/ArenaA/0.tex`.

Below version 17 the single texture path is inserted under both keys 0 and 1
(`MapgeoLoader.md`, the mesh layout).

The shaders agree. `NO_BAKED_LIGHTING` is a shader macro on 5,656 of the 8,265 materials and on
all 183 of Summoner's Rift's. Only **2 of the 350** `CustomShaderDef` entries declare a baked
texture slot at all, `Shaders/StaticMesh/DefaultEnv_Flat_BakedTerrain` and
`Shaders/StaticMesh/Mantis_Env_Baked_PBR`, and **neither is referenced by any shipped map
material.**

One latent trap is worth writing down. `BASE_EXACT` contains `BAKED_DIFFUSE_TEXTURE` at position
15, and both of those shaders declare it with a `defaultTexturePath`. `Reader::samplers` merges a
shader's defaults in for names the material omits, so a material linking either shader and naming
no `Diffuse*` sampler of its own would take a baked-light texture as its base. No shipped map
material links either shader, so that route is closed today. A second opens if a consumer merges
the mapgeo's per-mesh channels or version-17 overrides into the sampler set before the base pick
runs. `Mantis_Env_Baked_PBR` also declares `VoidAlbedo2`, another `BASE_EXACT` name.

## 7 The list of what differs

Nothing in sections 2 to 6 stops the existing path from reading a map `.materials.bin`. What a
consumer of `MaterialPreview` has to know:

- The material is named by **path string**, not a `Link`, so a map reader hashes the string with
  FNV-1a-32 itself. Section 4.
- **45 percent of base textures resolve by path, the rest by chunk hash.** The path field reads as
  sixteen hex digits, which makes `COLOR_MAP_PATH` and `PLACEHOLDER` blind on those. The texture
  still loads. Section 3.
- **The per-mesh backface flag is not expressible in a per-material record.** Every material on a
  flagged mesh is also used by unflagged ones. Section 5.
- **`srcColorBlendFactor` is dropped**, which costs 406 materials their premultiplied blend and
  turns 17 inverse-colour modulates opaque. Section 5.
- **695 blended passes draw opaque**, 364 of them genuinely alpha blended. Section 5.
- **`NOT_BASE` rejects a scrolling albedo** on the five `ENV_Scrolling*` materials. Section 4.
- **Baked light never reaches the material**, so it is the mapgeo's problem, not the resolver's.
  Section 6.

## 8 What this note does not establish

- **Whether the mesh flag disables culling or flips the culled winding.** `MapgeoLoader.md` says
  the clone's cull mode is inverted, `1 -> 0, 0 -> 1`. Read as a boolean `cullEnable` that turns
  the three Chemtech dragonwing materials, which already clear `cullEnable`, back to one sided.
  Read as a winding it matches the `|flipped` name and `RenderState::inverted`. The render-flag
  remap to bit 7, the two-sided variant, points at the first reading. Settling it needs the
  rasterizer state at `0x141363833` rather than the note's summary of it.
- **Whether a lambert is enough.** Section 5 measures what `RenderState` carries and drops, and
  says nothing about the 81 `Shaders/StaticMesh/` programs a preview does not run. Blend shaders
  such as `SRX_Blend_Ocean` and the four-texture terrain blends draw from several samplers the
  base slot cannot represent at all.
- **How a map texture gets a name.** 4,435 of the 8,193 base textures are unnamed in the December
  2025 CommunityDragon list. A newer list closes part of the gap and nothing here measures how
  much.
- **What the other four map ids' unnamed containers hold.** `Map453` contributes no bin to this
  census because the hash list names none of its chunks, and Map11 leaves roughly a third of its
  chunks unnamed.
- **Whether the sampler names hold at the next patch.** Every figure here is one content version.
