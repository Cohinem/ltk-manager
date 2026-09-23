# Map data on disk, and the chain from a MapSkin to a drawable .mapgeo

Research note. Every path, count and byte figure below was read out of a live install on
2026-09-20: `C:/Riot Games/League of Legends/Game`, content version
`16.18.8175716+branch.releases-16-18.content.release`. Nothing was written to the install.

Method. WAD tables of contents were read directly (`RW` header, major 3, 272-byte header, 32-byte
chunk records) and path hashes resolved against CommunityDragon's `hashes.game.txt`, with XXH64
used to probe paths the list does not name. Chunks were decompressed with Node's zstd and bins
converted with `ritobin_cli`. `.mapgeo` files were parsed against the layout in
`X:/lol/dev/league_structs/docs/reversing/MapgeoLoader.md`, cross-checked field for field against
`~/dev/lol/league-toolkit/crates/ltk_mapgeo/src/read/mesh.rs`. Class shapes come from the
`rito-meta` CLI. Reverse-engineering claims about the client's own code are cited to
`league_structs` rather than reproduced.

## 1 Where map files live

Map archives live in their own directory, one archive per map id, plus a shared `Common`:

```
Game
|-- DATA
|   |-- FINAL
|   |   |-- Maps
|   |   |   |-- Shipping
|   |   |   |   |-- Common.wad.client              100,164,065 B
|   |   |   |   |-- Common.en_US.wad.client
|   |   |   |   |-- Map11.wad.client             2,489,353,388 B
|   |   |   |   |-- Map11.en_US.wad.client
|   |   |   |   |-- Map12.wad.client             1,184,731,482 B
|   |   |   |   |-- Map22.wad.client             2,752,779,717 B
|   |   |   |   |-- Map30.wad.client               622,292,789 B
|   |   |   |   |-- Map453.wad.client              479,200,702 B
```

Everything a map needs is inside its own archive. The four path shapes, taken verbatim from
`Map11.wad.client` (uncompressed and compressed sizes as the table of contents reports them):

| what                    | real path                                            | uncompressed |
| ----------------------- | ---------------------------------------------------- | -----------: |
| map root bin            | `data/maps/shipping/map11/map11.bin`                 |    4,937,067 |
| geometry                | `data/maps/mapgeometry/map11/base_srx.mapgeo`        |   91,726,524 |
| geometry's materials    | `data/maps/mapgeometry/map11/base_srx.materials.bin` |    1,770,390 |
| a texture the map draws | `assets/maps/kitpieces/srx/textures/sru_brush.tex`   |       43,716 |

The `.mapgeo` and its `.materials.bin` are siblings with the same stem. That holds for every
container checked, across four map ids:

```
data/maps/mapgeometry/map11/base.mapgeo            data/maps/mapgeometry/map11/base.materials.bin
data/maps/mapgeometry/map11/base_srx.mapgeo        data/maps/mapgeometry/map11/base_srx.materials.bin
data/maps/mapgeometry/sr/banner_test.mapgeo        data/maps/mapgeometry/sr/banner_test.materials.bin
data/maps/mapgeometry/map22/carousel_set12.mapgeo  data/maps/mapgeometry/map22/carousel_set12.materials.bin
data/maps/mapgeometry/map30/mainmap.mapgeo         data/maps/mapgeometry/map30/mainmap.materials.bin
data/maps/mapgeometry/map453/jade_container.mapgeo data/maps/mapgeometry/map453/jade_container.materials.bin
```

The geometry directory is not always `map<N>`. Three Map11 skins point at `maps/mapgeometry/sr/`
instead, so the directory is whatever the container path says and not something derived from the
map id.

Textures divide by role. Inside `Map11.wad.client`, under `assets/maps/`:

| prefix                       | named chunks | role                                         |
| ---------------------------- | -----------: | -------------------------------------------- |
| `assets/maps/particles/`     |        1,033 | VFX textures and meshes                      |
| `assets/maps/kitpieces/srx/` |          304 | the environment art the materials sample     |
| `assets/maps/info/map11/`    |           36 | minimap backgrounds, grass tint, FoW overlay |
| `assets/maps/navgrid/`       |           27 | `.aimesh_ngrid` pathing                      |
| `assets/maps/cubemaps/`      |            9 | reflection probes                            |

Two more prefixes appear as per-mesh channel paths in other maps rather than in Map11:
`ASSETS/Maps/Lightmaps/Maps/MapGeometry/<Map>/<Container>/<n>.tex` and
`ASSETS/Maps/BakedPaint/Maps/MapGeometry/<Map>/<Container>/<n>.tex`. Counts are of chunks the
December 2025 CommunityDragon list can name. Map11 leaves 9,179 of 28,594 chunks unnamed, so these
are lower bounds, not a census.

`Map.WadDependencies` (property `0x51E9B98E`, a `List<String>`) can pull further archives in. Each
entry is stripped of its `WadFiles/` prefix and mounted as `DATA/FINAL/<rest>.wad.client`, which is
how Map12 and Map22 reach `Companions.wad.client`. See `Map_WadDependencies.md` in `league_structs`.
Map11 declares none.

## 2 The resolution chain

The chain has four links and one string-to-path rule.

```
Map  (data/maps/shipping/map11/map11.bin, entry "Maps/Shipping/Map11")
  |-- mapSkins: List<Link<MapSkin>>
  |     |-- MapSkin  (same bin, entry "Maps/Shipping/Map11/MapSkins/Default")
  |     |     |-- mMapContainerLink: String = "Maps/MapGeometry/Map11/Base_SRX"
  |-- derived: data/ + lowercase(link) + ".materials.bin"
  |     |-- mapContainer  (entry key equals the same string)
  |     |     |-- mapPath: String = "Maps/MapGeometry/Map11/Base_SRX"
  |-- derived: data/ + lowercase(mapPath) + ".mapgeo"
        |-- the OEGM bytes
```

`mMapContainerLink` is a bin entry path, not a file path and not a hash. Real values from
`map11.bin`:

```
"Maps/Shipping/Map11/MapSkins/Default"     -> "Maps/MapGeometry/Map11/Base_SRX"
"Maps/Shipping/Map11/MapSkins/Bloom"       -> "Maps/MapGeometry/Map11/Bloom"
"Maps/Shipping/Map11/MapSkins/Project"     -> "Maps/MapGeometry/Map11/Base"
"Maps/Shipping/Map11/MapSkins/NPE_1"       -> "Maps/MapGeometry/SR/NPE_1"
"Maps/Shipping/Map11/MapSkins/ULTBOOK"     -> "Maps/MapGeometry/Map11/SR_Seasonal_Map"
```

`MapContainer.mapPath` is neither a directory nor a file path. It is the container's own entry
path, and in every container read it is byte-identical to the entry key and therefore to the
`mMapContainerLink` that reached it. It carries no extension, so the consumer appends one.

The string-to-file rule, confirmed by probing XXH64 of the derived path against the archive's
table of contents:

```
chunk = xxh64_0(lowercase("data/" + mapPath + ".mapgeo"))
```

`"Maps/MapGeometry/Map453/JADE_CONTAINER"` resolves to
`data/maps/mapgeometry/map453/jade_container.mapgeo` (40,030,784 B), which settles both the
lowercasing and the `data/` prefix on a path whose original casing is loud.

Two wrinkles a reader has to survive.

**The container object lives in the geometry's own materials bin, not in the map bin.** The
`mapContainer` entry for `Maps/MapGeometry/Map11/Base_SRX` is inside
`data/maps/mapgeometry/map11/base_srx.materials.bin`. So resolving the container means deriving
the materials-bin path from the same string first, which makes the container lookup a consequence
of the derivation rather than a step before it. Only the `.mapgeo` suffix distinguishes the two
derived paths.

**A MapSkin may omit the link.** Eight of the 37 Map11 map skins carry no `mMapContainerLink` at
all: Odyssey, StarGuardian, PoolParty, Versus, PopStar, TFTR, Tournament and MSI. The property
reads as its class default, the empty string. Those skins change characters, minimap and particles
and take their geometry from elsewhere.

**A container can be a stub.** `Maps/MapGeometry/Map30/MainMap` resolves to a 100-byte
`mainmap.mapgeo`. Arena's real geometry sits in sibling containers (`arenaa.mapgeo` through
`arenaf.mapgeo`, `arenashop`, `arenavote`), and the stub container carries a `MapContainsOtherMaps`
component whose `MapContainerLocations` links a placeable container of island locators. Code that
assumes one skin means one drawable file is wrong on Arena.

The container also carries what the geometry alone cannot say: `MapSunProperties`,
`MapBakeProperties` (including `lightGridFileName` where one is set), `MapNavGrid.NavGridPath`,
`MapTerrainPaint.TerrainPaintTexturePath`, `boundsMin` and `boundsMax`, and a `chunks` map of
`Hash -> Link<MapPlaceableContainer>` naming the map's logical pieces (`Ground_Base`, `Plants`,
`SRX_Ground_Fire` and eleven more on SR).

## 3 Materials

Confirmed. `EnvironmentSubmesh::material()` returns the **full bin entry path of a
`StaticMaterialDef`**, and that object lives in the sibling `.materials.bin`.

A real submesh from `base_srx.mapgeo` carries the string
`Maps/KitPieces/SRX/Base/Models/LevelProp/Materials/VertexDeform_inst`. The matching entry in
`base_srx.materials.bin`:

```
"Maps/KitPieces/SRX/Base/Models/LevelProp/Materials/VertexDeform_inst" = StaticMaterialDef {
    name: string = "Maps/KitPieces/SRX/Base/Models/LevelProp/Materials/VertexDeform_inst"
    samplerValues: list2[embed] = {
        StaticMaterialShaderSamplerDef {
            TextureName: string = "DiffuseTexture"
            texturePath: file = "assets/maps/kitpieces/srx/textures/sru_brush.tex"
        }
    }
    paramValues: list2[embed] = { ... }
}
```

The entry key, the object's own `name` and the mapgeo's string are the same text. The bin stores
the key as FNV-1a-32 of the lowercased path, which is the ordinary bin entry-path hash. The
`material_hash` field beside the string in the file is always zero, because the client computes it
at load time (`ltk_mapgeo/src/submesh.rs`).

It is the same class, the same slots and the same shader join this repository already reads for
champion materials in `crates/ltk-manager-core/src/material/mod.rs`: `samplerValues` by
`TextureName`, `paramValues` by `name`, `techniques` to `passes` to a `CustomShaderDef` through
`StaticMaterialPassDef.shader`. Three differences matter to a consumer.

- The mapgeo names the material by **path string**, where a champion skin reaches it through a bin
  `Link`. A map material resolver therefore hashes the string itself.
- Champion `.skn` submesh names are short (`AnnieBase_Mat` on `annie_2012.skn`) and mean nothing on
  their own. Map submesh names are the whole path and resolve unaided.
- The **material scope is the container**, not the map. `base_srx.materials.bin` holds 180
  `StaticMaterialDef` entries and nothing outside it is consulted.

The join is not total. Of the 183 distinct material names in `base_srx.mapgeo`, 180 resolve and
three do not, case-insensitively:

```
Maps/KitPieces/SRS/Base/Materials/Default/HoL_TristanaStatue_A_MAT      (mesh 5)
Maps/KitPieces/SRS/Base/Materials/Default/HOL2026_Ground_C3_MidLane_A_MAT  (mesh 114)
Maps/KitPieces/SRS/Base/Materials/Default/HOL2026_Periph_Top_H_MAT      (meshes 168, 173)
```

None of the three is declared in `map11.bin` or in `base.materials.bin` either. A renderer needs a
missing-material path, which is what `ltk_mapgeo::MISSING_MATERIAL` (`-missing@environment-`) is
for.

Two further mechanisms sit on top and are documented in `league_structs`, not re-derived here. The
per-mesh `disableBackfaceCulling` byte makes the client look the material up as `"<name>|flipped"`
and, failing that, clone it with the cull mode inverted. The v17 sampler table plus per-mesh
overrides bind named shader slots such as `BAKED_DIFFUSE_TEXTURE` by literal `strcmp`, not by hash.
See `MapgeoLoader.md` and `MapgeoSamplerOverrides.md`.

## 4 Enumerating maps

There is no index bin. The client is handed a map id and builds the paths from it: it registers
`DATA/Maps/Shipping/Common/Common.bin` and `DATA/Maps/Shipping/Map<N>/Map<N>.bin`, then resolves
the entry `Maps/Shipping/Map<N>` to a `Map` object (`Map_LoadBinAndMountWadDependencies`,
`Map_WadDependencies.md`). `Maps/Shipping/Common/Common.bin` is not a registry either. It holds one
`Map` object of its own, `Maps/Shipping/Common`, with a character list and fog-of-war properties.

So listing maps means scanning `DATA/FINAL/Maps/Shipping/Map*.wad.client` and taking `N` from each
filename. The map ids installed today, with what their root bin reports:

| wad          | `mapStringId` | mode names in the bin           | MapSkins | named `.mapgeo` |
| ------------ | ------------- | ------------------------------- | -------: | --------------: |
| `Map11.wad`  | `SR`          | CLASSIC, URF, PRACTICETOOL, ... |       37 |              26 |
| `Map12.wad`  | `HA`          |                                 |       12 |               4 |
| `Map22.wad`  | `TFT`         |                                 |       23 |             144 |
| `Map30.wad`  | `TGR`         | cherry (Arena)                  |        1 |               9 |
| `Map453.wad` | `JD`          | two unnamed hashes              |        1 |               0 |

`Map453` is absent from the December 2025 CommunityDragon hash list entirely, so its zero is a
naming gap and not an absence. `data/maps/shipping/map453/map453.bin` (783,556 B) and
`data/maps/mapgeometry/map453/jade_container.mapgeo` (40,030,784 B) were both found by probing
XXH64 directly. Its `Map` and `MapSkin` entries print under hash keys rather than paths for the
same reason.

Map ids the hash list knows a `data/maps/shipping/map<N>/map<N>.bin` for, which is the historical
set rather than what ships: 3, 8, 10, 11, 12, 14, 16, 18, 19, 20, 21, 22, 30, 33, 35. Map33 (Arena
as it was) and Map35 (Brawl) are named there and are not installed. An enumerator that hard-codes
ids goes stale. The filename scan does not.

Listing the map skins of a map is one read, with a catch. All 37 Map11 map skins are entries of
`map11.bin`, but the `Map` object's `mapSkins` list names only 36 of them:
`Maps/Shipping/Map11/MapSkins/SR_Seasonal_Map` is a declared `MapSkin` that nothing in the list
points at. Scanning the bin for entries of class `MapSkin` (`0xCD19EF3C`) finds every one. Reading
`mapSkins` finds the ones the map advertises.

## 5 ResourceResolver

A `ResourceResolver` (class `0xEF3A0F33`) declares no properties of its own. Everything is on its
base `BaseResourceResolver`, which has exactly one: `resourceMap`, a `Map<Hash, Link<IResource>>`.
At runtime it is a flat sorted array of `{u32 keyHash, IResource*}` searched by `lower_bound`, and
resolvers stack in tiers ending at `GlobalResourceResolver` (`ResourceResolvers_VfxEffectKeys.md`).

It does not remap asset paths. It maps an **effect key hash to a bin object link**. Every entry in
every Map11 resolver read here points at a particle system:

```
"Maps/Shipping/Map11/MapSkins/URF/Resources" = ResourceResolver {
    resourceMap: map[hash,link] = {
        "SRX_Dragon_Elder_Cast1" = "Maps/Shipping/Map11/Particles/Default/SRX_Dragon_Elder_Cast1"
        "SRT_2024_Horde_Shield"  = "Shared/Particles/SRT_2024_Horde_Shield"
        ...
    }
}
```

So `MapSkin.mResourceResolvers` is **not required for correct textures** on a skinned map variant,
and cannot supply them. A seasonal variant gets its look from a different `mMapContainerLink`,
which means a different `.mapgeo`, a different `.materials.bin` and therefore different textures.
The elemental-rift variants of one container are separate again: those come from
`MapSkin.mAlternateAssets`, a list of `MapAlternateAsset` keyed by `mVisibilityFlagName` (`Fire`,
`earth`, `Ocean`, `CLOUD`, `Hextech`, `Chemtech`, `Void`), each carrying its own
`mGrassTintTextureName`, `mFowOverlayTextureName`, audio banks and `mParticleResourceResolver`.
Even there the resolver's job is particles.

A renderer that ignores `mResourceResolvers` entirely loses VFX and nothing else.

## 6 Scale, units and axes

**Y is up.** Measured, not assumed. The five largest meshes in `base_srx.mapgeo` span 500 to 1000
units in X and Z and 300 to 400 in Y, sitting near Y=0:

```
verts 30155  min [ 8184,  -91, 5922]  max [ 9155, 226,  6838]
verts 29905  min [ 2077,   39, 9409]  max [ 2624, 392, 10168]
verts 29523  min [  892,    0, 11992] max [ 1448, 348, 12711]
```

X and Z are the ground plane and match `MapContainer.boundsMin`/`boundsMax`. SR's container
declares `boundsMax = {14820.5254, 14881.4971}` against the class default of `[14820,14881]`, and
`boundsMin` is absent, so it takes the class default `[0,0]`. 540 of 586 meshes fall entirely
inside that box on X and Z. The 46 that do not are skybox and far scenery, and they push the union
to roughly `-13334..31715` on X and `-9338..33165` on Z.

`MapContainer.lowestWalkableHeight` on SR is `-100`, which also reads as a Y value.

The per-mesh AABB is already in container space. 504 of 586 SR meshes carry an identity transform,
and the largest meshes' stored AABBs land on the playfield unmodified. The transform is a
row-major `float[16]` placing the remainder. The loader additionally offsets AABB and transform by
the environment origin unless the mesh's v18 `regionPathHash` resolves, in which case placement
comes from the region entity instead (`MapgeoLoader.md`, correction 5). Thirteen SR meshes carry a
non-zero `regionPathHash`.

**The unit is the same one champion meshes use.** `annie_2012.skn` spans Y from -1.46 to 144.47, so
a champion is about 146 units tall standing at Y=0, in a map 14,820 units across. Both are Y-up on
the same scale, which is what `ltk_mesh` hands back for a `.skn` untransformed.

Size of SR, parsed:

| figure              | `base_srx.mapgeo` (v18, the Default skin) |   `base.mapgeo` (v14) |
| ------------------- | ----------------------------------------: | --------------------: |
| file size           |                              91,726,524 B |          27,582,633 B |
| meshes              |                                       586 |                 1,262 |
| submeshes           |                                       600 |                 1,268 |
| distinct materials  |                                       183 |                   200 |
| vertex buffers      |                                       571 |                   366 |
| vertex buffer bytes |                     79,882,112 (76.2 MiB) | 20,355,552 (19.4 MiB) |
| index buffers       |                                       401 |                   363 |
| index buffer bytes  |                       5,116,044 (4.9 MiB) |   1,732,836 (1.7 MiB) |
| vertices            |                                 2,042,809 |             1,395,781 |
| triangles           |                                   910,783 |               649,815 |
| scene graphs        |                                        29 |                     0 |

So an SR base map is roughly 76 MiB of vertex buffers and 5 MiB of index buffers, 586 meshes,
0.9 M triangles. The vertex and index payloads are 93 percent of the file. Other maps for scale:
Map12 `base.mapgeo` is v17, 342 meshes, 16.1 MiB of vertex buffers. Map30 `arenaa.mapgeo` is v17,
104 meshes, 3.7 MiB.

Ten vertex declarations are in play on SR. The element ids observed are 0, 2, 4, 7 and 12, and the
declarations range from one element to five.

One finding worth carrying: **current SR carries no baked lighting textures in the geometry at
all.** Every one of the 586 meshes has an empty stationary-light path, an empty baked-light path
and zero texture overrides, and the container sets no `lightGridFileName`. Probing for
`assets/maps/lightmaps/maps/mapgeometry/map11/base_srx/*` finds nothing. Other maps do use the
channels: Map12's `base.mapgeo` carries 330 non-empty channel paths under
`ASSETS/Maps/Lightmaps/Maps/MapGeometry/Map12/Base/`, and Map30's `arenaa.mapgeo` adds
`ASSETS/Maps/BakedPaint/...`. A renderer must treat the channels as optional.

## 7 What this note does not establish

- **What a MapSkin with no `mMapContainerLink` draws.** Eight Map11 skins omit it. The property
  defaults to the empty string, and no fallback was traced. Settling it needs the client's map skin
  activation path, in the neighbourhood of `MapSkinService_GetActiveMapSkin` (`0x1406B6970` in the
  16.15 Windows build named in `MapSkin_CharacterSkinOverride.md`).
- **How Arena composes its stub container.** `MapContainsOtherMaps` and `MapContainerLocations`
  name the mechanism and nothing here follows it to the point where `arenaa.mapgeo` is loaded.
  Reading `Maps/MapGeometry/Map30/Chunks/Default/IslandLocators` out of `mainmap.materials.bin`
  would settle it.
- **Where the three unresolved SR material names are meant to come from.** They are absent from the
  container's materials bin, from `map11.bin` and from `base.materials.bin`. A `bin-grep` across
  every archive would say whether they exist anywhere or are simply dead references.
- **Whether the container's `chunks` map gates drawing.** The SR container names 14
  `MapPlaceableContainer` chunks and the mapgeo names none of them. The link between a mesh and a
  chunk runs through `visibilityControllerPathHash` and `regionPathHash`, and this note counts
  those fields without resolving one.
- **The exact texture inventory of SR.** A third of `Map11.wad.client` is unnamed in the hash list
  available here, and 195 of 276 `texturePath` values in `base_srx.materials.bin` print as XXH64
  hashes rather than paths. A current CommunityDragon list would close most of that gap.
