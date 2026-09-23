# The minimap texture, and the world coordinate a marker on it stands for

Research note for #638 on the map backdrop map, #635. It answers where the minimap image comes
from, and states the image-to-world mapping as a formula a later ticket implements without
re-deriving it.

Provenance. Every path, hash, byte count and coordinate below was read out of a live install on
2026-09-20, `C:/Riot Games/League of Legends/Game`, content version
`16.18.8175716+branch.releases-16-18.content.release`. Nothing was written to the install.

Method. WAD chunks were listed and extracted with the `wadtools` build the app already installs
(`%LOCALAPPDATA%/LeagueToolkit/Manager/integrations/wadtools`), names resolved against the shared
mimir cache. Bins were parsed with `ltk_meta` through the repo's own
`crates/ltk-manager-core/examples/dump_vfx.rs`, and the fields it prints by hash alone were read
straight out of the file bytes by property hash plus type tag. Class shapes come from the
`rito-meta` CLI, dataset generation 2026-08-24. Textures were decoded with `ltk-tex-utils`, which
is `ltk_texture`, the crate `preview/texture.rs` reads through. The axis result in section 2 was
settled by drawing real world positions from the map's own bin over the decoded texture. This note
sits beside `docs/research/map-data-layout.md`, which covers the container chain and the geometry,
and does not repeat it.

## 1 Where the image comes from

`MapSkin.mMinimapBackgroundConfig` (`0x42fcf599`) is `Embed<MinimapBackgroundConfig>`
(`0x2acfe5ae`), a value class with no bases:

| field                       | hash         | type                                  | default             | since |
| --------------------------- | ------------ | ------------------------------------- | ------------------- | ----- |
| `mDefaultTextureName`       | `0xfe66e5ff` | `File`                                | `"0x0"`             |       |
| `mCustomMinimapBackgrounds` | `0x6f2107fb` | `Map<Hash, Embed<MinimapBackground>>` | `{}`                |       |
| `PreloadTextures`           | `0x7b213e8e` | `Bool`                                | `true`              |       |
| `0x47dc1276`                | `0x47dc1276` | `Map<Hash, Embed<0xd56fb9cc>>`        | `{}`                | 14.22 |
| `0x7035cf20`                | `0x7035cf20` | `Bool`                                | `false`             | 14.4  |
| `0xb4263aa3`                | `0xb4263aa3` | `Color`                               | `[255,255,255,255]` | 15.4  |
| `0xbe8bb0cd`                | `0xbe8bb0cd` | `Link<StaticMaterialDef>`             | `"0x0"`             | 16.7  |
| `0xe27f3283`                | `0xe27f3283` | `Bool`                                | `true`              | 15.17 |

`mDefaultTextureName` names the texture. It is the only field of the config that always carries
one, and it carries one on every shipped map skin (section 4).

**Its type changed at 16.17.** From 13.15 to 16.16 it is a `String` holding a path such as
`ASSETS/Maps/Info/Map11/2DLevelMinimap_Base_Baron1.tex`. From 16.17 it is a `File`, a 64-bit WAD
chunk path hash, which `ltk_meta` hands back as a `WadChunkLink`. `MinimapBackground.mTextureName`
and `0xd56fb9cc.TextureName` moved on the same patch. A reader of this field has to accept both
forms.

`MinimapBackground` (`0xa1ad51c0`) is the per-variant record and is where the world rectangle is
written down:

| field          | hash         | type   | default |
| -------------- | ------------ | ------ | ------- |
| `mOrigin`      | `0x9c77421a` | `Vec2` | `[0,0]` |
| `mSize`        | `0x6327fa09` | `Vec2` | `[0,0]` |
| `mTextureName` | `0xf9721a78` | `File` | `"0x0"` |

The unnamed class `0xd56fb9cc` behind `0x47dc1276` has the same three fields under the names
`Origin`, `Size` and `TextureName`. On SR it holds 40 records pointing at
`2dlevelminimap_atakhan_top_sticker.tex` and `2dlevelminimap_atakhan_bot_sticker.tex`, so it is a
second, smaller overlay map rather than a background, and the picker has no use for it.

### What a real value looks like

Summoner's Rift, `data/maps/shipping/map11/map11.bin`, 37 `MapSkin` objects:

- All 37 carry `mDefaultTextureName`. Thirty-five resolve to chunk `0x9eaab3ae5728854c`,
  `assets/maps/info/map11/2dlevelminimap_base_baron1.tex`. `ULTBOOK_RK` uses
  `2dlevelminimap_infernal_baron1.tex` and `NPE_1` uses `2dlevelminimap_npe_1.tex`.
- Twenty-three of the 37 also carry `mCustomMinimapBackgrounds`, 395 records in total: 18 records
  on twenty-one skins, 13 on `ULTBOOK_RK` and 4 on `Esports_Banners_Test`.
- **Every one of those 395 records sets `mSize` to `[14850, 14850]`, and not one sets `mOrigin`,**
  so every origin is the class default `[0, 0]`.
- The 15 distinct textures the records point at are the dragon-soul and baron-stage variants that
  ship beside the default, `2dlevelminimap_{base,cloud,hextech,infernal,mountain,ocean}_baron{1,2,3}.tex`.
  The `Default` skin's record set includes the default texture itself, under key `0xbf602812`.

The textures live in the map's own archive, under a flat directory:

```
Map11.wad.client
|-- assets
|   |-- maps
|   |   |-- info
|   |   |   |-- map11
|   |   |   |   |-- 2dlevelminimap_base_baron1.tex        349,564 B
|   |   |   |   |-- 2dlevelminimap_base_baron2.tex
|   |   |   |   |-- 2dlevelminimap_npe_1.tex              174,788 B
|   |   |   |   |-- 2dlevelminimap_atakhan_top_sticker.tex
|   |   |   |   |-- fogofwaroverlay.tex
|   |   |   |   |-- grasstint.tex
|-- data
|   |-- maps
|   |   |-- shipping
|   |   |   |-- map11
|   |   |   |   |-- map11.bin
```

### One image, and the existing decode path reads it unchanged

`2dlevelminimap_base_baron1.tex` is a `TEX` container, magic `TEX\0`, width 512, height 512,
format byte 12 which is `ltk_texture::tex::Format::Bc3`, mipmapped, 349,564 bytes. That is one
image with a full mip chain, not a tile set. `2dlevelminimap_npe_1.tex` is the same size in BC1 at
174,788 bytes. Map22's is 1024 by 1024 BC1.

`crates/ltk-manager-core/src/preview/texture.rs` needs no change. `AssetRef::preview` routes
`LeagueFileKind::Texture` into `texture::render`, which calls `Texture::from_reader` and decodes
mip level 0 when no `min_width` is asked for. Decoding the shipped file with `ltk-tex-utils`, the
same `ltk_texture` version, produces the 512 by 512 RGBA image every figure in section 2 was
measured on.

Locating the bytes has one seam. `useGroundTexture.ts` reaches its chunk through
`api.objects.locateGameFiles`, which takes a **path**, while a 16.17-or-later config gives a
**chunk path hash**. `AssetRef::GameChunk { wad, path_hash }` already takes the hash, so what is
missing is only the hash-to-archive step. `GameIndex::unnamed_at` looks a chunk up by hash today,
but only for chunks no hash table names.

## 2 The mapping

### The rectangle

The image covers an axis-aligned world rectangle on the ground plane, stated as an origin and a
size in engine units on X and Z:

- When the `MinimapBackground` record that supplies the texture carries `mOrigin` and `mSize`,
  those are the rectangle.
- When the texture comes from `mDefaultTextureName` with no such record, the rectangle is the
  map's `MapContainer.boundsMin` and `boundsMax`.

The second half is measured, not assumed. Howling Abyss is the clean case: its 12 map skins carry
`mDefaultTextureName` alone, with no `mCustomMinimapBackgrounds` and therefore no authored size
anywhere. `Maps/MapGeometry/Map12/Base` declares `boundsMin = [-28.429981, -19.028294]` and
`boundsMax = [12849.096, 12858.497]`. Projecting the fourteen `__NAV_C*` minion waypoints out of
`base.materials.bin` through that rectangle lands every one of them on the drawn bridge, over a
baseline that spans the whole image.

### The formula

Let the marker sit at `(u, v)` on the inset, both in `0..1`, with `u = 0` at the **left** edge and
`v = 0` at the **top** edge, which is row 0 of the decoded image.

```
worldX = originX + u * sizeX
worldZ = originZ + (1 - v) * sizeZ
```

and the inverse, for drawing a marker at a known position:

```
u = (worldX - originX) / sizeX
v = 1 - (worldZ - originZ) / sizeZ
```

where `origin` and `size` are the rectangle of the previous heading, and in the fallback case
`origin = boundsMin` and `size = boundsMax - boundsMin`.

**Image X runs with world X. Image Y runs against world Z.** The vertical axis is the one that
inverts, and it inverts because the image is read top-down while world Z grows away from the
blue-side corner.

Written as a texture UV instead, with `v_uv = 1 - v` measured from the bottom, the mapping is the
plain `uv = (worldXZ - origin) / size` that the engine's own `TERRAIN_XFORM` uses for map-wide
textures (`X:/lol/dev/league_structs/docs/reversing/Mantis_StudioLighting.md` section 3a). The flip
is a property of image row order, not of the data.

### How the axis was settled

`base.materials.bin` carries 1,169 named map objects, each a row-major `float[16]` transform
followed by its `name` property. Those are the real positions the client spawns from, and their
translation row reads out directly. Summoner's Rift, in engine units:

| object                     |       X |     Y |       Z |
| -------------------------- | ------: | ----: | ------: |
| `Turret_OrderNexus`        |  1551.0 |  86.0 |  1659.0 |
| `Turret_ChaosNexus`        | 13243.0 |  91.0 | 13235.0 |
| `Turret_OrderTurretShrine` |   105.0 |  36.7 |   134.0 |
| `Turret_ChaosTurretShrine` | 14576.0 | 466.0 | 14693.0 |
| `Turret_T1_L_03` (top)     |   981.0 |  37.0 | 10441.0 |
| `Turret_T1_R_03` (bot)     | 10504.0 |  41.0 |  1029.0 |

So blue side sits at low X and low Z, red side at high X and high Z, top lane at low X and high Z,
bot lane at high X and low Z. `Turret_` and `__NAV_` are two of the eleven map-object name prefixes
the client dispatches on, listed in `NavPointManager_LaneWaypoints.md` section 5.3.

Drawing every `Turret_*` and `__NAV_*` over the decoded texture under both signs of the Z term
separates them at a glance. With the flip, the blue turrets land in the bottom-left base, the red
ones in the top-right, the top-lane waypoints run up the left edge and across the top, the bot-lane
waypoints along the bottom and up the right, and each shrine lands inside its own base. Without it,
both shrines land in the wrong corner and the lanes swap. The same test on Howling Abyss puts the
waypoints on the bridge with the flip and off it without.

### Numbers per map

| map                   | container                                | `boundsMin`          | `boundsMax`              | authored `mSize` |
| --------------------- | ---------------------------------------- | -------------------- | ------------------------ | ---------------- |
| Map11 Summoner's Rift | `Maps/MapGeometry/Map11/Base`            | absent, so `[0, 0]`  | `[14820.525, 14881.497]` | `[14850, 14850]` |
| Map12 Howling Abyss   | `Maps/MapGeometry/Map12/Base`            | `[-28.430, -19.028]` | `[12849.096, 12858.497]` | none             |
| Map22 Convergence     | `Maps/MapGeometry/Map22/Base`            | absent, so `[0, 0]`  | `[4000, 4000]`           | none             |
| Map30 Arena           | `Maps/MapGeometry/Map30/MainMap`         | absent, so `[0, 0]`  | `[25000, 25000]`         | none             |
| Map453                | `Maps/MapGeometry/Map453/JADE_CONTAINER` | absent, so `[0, 0]`  | `[15000, 15000]`         | none             |

Summoner's Rift is the one map where the two candidate rectangles differ, and they differ by 29.5
units on X and 31.5 on Z, 0.2 percent of the map, under one pixel of a 512-pixel inset. The
authored square `0..14850` is what 395 of 395 records say, and it is the value to prefer where a
record supplies it.

### Borders and padding

The image carries no border and no padding. Its rectangle is the world rectangle edge to edge, and
the drawn terrain sits inside it the way the playable ground sits inside the map's bounds.

Summoner's Rift is 67 percent opaque, and the transparent part is the two corners the map has no
terrain in. Along each edge only 8 to 9 percent of pixels are opaque, and those are the base
structures that reach the corners: pixel `(511, 0)` and pixel `(0, 511)` are opaque while `(0, 0)`
and `(511, 511)` are clear. The projected shrine positions land 4 to 6 pixels from their corners,
which is where the art puts them.

Howling Abyss, Map22 and Map453 are fully opaque to the edge.

The consequence for a picker is that a marker can be dropped on a transparent pixel of the SR
image and still produce a perfectly valid world coordinate, because the rectangle covers ground the
art does not draw.

## 3 Orientation against the 3D scene

**Nothing in the data rotates.** `MinimapBackground` carries an origin, a size and a texture, and
no angle. The image's axes are the world's axes, so an inset drawn from it is north-up by
construction: screen-right is world `+X` and screen-up is world `+Z`.

The viewport already has that frame. `CAMERA_STANDS.top` in
`src/modules/viewport/camera/utils/cameraPresets.ts` looks along `[0, 1, 0]` with up `[0, 0, 1]`,
which puts ThreeJS `-X` to the right and `+Z` up. `AXIS_SIGN` in
`src/modules/viewport/shared/utils/space.ts` is `[-1, 1, 1]`, the mirror a bin position takes on
the way into the viewport, so ThreeJS `-X` is engine `+X`. The top preset and the minimap image
therefore show the same two axes the same way round, and a coordinate out of section 2 reaches the
scene as `(-worldX, y, worldZ)`.

What the data does not settle is whether the inset should rotate with the viewport camera. That is
a choice about the picker, and the two readings are: the image is a fixed north-up projection and
the game itself never turns it, against the app's camera being free to orbit in a way the game's is
not, which leaves the marker's up and the viewport's up disagreeing at any azimuth other than the
top preset's.

## 4 Coverage

The install ships five map archives. Every one of them names a minimap texture:

| map    | map skins | textures named                                                               | usable |
| ------ | --------: | ---------------------------------------------------------------------------- | ------ |
| Map11  |        37 | `2dlevelminimap_base_baron1`, `_infernal_baron1`, `_npe_1`, plus 15 variants | yes    |
| Map12  |        12 | `2dlevelminimap`, `_bilgewater2`, `_bloom`, `_crepe`, `jademinimap`          | yes    |
| Map22  |        23 | `2dlevelminimap`, `placeholderminimap`                                       | yes    |
| Map30  |         1 | `assets/maps/info/map22/2dlevelminimap.tex`                                  | no     |
| Map453 |         1 | `assets/maps/info/map453/minimap.tex`                                        | yes    |

Two entries need reading.

**Map30, Arena, points at another map's image.** Its single map skin's `mDefaultTextureName` is
chunk `0x1635500bd8361d93`, which is `assets/maps/info/map22/2dlevelminimap.tex`, the Convergence
board. The chunk is duplicated into `Map30.wad.client`, so the reference resolves and a picker that
only checks for a texture sees a healthy map. The image is a 3-by-3 grid of hex slots and the
container declares `boundsMax = [25000, 25000]` against the 4000 the image was drawn for, so the
mapping in section 2 produces coordinates with no relation to what the marker is over. Arena is the
shape of the failure a picker meets: a texture that resolves and does not describe the map.

**Map22, Convergence, is a board rather than a battlefield.** Its image and its bounds agree, so
the mapping holds, but 4000 units on a side is a different scale of thing from Summoner's Rift.

No shipped map skin leaves `mDefaultTextureName` at its `"0x0"` default, so a map with no texture
at all does not occur in 16.18. A map added later can still be the first.

## 5 What this note does not establish

- **Which custom background the client picks.** The 18 keys of
  `mCustomMinimapBackgrounds` are bare hashes and none of them cracks against the obvious
  candidates: `0x53c208b2`, `0x8f6dd7ce`, `0xe092b0cd`, `0xf57594b2`, `0x9f207752`, `0xc196cd4c`,
  `0x1871d567`, `0xea479ca6`, `0xd0b11a05`, `0xf228c6c2`, `0xa1860c09`, `0x21f3db81`, `0xa9c1b89e`,
  `0xe9f628a6`, `0xd05fa605`, `0xbb3b9246`, `0xbaf1c4a5`, `0xbf602812`. The textures they point at
  are the six dragon-soul terrains crossed with three baron stages, so the key is very likely a
  match-state identifier. The counts do not settle it: 18 keys against 15 distinct textures, and two
  keys share `2dlevelminimap_base_baron3`. The meta wiki has no prose for either class. Settling it
  needs the client's minimap background selection path. A picker that always takes
  `mDefaultTextureName` does not need the answer.
- **Whether the engine prefers `mSize` to the container bounds for the default texture.** Summoner's
  Rift authors both, `0..14850` and `0..14820.525 / 14881.497`, and they differ by less than one
  pixel of a 512-pixel inset, so no overlay separates them. Settling it needs the client's own
  rectangle computation, or a map that authors a size far enough from its bounds to show.
- **The pre-16.17 `String` form in practice.** The type change is read from the meta dataset and the
  16.18 install carries only the `File` form. No older install was on hand to confirm the path
  spelling a 16.16 bin holds.
- **Whether Map22's and Map453's images line up with their bounds.** Both were checked for the
  presence of a texture and the declared bounds, and neither was checked by overlaying real object
  positions the way sections 2 and 3 check Map11 and Map12. Neither ships `Turret_*` objects under
  the names the SR test uses.
- **Whether Arena's other containers declare bounds Map22's image would suit.** Only
  `mainmap.materials.bin` was read. Map30 ships nine more containers, `arenaa` through `arenag`,
  `arenashop` and `arenavote`, and `docs/research/map-data-layout.md` section 7 already records that
  how Arena composes them is untraced.
- **How a hash reaches an archive.** Section 1 names the seam and does not close it. `GameIndex`
  is keyed on path, and `unnamed_at` is the only by-hash lookup it offers.
