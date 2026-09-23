# Shader pipeline

The viewport draws a submesh with the game's own shader: the shipped DXBC blob its material
selects, translated to GLSL ES 3.00 in the backend and bound in Three.js by the names the blob's
reflection carries. Nothing is ported by hand. One generic pipeline plus one engine environment
replaces 350 shaders.

The reference is `docs/research/static-material-studio-rendering.md`, sections 2 (what the engine
does), 4 (the pipeline), 5 (the translation chain, measured on 13,391 blobs) and 11 (the
resolution flow). This plan is the route from the code as it stands to that pipeline. Each tier
stands on its own and leaves the viewport drawing.

## What the code is

`resolve_material` in `crates/ltk-manager-core/src/material/mod.rs` reads a `StaticMaterialDef`
and its pass's `CustomShaderDef` out of `data/shaders/shaders.bin` and answers a
`MaterialPreview`: a base texture picked by name, tint, opacity, alpha test, UV repeat and
scroll, and the pass's render state. That is the low-effort fallback of section 10, built as
PR #569. `applyBinding` in `src/modules/viewport/character/utils/submeshBinding.ts` lands those
slots on a stock `MeshLambertMaterial` per submesh, and the map backdrop takes the same record
per mesh.

The fallback ignores masks, matcaps, rim, bloom, dissolves, vertex deforms, every second texture
and every dynamic driver. The pipeline keeps it as the material of last resort: a TOC miss, a
translation failure, or a permutation past the 16-texture cap.

## What the data is

- `CustomShaderDef`: 350 objects, all in `data/shaders/shaders.bin`. Each names its parameters
  (a `vec4` default and the logical names that scatter into it), static switches, textures with
  sampler names and default paths, and feature defines.
- Compiled bytecode: `assets/shaders/generated/<lower(objectPath)>.<vs|ps>-dx11` in
  `ShaderCache.dx11.wad.client`, one `TOC3.0` chunk per shader and stage, plus bundle chunks
  `<toc path>_<n>` for `n` in multiples of 100. A bundle is `(u32 len, bytes)` records, and every
  record is one DXBC container followed by one byte its size field does not count.
- A permutation is picked by `xxh64` of the sorted `NAME=VALUE` defines the TOC declares. Defines
  the TOC does not declare are dropped before hashing, so over-specifying is harmless.
- Every blob is SM 5.0 with `RDEF`, `ISGN`, `OSGN`, `SHEX` and `STAT`. The engine binds every
  cbuffer member, texture and sampler by its `RDEF` name, never by register. `$Globals` is
  repacked per permutation, so member offsets come from each blob's own reflection.
- 19 constant buffers in all. Every one but `$Globals` has one layout across all 67,651 blobs, so
  the studio writes each engine buffer once. A character preview needs `PerFrameVertexCB`,
  `PerFramePixelCB`, `CharacterPerDrawVertexCB`, `CharacterPerDrawPS` and `BonesCB`.

## Decisions

**dxbc-spirv, then SPIRV-Cross, in process.** dxbc-spirv (MIT, DXVK's SM 5 compiler) is
compiled by `cc` from a pinned git submodule, behind one C function. SPIRV-Cross comes through
the `spirv-cross2` crate. Both chains were measured at 13,391 of 13,391 blobs compiling in ANGLE.
vkd3d-shader matched them and was rejected: LGPL, no Windows release. `dxil-spirv` on crates.io
was rejected for wanting CMake at build time, which the Windows workstation lacks.

**Asserts stay on, and the translation runs on a worker thread.** dxbc-spirv's release build
keeps its asserts, and none fired on the corpus with the options below. An abort would take the
app down, so the day one does, the translation moves to a child process. Not built ahead of the
first failure.

**Translation is on demand, cached on disk.** About 6 ms per blob in process, against 6.7 GB of
intermediates for a full offline pre-translation of 18 bundles. The cache key is
`xxh64(dxbc)` plus a pipeline version constant, so a fix-up change invalidates every entry.

**The same fix-ups as the research harness, in Rust.** SPIR-V word patches: drop the
`PhysicalStorageBufferAddresses` and `DerivativeControl` capabilities, set the addressing model to
`Logical`, rewrite coarse and fine derivatives to plain, drop `Component` and `NoContraction`
decorations, lower `OpDemoteToHelperInvocation` to `OpKill`, and rename registers to `RDEF` names
with `a_` and `v_` prefixes on the interface. GLSL text patches: ESSL 3.10 bit builtins
polyfilled, texel buffers as `R32UI` data textures, cube arrays as `sampler2DArray` with six
layers per cube, `textureLod(sampler2DShadow, c, 0.0)` as a zero-gradient `textureGrad`, cbuffer
blocks suffixed `_vs` and `_ps`, and float varyings widened to `vec4`.

**Cbuffers are UBOs bound by offset.** SPIRV-Cross emits each cbuffer as `vec4 m[N]` and the
member names are gone. The sidecar carries every member's `RDEF` offset, and the frontend writes
`offset / 16` and `offset % 16 / 4` into a `Float32Array` of the buffer's size. std140 `vec4[N]`
packing equals D3D's. Integer members go through `Uint32Array` views of the same buffer.

**The studio subset.** `DISABLE_FOW=1`, `DISABLE_SHADOWS=1`, `NUM_BLEND_WEIGHTS=4` for skinned,
and `USE_DYNAMIC_LIGHTING`, `FORCE_MANTIS_LIGHTING`, `GENERATE_SHADOW_MAP` and `IS_AROUND_GAME`
off. That leaves 3,025 pixel blobs over all 350 shaders, none past 16 textures and none with the
clustered-light loops that link in seconds. `LOW_QUALITY_MODE` is a user toggle. Mantis lighting
is a later mode with its own fold rules.

**`ltk_shader` is read, not called.** Its `ShaderToc` reader and define hash are right. Its path
builder still writes the pre-16.15 `.dx11` separator, and its bundle reader keeps the trailing
byte, so the chunk paths and the record trim live in this repo until the crate follows.

**Textures upload raw.** The shaders decode the texel themselves, so material textures load with
`NoColorSpace` and `flipY = false`, and the output goes to the canvas with no tone mapping. The
fallback material keeps its sRGB decode, because a stock material expects it.

## Tiers

### T1: translation crate

Two crates. `crates/dxbc-spirv-sys` holds the submodule, a `build.rs` over its 41 SM 5 and
SPIR-V sources, and one shim function. `crates/hexshade` is the pipeline, named Hexshade, and
takes no bin, asset or app error type:

```text
crates/dxbc-spirv-sys/
|-- build.rs                     cc: C++17, DXBC_SPV_ENABLE_SM5, DXBC_SPV_ENABLE_SPIRV, NDEBUG
|-- shim.cpp                     dxbc_spv_lol_compile: DXBC in, SPIR-V words out
|-- src/lib.rs                   the safe wrapper
|-- vendor/dxbc-spirv            submodule at bf14419, with spirv_headers
crates/hexshade/src/
|-- lib.rs                       Stage, PIPELINE_VERSION, the re-exports
|-- translate.rs                 translate(dxbc, stage) -> Translated { glsl, sidecar, applied }
|-- dxbc.rs                      the container, RDEF, ISGN, OSGN
|-- spirv.rs                     the word patches
|-- glsl.rs                      the text patches
|-- reflection.rs                the sidecar: cbuffers with member offsets, textures, samplers,
|                                attributes, and the GLSL name of each
|-- bundle.rs                    chunk paths, the permutation key, the record trim
|-- defines.rs                   Defines, the define list a permutation is picked by
|-- cache.rs                     TranslationCache, the translations on disk
|-- program.rs                   ShaderSource, ShaderCache::program -> Program, ProgramError
```

Verification: the `sweep` example translates every record of a shader's two TOCs out of the
installed `ShaderCache.dx11.wad.client` and writes a `pairs.json` that pairs each pixel shader
with a vertex shader whose signature covers it. The research harness's `link_test.mjs` links
the pairs in headless Edge over CDP. Built 2026-09-22: 2,387 of 2,387 records of
`Diffuse_Bloom`, `DefaultEnv_Flat_AlphaTest`, `pbr_vfx` and `SRX_Blend_Ocean` translate at
33 ms median in a release build, and 707 of 707 studio-subset pairs link at 25 ms median.
Two patches the harness did not have: a block's `vec4` array shrinks to its `RDEF` extent, and
a vertex output the shader never writes is declared so a fragment input can link to it.

### T2: the resolved pass

`crates/ltk-manager-core/src/material/pass.rs` reads what `MaterialPreview` leaves out, per
section 11 stages 3 to 7: the define list in the engine's order (material macros, feature
defines, compile-time switches as `NAME=1` or `NAME=0`, pass macros, later wins), runtime
switches as `switch_<NAME>` floats, every shader texture with its path source and sampler state,
every physical parameter after the logical scatter with an absent value as zeros, and the pass
render state with the class defaults. Warnings for every drop and miss. The `Reader` it extends
already holds the shader def and the sampler and switch tables.

Built 2026-09-22 as `resolve_passes`, one `ResolvedMaterial` with every pass of the `normal`
technique as a `ResolvedPass`: the define list sorted by name with the stage that set each
entry, the runtime switches, every texture with its source and sampler state, every physical
parameter with the step that last wrote it, and the render state field by field. The `Reader`
gained the shader's physical parameters with their logical masks, the texture sampler names and
the runtime flag. A logical `fields` mask reads as the class default, zero, where absent, which
writes nothing, so a def written by hand has to state it. Stencil and depth bias stay out until a
shipped pass is seen to use them.

Verification: the `dump_passes` example resolves every `StaticMaterialDef` of a bin inside a
WAD against the installed `shaders.bin`. On 2026-09-22 it read 374 materials of six champions'
skins and the 183 of Summoner's Rift with no warning but the texture lookup the example does
not do, every skin material one alpha-blended pass and every map material `StaticMesh`, with
`addressW` set on 162 map textures and `CharacterWrap` as the shared sampler of 42 skins'
second diffuse. The four shaders carrying the runtime flag are `UI_Splash_Foil`,
`DefaultParticleQuadUnlit`, `VFX_Uber_StaticMesh_Unlit` and `Mantis_Env_Baked_PBR`, none of
which the sample uses, so the runtime switch path is unit tested only.

### T3: the command

`read_material_program` in `src-tauri/src/commands/material.rs`: the resolved pass plus the
studio defines, the TOC lookup through `AssetLookup::locate_chunk` so a project layer's shader
cache wins over the game's, the translation through the disk cache, and one `MaterialProgram`
record across IPC. A TOC miss answers an error the frontend draws as the error material, never a
guess.

Built 2026-09-22 as `read_material_programs` over `ltk_manager_game::program::read_programs`,
which resolves the passes and asks Hexshade's `ShaderCache` for each program. The game crate
implements `ShaderSource` over `AssetLookup`, and one `ShaderCache` per read parses each TOC,
bundle and stage once.
The command takes a `MaterialSource`, an open document or a bin read for the call such as a
map's `.materials.bin`, a list of entries as hashes or paths, and `ProgramOptions`, and answers
one `MaterialProgram` per entry, null where the bin declares no object. Each pass carries its
`ResolvedPass` and a `ProgramRead`: `ready` with the define list used, the two shader ids, the
GLSL and the sidecar, or `failed` with the reason. The studio defines are `DISABLE_FOW=1`,
`DISABLE_SHADOWS=1`, `NUM_BLEND_WEIGHTS=4` on a skinned material and `LOW_QUALITY_MODE=1` on
request, the pass winning on a name. A shader cache chunk is located by its hash first, since
the bundle chunks have no name any table carries, and by its path second. Translations live
under `<app data>/shaders/v<PIPELINE_VERSION>/<xxh64 of the blob>.<vs|ps>.json`, written
through a temporary file.

Verification: the `dump_programs` example of the game crate runs the read over a bin with only
the shader cache located. On 2026-09-22 all 557 passes of the six champions' skins and of
Summoner's Rift read as `ready`, 83 distinct blobs translated once, and a second run of a skin
answered from the cache in 1.5 ms against 24 ms cold. The command itself has not been called
from the app yet, which T4 does.

### T4: the frontend material

`src/modules/viewport/hexshade/programMaterial.ts` builds a `RawShaderMaterial`
(`glslVersion: GLSL3`) from the record: one `UniformsGroup` per cbuffer, `$Globals` filled from
the params and switches at the sidecar offsets, textures bound by name, render state from the
pass. `src/modules/viewport/hexshade/engineEnvironment.ts` fills the five engine buffers
once per frame from the camera, the sun, the bones and the world matrix, and binds
`PIXEL_COLOR_REMAP_RAMP` as 1x1 transparent black. The skinned geometry gains the attribute
names the sidecar asks for, and `BLENDINDICES` is an integer attribute.

`Character` swaps the program material in per submesh where one resolved, and keeps the
fallback where none did. The map backdrop follows on the same seam.

Built 2026-09-22 behind the "Game shaders" switch of the skin viewport, off by default until
judged on screen. `engineEnvironment.ts` holds one `UniformsGroup` per block name for the
character, each one `Float32Array` of the block's bytes that three uploads whole, and writes
the five engine buffers in the skinned mesh's `onBeforeRender`: `mProj` as the rows of the
camera's clip transform with its depth row halved into D3D's range, which the translated
shader's `2z - w` undoes, `BONES` as the rows of the skeleton's world matrices so `mWorld` is
the identity, a lit-from-above ambient cube in `LIGHTGRID_COLORS`, `LIGHTGRID_SCALE` one,
`kGrassFade.w` one, a fixed sun and camera. `programMaterial.ts` builds the `RawShaderMaterial`
with the `#version` line stripped, packs `$Globals` from the pass's parameters and runtime
switches at the sidecar's offsets, binds each combined sampler to its texture with the pass's
sampler state, a mid-grey texel for a texture nothing holds and transparent black for a
`_SharedTexture`, and sets the blend factors, cull, depth function and write masks from the
pass state. The geometry carries the stock buffers under `a_POSITION`, `a_NORMAL`,
`a_TEXCOORD`, `a_BLENDWEIGHT` and `a_COLOR`, and the joints again as `a_BLENDINDICES` typed
integer. The textures load raw through a `colorSpace` option of `useAssetTextures`. The
sidecar's attributes needed the T1 rename list to keep both an input and an output of one
semantic, which bumped `PIPELINE_VERSION` to 2.

The map backdrop follows the same seam under the same switch: `BackdropSource.shaders` has
`useMapBackdrop` ask `read_material_programs` over the map's `.materials.bin` as a file source
with the geometry's own entry paths, and `Backdrop` draws a material with a translated first
pass under it, the stock one standing in where none did. A static mesh's shader multiplies by
a `WORLD_MATRIX` the material packs into `$Globals` as the identity, since a map's vertices
are stored in the world, so the environment folds the object's transform into the clip
transform and states the camera in the object's space, and lights `PerFramePixelCB` from the
map's sun with `SHADOW_COLOR` as the sky's ambient share and its complement summing to one. A
sampler of another shape than a picture, an array, a cube or an integer buffer, takes a
neutral texel of its own shape.

Two facts of three shape how the buffers reach the GPU. It keeps one UBO binding point per
`UniformsGroup` for the group's life against a limit of a few dozen, and it uploads a group
at most once per frame, whatever its typed array holds at later draws. The engine blocks are
one group per block name per environment, written before the frame's first draw. `$Globals`
is no group at all: `globalsAsUniform` rewrites the translated block into a plain `vec4`
array uniform of the block's GLSL name, as long as the array the stage declares, that each
material owns and three uploads whenever `uniformsNeedUpdate` is set. What changes per draw
goes there.

A map's light maps ride the same seam. The map buffer (version 2) carries each mesh's baked
and stationary channel, the atlas path with the scale and bias its `TEXCOORD7` is read
through, and `Backdrop` looks them up per draw by the geometry group's first index, writes
the scale and bias into `BAKED_LIGHT_SCALE_AND_BIAS` and binds the atlas to
`BAKED_LIGHT__TX`, a white texel for a mesh with none. The shader lights a texel by
`NdotL * min(BAKED.a, 1) * SUN_LIGHT_COLOR + BAKED.rgb * LIGHT_MAP_COLOR_SCALE_AND_INTENSITY.x`,
so the alpha is the sun's shadow mask and the colour the baked ambient. A top-down software
render of ArenaB through `uv7 * scale + bias` lands every mesh on its own chart. A vertex
input the geometry lacks, `COLOR0` under `VertexDeform`, reads (0, 0, 0, 1) in GL, so the
material defaults `a_COLOR` white and the spare coordinates zero.

The sun of `PerFramePixelCB` is inferred from the shipped pixel shaders and what reads right
on screen, not traced: `SUN_LIGHT_COLOR` is the sun colour at its intensity, `SHADOW_COLOR`
the sky colour at its scale, `SHADOW_COLOR_COMPLEMENT` the sun's light over the shadow's
clamped at zero, `LIGHT_MAP_COLOR_SCALE_AND_INTENSITY.x` the map's `lightMapColorScale`, and
the fog members the map's own or a start one unit above an end far below any map when it
has none, since a start equal to the end divides by zero.

Open on screen: the matrix row convention and the depth halving, the ambient cube's values,
the sun reading above, `SV_Target1` on a single-attachment target, a highlighted submesh not
dimming under a program, the shared-sampler name heuristics, and the per-mesh texture
override list with its `baked_paint` channel, which two meshes install-wide carry.

### T5: LIT_UBER

The 81% of skins with no `StaticMaterialDef` draw with `hlsl/skinnedmesh/lit_uber`, whose
defines and bindings come from the engine's builder rather than a bin: `DIFFUSE_MAP`,
`EMISSIVE_MAP`, `NORMAL_MAP` under `FEATURE_TANGENT`, `GLOSS_MAP`, `REFLECTION_MAP` under
`REFLECTIVE`, and the `vFresnel`, `vReflection`, `albedoNewMin`, `albedoNewMax`, `rimOffset`
and `modelHeight` params. A synthetic pass record feeds the same T3 and T4.

### T6: verification against D3D11

The WARP oracle: the original blob on D3D11 WARP, the translated GLSL in headless Chromium, the
same cbuffer bytes and textures on both, compared per pixel. The riskiest pieces are the cube
array face mapping, the bit polyfills, the derivative rewrite and the engine matrix layout.

## What stays out

- `dynamicMaterial` drivers (11,754 materials). The preview shows static values and badges the
  material as animated. Issue #677 covers the VFX side.
- Child techniques (transition, death), the second render target of the 95 static-mesh
  shaders (dropped in the fix-up), Mantis lighting, fog of war, shadows.
- WebGPU. Viable as a second target but Three.js has no raw-WGSL material.
