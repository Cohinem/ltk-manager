# Shader editor

A `CustomShaderDef` opens beside a preview of its shader, the way a material does, and is edited
where the game reads it, `data/shaders/shaders.bin`. The tiers lead from editing the defaults of a
shader Riot shipped to a shader a mod project compiles itself.

The drawing side is `docs/plans/shader-pipeline.md`, and the material view this extends is
`docs/plans/material-editor.md`. The decision is ADR-0066.

## What the data is

- `CustomShaderDef` (base `IShaderDef`): `objectPath`, `parameters` (`ShaderPhysicalParameter`:
  `name`, `data`, `logicalParameters` of `name` and `fields` mask), `textures` (`ShaderTexture`:
  `name`, `defaultTexturePath`, `samplerName`), `staticSwitches` (`ShaderStaticSwitch`: `name`,
  `onByDefault`, the runtime flag `0x066e669c`), `featureDefines`, `featureMask`, `ShadingModel`
  and `AdditionalUvSetMask`.
- The 350 defs all live in `data/shaders/shaders.bin`. A def in another bin replaces the game's
  copy with one that has no programs, and the game crashes on it.
- `objectPath` selects the TOC paths, `assets/shaders/generated/<lower(objectPath)>.<vs|ps>-dx11` in
  `ShaderCache.dx11.wad.client`. A TOC records the defines it declares and the hash of each
  compiled permutation, not the define list of each one.
- A def edit reaches the game only through what the bytecode reads. A parameter is a `$Globals`
  member, a texture is `<name>__TX`, a compile-time switch is a define the TOC declares, and a
  runtime switch is the `$Globals` float `switch_<NAME>`. A name the bytecode does not read
  changes nothing in game.

## Tiers

### S1: the shell and the default preview

**Built 2026-10-16.** `shaderLayout` in `classLayouts.ts` declares the material shell, with
Identity, Params, Textures, Switches and Feature defines as trees. `read_programs` reads a
`CustomShaderDef` entry through `resolve_shader_pass`, a pass that links the def with an empty
material, and the open document serves as the defs. The kind is the `objectPath` namespace.

Verification: the `dump_programs` example over `data/shaders/shaders.bin` of the installed
`Global.wad.client` read all 350 defs, and 232 translated with their defaults in 2.6 s cold. The
other 118 fail. 117 have no cached permutation for the default define list: 49 static-mesh
vertex stages, 44 skinned-mesh pixel stages, 9 skinned-mesh vertex stages, 8 static-mesh pixel
stages and 7 particle, UI and post-process stages. One, `Mantis_Env_Baked_PBR`, does not translate.
Not yet seen on screen.

The defaults also draw black where they do draw: in the 232, the default of 401 texture slots is
`assets/shared/materials/black.tex`, 77 `generic_noise.tex` and 58 `white.tex`, and 44 defs
default a color to zero. Riot writes placeholders, since every material overrides them.

### S2: the preview material and the preview defines

**Built 2026-10-16.** The preview draws the def through a shipped material, and a reader sets
defines over it, neither written to the def.

- `read_shader_program` in `program.rs` and the `read_shader_program` command take an optional
  `PreviewMaterial`, a material's bin and entry, and resolve it with the open document as the
  shader defs. They take `NAME=VALUE` preview defines, applied as `DefineSource::Preview`, and
  answer `ShaderProgram`: the program and the defines the two TOCs declare, from
  `ShaderCache::declared`.
- `useShaderMaterial` finds the `StaticMaterialDef`s that link the def through
  `referenceQueries.forRequest` with an `object` query, the walk the References document runs,
  and draws the first one until the reader picks. `ShaderMaterialMenu` and `PermutationMenu` sit
  in the preview's toolbar. The picks live in `material/state/previewDefines.ts` for the session.

- `read_shader_program` draws a pass whose define list selects no permutation with
  `ShaderCache::nearest`, the list within three changes that selects one in both stages, and
  warns with `MaterialWarning::NearestPermutation`. `dump_programs --nearest` measured 339 of 350
  defs drawn, 106 through the search, in 1.9 s for all 350.
- `spirv.rs` rewrites `OpImageQueryLevels`, which ESSL lacks, as a constant 1.
  `Mantis_Env_Baked_PBR` translates with it.

The walk is asked with the open project, so the project's materials lead the list, and the
request shares its key with a References document asked from that project.

Verification: unit tests of the declared defines, the preview define merge and the material
read against an open def. Not yet seen on screen.

### S3: what the bytecode reads

A check of the def against the program it selects, in the inspector rows:

- A parameter with no `$Globals` member in either stage, and a `$Globals` member no parameter
  declares.
- A texture with no `<name>__TX` binding, and a binding no texture declares.
- A compile-time switch that neither TOC declares, so a toggle selects nothing.

The sidecar already carries the `$Globals` members and the bindings, so this is a frontend join
over `ProgramRead::Ready` and `ResolvedPass.schema`. It is also the check a compiled shader of S5
passes before a build.

**Built 2026-10-16** as `shaderMarks` in `material/utils/shaderMarks.ts`. `ShaderTables.tsx` draws
Params, Textures and Switches through `DeclaredTable` with no declarations, and shows each mark as
an info note on the row's name. A row that the preview material sets has no note, since a
material sets most rows. One permutation cannot show that a name is read by none, so a parameter
or texture that the drawn permutation does not read is marked "Unused with the current defines".

### S4: live defaults

A default parameter drags as a material's parameter does, through `LiveParam` and the held value,
writing `data` on release. The scatter is the identity for the def's own physical parameter, so
the held value writes the member directly.

**Built 2026-10-16.** The held value is drawn on the preview's material hash, the material the
def draws through or the def. A parameter marked `material` or `absent` edits as a plain vector.

### S5: a shader the project compiles

A project holds HLSL beside its bins, and a build writes the shader cache chunks that a def's
`objectPath` names into the project's layer of `ShaderCache.dx11.wad.client`.

- Compilation to SM 5.0 DXBC. `d3dcompiler_47.dll` ships with Windows and is the reference.
  DXC emits DXIL, which the game does not load. vkd3d-shader compiles HLSL to DXBC on every
  platform under the LGPL.
- The permutations are every combination of the defines the source declares, or the ones the
  project's materials select. The second keeps the build small and matches what the game ships.
- A `TOC3.0` writer and a bundle writer. `ltk_shader` reads both and writes neither, and
  `crates/hexshade/src/bundle.rs` already holds the chunk paths and the record trim.
- The engine's constant buffers keep the layouts the shipped blobs have, so the source includes a
  header of the 18 engine buffers that every shipped blob shares, and only `$Globals` is the
  author's.
- The preview of S1 draws the compiled result through the same read, since `AssetLookup` resolves
  the project's layer before the game's.

Open: whether the game validates the shader cache against a manifest or a signature, which a
build must be tested against before this tier starts.

## What stays out

- A node graph that writes HLSL. S5 compiles source a modder writes.
- A def outside `shaders.bin`, for the crash above.
