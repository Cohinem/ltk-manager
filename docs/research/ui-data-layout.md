# UI data on disk, from a client state to a pixel on an atlas page

Research note. Every path, count and byte figure below was read out of a live install on
2026-09-29: `C:/Riot Games/League of Legends/Game`, content version
`16.19.8217343+branch.releases-16-19.content.release`. Nothing was written to the install. It is
the evidence for the UI editor plan in `docs/plans/atlas-ui-editor.md`.

Method. Archives were listed and extracted with `wadtools`, with names from the mimir cache and
CommunityDragon's `hashes.game.txt` of 2026-09-24. Every bin was converted with `ritobin_cli` to
text and JSON and counted by a script over the JSON. Class shapes come from the `rito-meta` CLI's
database for build 8217343. Path hashes were checked with XXH64 over the lowercased path. Textures
were decoded by wrapping the TEX payload in a DDS header. Claims about the client's own code are in
section 11 and cite function addresses in the 16.17 build.

## 1 Where the UI ships

| archive                        |    compressed | chunks | what it holds                                                                                                                |
| ------------------------------ | ------------: | -----: | ---------------------------------------------------------------------------------------------------------------------------- |
| `UI.wad.client`                | 444,603,315 B | 14,603 | every in-game and loading-screen UI: view controllers, scenes, auto-atlas pages, hand-made atlases, UI particles, Spine rigs |
| `UI.en_US.wad.client`          |     140,756 B |      6 | six localized textures under `assets/ux/{endofgame,tft,tftmobile}`                                                           |
| `Bootstrap.windows.wad.client` |  51,919,439 B |    507 | what runs before `UI.wad` loads: the login and patching screens, the message box, fonts, shaders, string tables              |

By type, `UI.wad.client` is 13,024 textures (1,484.5 MB uncompressed), about 950 property bins,
235 auto-atlas manifests, 100 `.scb` meshes, 59 Spine `.skel` and 50 Spine `.atlas` files, 39
fonts, and a few skinned meshes and Wwise banks. 25 chunks have no known name.

Bootstrap holds its own copy of `ux/fonts`, `common/messageboxdialog.bin` and the message box
scene, plus the pre-login scenes under `patching/ux/riotui/{login,loginbg,patching,
patchingmodalshroud,invaliddevice,accountlockeddialog}/uibase`, the 28 locale string tables under
`data/menu/<locale>/` and the 349 HLSL shader chunks. The scene format is the same in both archives.

## 2 The chain

```
gameplay.bin                           ViewControllerSet { ClientState, ListsToLoad }
  ViewControllerList                   Filter tree + ViewControllers: [path string]
        |
gameplay.scoreboard.bin                ScoreboardViewController        (root bin, one per UI)
  PathHashToSelf: file = xxh64("clientstates/gameplay/ux/scoreboard")
  BaseLoadable -> "…/Scoreboard/UIBase"      UiPropertyLoadable         { FilepathHash }
  MobileOverrideLoadable, TabletOverrideLoadable, …
                 -> "…/Scoreboard/SB_Mirrored" UiPropertyOverrideLoadable { FilepathHash, OverrideSrcFolder }
  named hash fields -> elements and scenes the controller drives
        |
clientstates/gameplay/ux/scoreboard/uibase      PROP scene bin, no extension
  UISceneData            tree through ParentScene
  UiElement*Data         Scene link, Layer, Position, TextureData, …
        |
clientstates/gameplay/ux/scoreboard             IMAA manifest, no extension, same path as PathHashToSelf
        |
uiautoatlas/clientstates/gameplay/ux/scoreboard/atlas_0.tex   packed page
```

A client state root (`gameplay.bin`, `loadingscreen.bin`, `pregame.bin`, `tftcommon.bin`,
`tftpregame.bin`, `common.bin`) holds `ViewControllerSet` and `ViewControllerList` objects. A list
has a `Filter` tree and the paths of the controllers it loads. The filters are
`ViewControllerFilter_{And,Or,Not,Mode,Map,Mobile,Spectator,Clash,Champion}` and three unnamed ones
(`TftGameType`, `TFTSetData`, and one with no fields). `ViewControllerFilter_Champion` takes a
`ChampionSkinDataLink`, which is how a skin such as `Characters/Sett/Skins/Skin66` gets its own HUD.

Each controller lives in its own root bin named `<clientstate>.<name>.bin`, 296 of them. There are
154 named `ViewController` subclasses over 300 instances. The most common are
`TFTArmoryViewController` (40), `LogicDriverViewController` (23) and `ModalDialogViewController`
(14). A subclass is C++ behaviour: its fields name the scenes and elements the code fills at run
time, as `hash` values holding an element's path (`Team1KillText: hash = "…/SB_TeamKills_T1Score"`).

## 3 Paths and hashes

Checked by XXH64 over the lowercased string, against the scoreboard:

| field                                     | hashes the string                                 |
| ----------------------------------------- | ------------------------------------------------- |
| `ViewController.PathHashToSelf`           | `clientstates/gameplay/ux/scoreboard`             |
| `UiPropertyLoadable.FilepathHash`         | `clientstates/gameplay/ux/scoreboard/uibase`      |
| `UiPropertyOverrideLoadable.FilepathHash` | `clientstates/gameplay/ux/scoreboard/sb_mirrored` |
| `…OverrideSrcFolder`                      | the base loadable's path                          |

Both are also chunk paths, with no extension. The WAD holds `clientstates/gameplay/ux/scoreboard`
(the IMAA manifest, 104 B) and `clientstates/gameplay/ux/scoreboard/{uibase,sb_mirrored,
sb_socialsr,scores_dragon_srx}` (scene bins). `wadtools` names these `*.ltk` and `*.ltk.bin` on
extraction because it cannot see an extension, and 877 chunks under `clientstates/` have this shape.

Object names follow the folder in title case: `ClientStates/Gameplay/UX/Scoreboard/UIBase/
Scoreboard/Scoreboard_TeamScores/SB_TeamKills_T1Score`. The path of an element is its scene path
plus its own name, so an element's key already tells its scene, but the `Scene` link is what the
game reads.

The auto-atlas page is `uiautoatlas/<controller folder>/atlas_<n>.tex`. Two pages are missing from
the hashtables, and both reproduce under that rule and occur in `UI.wad.client`:

```
7a85a6529871328f uiautoatlas/clientstates/gameplay/ux/lol/jade/jadeoffscreenpoi/atlas_0.tex
53699d3d1191988c uiautoatlas/clientstates/gameplay/ux/lol/jade/jadepingradial/atlas_0.tex
```

## 4 Scene bins

396 `uibase` scene bins hold 25,740 objects:

| class                                     |  count | role                                               |
| ----------------------------------------- | -----: | -------------------------------------------------- |
| `UiElementIconData`                       | 12,055 | a textured quad                                    |
| `UiElementTextData`                       |  3,502 | a text box                                         |
| `UiElementRegionData`                     |  3,433 | an invisible rect: hit area, layout region, anchor |
| `UiElementParticleSystemData`             |  1,241 | a `VfxSystemDefinitionData` drawn in screen space  |
| `UiElementGroupButtonData`                |  1,153 | a button: state lists over child elements          |
| `UISceneData`                             |    958 | a layer of the tree                                |
| `UiElementGroupData`                      |    779 | a plain group                                      |
| `UiElementGroupManagedLayoutData`         |    542 | a list or grid that places its children            |
| `UiElementEffect*Data` (15 kinds)         |  1,535 | animated, cooldown, desaturate, glow, arc fill, …  |
| `UiElementSpineAnimationData`             |     70 | a Spine skeleton                                   |
| `UiElementScissorRegionData`              |     62 | a clip rect for a scene                            |
| `UiElementGroup{Slider,Meter,Framed}Data` |    254 | slider, fill meter, framed group                   |
| `UiSceneViewPaneData`                     |     56 | a scrolling scene                                  |

The class tree, current at 16.19 (interfaces marked `*`):

```
*UiElementIData            name, Scene -> UISceneData
  *UiElementData           Enabled, Layer, Position -> *UiPositionBase, BlockInputEvents, DragType
    *UiElementAssetData
      *UiElementEffectData   15 effect classes, most with TextureData -> *IUiEffectTextureDataProvider
      UiElementIconData      TextureData -> *IUiTextureDataProvider, Color, Material, FlipX/Y,
                             PerPixelUvsX/Y, FillType, UseAlpha, Extension
    UiElementParticleSystemData   VfxSystem, VFXAdjustmentScale, MaxPlayCount, TextureOverrides
    UiElementRegionData, UiElementScissorRegionData, UiElementSpineAnimationData
    UiElementTextData        FontDescription, HTMLStyleSheet, TRAKey, alignment, WrappingMode
  UiElementGroupData       Elements: [UiElementIData]
    UiElementGroupButtonData, UiElementGroupManagedLayoutData, UiElementGroupMeterData,
    UiElementGroupSliderData, UiElementGroupFramedData, and an unnamed container with Alpha,
    transform, ScrollSettings and the UiComponent instance below it
UISceneData                Layer, Enabled, ParentScene, SceneTransitionIn/Out, InheritScissoring,
                           HandleInputDuringPause, Elements
  UiSceneViewPaneData      scrollingScene, scroll and drag regions, Slider
```

A scene is not a container in the file. Every element points up to its scene through `Scene`, and
every scene points up through `ParentScene`, so the tree is rebuilt by reading the links. Groups
list their children through `Elements`, and a child of a group still names its own `Scene`.

### Position

22,964 elements use `UiPositionRect`, 86 `UiPositionFullScreen` and 31 `UiPositionPolygon`.

```
UiPositionRect
  UIRect: UiElementRect { Position vec2, Size vec2, SourceResolutionWidth u16, SourceResolutionHeight u16 }
  Anchors -> AnchorSingle { Anchor } | AnchorDouble { anchorLeft, anchorRight } | AnchorHierarchy
  IgnoreGlobalScale, IgnoreSafeZone, DisableResolutionDownscale,
  DisablePixelSnappingX/Y, MinSize, MaxSize
```

`Position` and `Size` are pixels in the element's own source resolution, top-left origin. The
resolutions in use:

| source resolution |  rects | what uses it                      |
| ----------------- | -----: | --------------------------------- |
| 1600 x 1200       | 16,539 | the desktop HUD                   |
| 1334 x 750        |  9,050 | mobile-first and shared scenes    |
| 1920 x 1080       |    447 |                                   |
| 1920 x 1440       |    434 |                                   |
| other             |     71 | 2048 x 1024, 1337 x 750, 1 x 1, … |

Anchors are fractions of the screen. `AnchorSingle` is 16,451 of 16,801 anchored rects. The common
values are `0.5, 0.5` (6,108), `0.5, 1` (4,778), `1, 0` (2,997), `1, 1` (1,382), `0.5, 0` (1,234) and
`0, 1` (1,150). `AnchorDouble` (213) stretches between two anchors. `AnchorHierarchy` (137) places
the element inside its parent's rect instead of the screen, with a per-axis align or stretch, and
the newer Jade HUD uses it. Its name hashes to `0xf090d2e7`, which is missing from CommunityDragon's
`hashes.bintypes.txt`, so `ritobin` prints the hash. How the client turns anchors into screen pixels
is section 11.

### Draw order

Scenes carry large `Layer` values (the message box is 90000 and 90001) and elements carry small ones
(10 to 30 for the message box buttons). The reference render in section 12 draws by scene layer and
then element layer, and nothing it draws lands under something the game draws over it.

## 5 Texture references

An element names its image in one of two ways. Both come in plain, 3-slice and 9-slice forms.

| family                | plain | 3-slice H | 3-slice V | 9-slice | resolves to                         |
| --------------------- | ----: | --------: | --------: | ------: | ----------------------------------- |
| `AtlasData*`          | 8,443 |       180 |        28 |      71 | a `.tex` that ships, plus a UV rect |
| `LooseUiTextureData*` | 3,214 |       125 |         9 |     141 | an IMAA entry                       |

`AtlasData` carries `mTextureName`, the size the UVs were authored against
(`mTextureSourceResolutionWidth/Height`) and `mTextureUV` as a pixel rect `x0, y0, x1, y1`. The
slice forms carry `TextureUs`, `TextureVs` and the edge sizes on screen. Of 9,007 references, 9,005
point at a texture in `UI.wad.client`, all 420 distinct ones named: hand-made atlases such as
`assets/ux/lol/clarity_hudatlas.tex` (BC3, 1024 x 1024).

`LooseUiTextureData` carries only `TextureName`. The name is the artist's source file, not a game
file, `assets/ux/tftmobile/modal/tftm_modal_uib_confirmhover.png` for example. 3,718 of the 3,771
hashes are in the hashtables. None of them ships as a chunk. All 3,771 resolve through an IMAA
manifest: 3,761 in the manifest of the controller that owns the scene, and 10 in another
controller's manifest.

`TextureName` and `mTextureName` became `File` in 16.17 and 16.18 (see
`docs/research/property-type-16-18-not-repairable.md`), so a mod made earlier writes them as
strings.

## 6 The IMAA manifest

Checked against all 232 manifests under `clientstates/`, with no trailing bytes and every index in
range:

```
offset  type               field
0       char[4]            magic "IMAA"
4       u32                atlasCount     (1 in 163 files, 2 in 68, 5 in 1)
8       u64[atlasCount]    xxh64 of "uiautoatlas/<folder>/atlas_<i>.tex"
…       u32                entryCount
…       entry[entryCount]  28 bytes each
          u64              xxh64 of the LooseUiTextureData TextureName
          f32 x 4          u0, v0, u1, v1, normalized to the page
          u32              atlas index into the hash array
```

The field at offset 4 reads like a version in a hex dump, but it is the page count. The largest
manifest lists five pages. Entries are sorted ascending by key in all 235 manifests, and they must
be: the client finds an entry by binary search (section 11). The file has no rotation or trim flag.

## 7 The packed pages

307 pages in `UI.wad.client` and 6 in Bootstrap (the message box and three font stylesheets).

| property  | observed                                                                           |
| --------- | ---------------------------------------------------------------------------------- |
| format    | BC7 (TEX format 13) for 232 pages, BC1 (10) for 75, both sampled as UNORM          |
| size      | powers of two, rectangular: 2048 x 128, 512 x 16, 1024 x 512, …                    |
| largest   | 2048 on the long side (147 pages)                                                  |
| mipmaps   | none on any page                                                                   |
| placement | every rect on whole pixels, 2 px from the page edge, 4 px or more from a neighbour |

A packer that reproduces the game's pages needs power-of-two pages up to 2048, 2 px padding around
each sprite, no mipmaps, and BC7 for pages with alpha. `ltk_texture` names format 13
`BC7_UNORM_SRGB`, but the client creates every texture as a UNORM format and the UI works in gamma
space (`docs/plans/atlas-renderer.md`, section 2.3), so a page is encoded from its PNG's bytes as
they are. `ltk_texture` encodes BC7 through its
`intel-tex` feature, which the manager already builds.

## 8 Variants

A controller's other loadables change its base scene for a platform, locale or mode. Every
`UiPropertyOverrideLoadable` names a `PTCH`: 229 of 230, and the last names a chunk that does not
ship. The client's override loader accepts nothing else (section 11). A `PROP` beside a `uibase` is
not an override. It is a `UiPropertyLoadable` of its own: another controller's base, or an alternate
base in a slot such as `EsportsLoadable` or `ClashLoadable`, or a `UiComponent` file.

The file names say what a variant is for: `uimobile` (86), `uitablet` (17), `uirtl` (7),
`uiflipped`, `uiflippedminimap`, `uiframesonleft`, `uitencent`, `uijade`, `uicrepechaos` and
`uicrepeorder`, and TFT set variants such as `uibase_tft15` and `uimobile_tft15`. Of the `PTCH`
variants, 178 only patch objects the base has, and 15 also add objects.

A PTCH entry is `{ path, value }` against an object key, and the path is the dotted property path.
The paths that occur most are `Position.UIRect` (3,436), `Scene` (2,456), `Position.Anchors`
(1,466), `Position.IgnoreGlobalScale`, `Layer`, `TextureData` (913) and `TextureData.mTextureUV`
(356). A variant moves, re-parents, re-layers and re-skins elements. It never needs its own IMAA
manifest because it points `TextureData` at other entries of the same one.

When a variant applies is code, not data. The controller names its slots, and the slot names are
all the data says: `MobileOverrideLoadable` and `TabletOverrideLoadable` (35 classes each),
`MobileOverride`, `RTLOverride`, `MobileRTLOverride`, `FlippedOverride`, `FlippedMinimapOverride`,
`TencentOverrideLoadable` and `DragonUiLoadable`. On the Windows client the mobile slots are never
registered, so no `uimobile` patch applies on PC (section 11).

## 9 Text

`UiElementTextData` links a `GameFontDescription` in `ux/fonts` (1,630 of them), which links a
`FontType` and a `FontResolutionData`:

```
GameFontDescription  Color, outlineColor, shadowColor, glowColor, colorblind variants, fillTextureName
  typeData       -> FontType            localeTypes: [{ localeName, mFontFilePath, FontFilePathBold }]
  resolutionData -> FontResolutionData  localeResolutions: [{ resolutions: [{ fontSize, shadowDepthY, … }] }]
```

The font files are OpenType and TrueType under `assets/ux/fonts/` (Beaufort for LoL, Spiegel, and
per-locale faces such as `UttumDotum.ttf` for `ko_kr`). A text box's string is `TRAKey`, a key into
the RST string tables, or is set by the controller at run time. `HTMLStyleSheet` links a `CSSSheet`
of named styles and inline icons, and its icons are packed into the font stylesheet pages in
section 7.

## 10 Motion and logic

- **Scene transitions.** `SceneAlphaTransitionData` (293) and `SceneScreenEdgeTransitionData` (105)
  fade or slide a scene in and out, with an easing, a delay and a duration.
- **Effects.** `UiElementEffectAnimationData` plays a flipbook from an atlas
  (`TotalNumberOfFrames`, `NumberOfFramesPerRowInAtlas`, `FramesPerSecond`). The cooldown, radial,
  arc-fill, desaturate and glow effects are shader effects over one texture.
- **Particles.** `UiElementParticleSystemData.VfxSystem` links a `VfxSystemDefinitionData` in the
  controller's root bin. 1,000 of those live in UI root bins.
- **Sequences.** `Sequence` (82 in root bins) is the engine's shared timeline class. Its actions
  target elements by path hash. The UI actions (move with a pivot, scale, colour, enable an element,
  enable a scene, play a Spine animation) are unnamed classes in the schema. They are most of the
  1.9% of objects in the two UI archives whose class has no name. Scene bins are almost fully named, 28
  unnamed of 26,608 top-level objects.
- **Logic drivers.** `LogicDriverViewController` lists `LogicDriverViewEntry` objects, each a
  `Scene` and an `EnableCondition` plus conditional element lists, and the conditions are the
  material driver tree (`AllTrueMaterialDriver`, `HasBuffDynamicMaterialBoolDriver`, `IsOptionEnabledBoolDriver`,
  `FloatComparisonMaterialDriver`, …). The skin HUD overlays (for example
  `ClientStates/Gameplay/UX/LoL/Skins/AhriSkin86ViewController`) are built this way with no
  controller code of their own.
- **Components.** `UiComponent` (a template with `ViewModel`, `BindingInstances`,
  `VariableDefaults` and behaviours) and `UiElementComponentInstanceData` are a data-binding system
  used by three controllers in this build. The global `ux/components`, `ux/viewmodels` and
  `ux/variables` bins are almost empty.
- **Spine.** 70 `UiElementSpineAnimationData` elements name `SpineSkelFile` and `SpineAtlasFile`
  in the same archive. The client runs them with the official Spine C++ runtime.

## 11 What the client does with it

Read in `C:/lol/RE/builds/16.17.8057408/League of Legends.exe.i64`. Every address is in that build.
A claim marked _(inferred)_ was not read in decompiled code.

### Loading

- `0x14064B110` loads a client state's `<state>.bin`, then one `<state>.<view>.bin` per registered
  view (`0x140E26210` builds the names), then flushes the UI manager (`0x1413D7310`).
- A controller's vtable slot 3 (`0x141397130`) loads its manifest: `0x14133A6E0` opens the chunk
  whose hash is `PathHashToSelf`, checks the `IMAA` magic, parses it (`0x1413419A0`) and adds the
  table to one global list. Nothing about the path is derived at run time.
- Slot 4 (`0x1413D0550`) queues `BaseLoadable` on the UI manager (`0x1413D5150`). The flush
  (`0x1413CB220`) loads each queued `FilepathHash` through the bin cache (`0x1411A80D0`).
- An override loadable becomes a `{ patch, target, priority }` record (`0x1413D51C0`), kept sorted
  by priority and switched on by `0x1413DA830`. On load the bin cache applies every switched-on
  patch whose target is the file. The parser (`0x1411A94A0`) requires the base to be `PROP` version
  2 or 3 and each override to be `PTCH` version 1, and logs `Data Override - Incorrect Format`
  otherwise.
- Each controller subclass registers its own overrides in its slot 4, about 90 call sites of
  `0x1413D51C0`. The mobile branch is gated by a function that returns `false` on this client
  (`0x1401E7AC0`), so mobile patches never apply on PC. Other slots are gated by client
  configuration flags _(inferred for what the flags mean)_.

### Sprites

- `LooseUiTextureData` resolves in `0x14133CFD0`: first a find in the texture manager's map by the
  `TextureName` hash, then a binary search (`0x14133CD70`) through **every loaded manifest**, then
  nothing. The 10 references in section 5 that resolve through another controller's manifest work
  because that manifest is already loaded.
- A hit creates a region object holding the page (loaded by hash through `0x14133D820`) and the UV
  rect, and caches it in the texture manager's map under the key.
- **There is no fallback to a loose file.** A `.tex` shipped at the `TextureName` path is never
  read, and a plain texture cached under that hash fails the region type check at draw time
  (`0x14132A790`).
- `AtlasData` loads `mTextureName` as a real texture through the same `0x14133D820`, which loads it
  if it is not cached. `mTextureUV` is divided by the source width and height in `0x1413B3BD0`, and
  used as already normalized when either is 0.
- A second, string-based lookup (`0x14133DB00`), called from gameplay code, falls back to
  `<dirname(texture path)>/atlas_info.bin` as an IMAA file. No scene reaches it.
- Flips come from the element, not the manifest: `FlipX` is flag `0x40` and `FlipY` the sign bit
  (`0x1413B42A0`).

### Layout

`0x1413CD430` turns an element's position data into a run-time rect, and `0x1413B2860` solves it
against the screen. The rect is kept in normalized units:

```
base  = (X / SW, Y / SH, (X + W) / SW, (Y + H) / SH)       SW x SH is the element's source resolution
g     = IgnoreGlobalScale ? 1 : hud                        hud = s + (1 - s) * 0.66, s = HUD scale setting in 0..1
edge  = (edge - anchor) * g + anchor                       per edge, AnchorSingle uses one anchor for both edges
k     = safeZone.height                                    1 when IgnoreSafeZone
kx    = k * (SW / SH) / (screenW / screenH)
x     = (x - anchor.x) * kx + lerp(safeZone.x0, safeZone.x1, anchor.x)
y     = (y - anchor.y) * k  + lerp(safeZone.y0, safeZone.y1, anchor.y)
x, y += parent origin
pixel = round(x * screenW), round(y * screenH)             unless DisablePixelSnappingX / Y
```

So a size scales by `screenH / SH` times the HUD scale on both axes, the aspect term keeps square
pixels square, and the anchor point is the fixed point, placed inside the safe zone.
`UiPositionFullScreen` takes the whole screen (`0x1413B2860` answers `0, 0, 1, 1` for it).
`DisableResolutionDownscale` scales by `max(SH / screenH, 1)` in place of the HUD scale, so the
element never shrinks below its source size. `MinSize` and `MaxSize` (default 0 and 1,000,000)
clamp in source pixels. The inverse, from a screen rect back to source units, is `0x1413B1A60`,
which layout groups and drag and drop use. Two terms were not traced to their defaults (run-time
rect `+96` to `+112`) and are read here as identity.

`AnchorHierarchy` (`0x1413B2860`, fields copied in `0x1413CD430`) answers the zero vector as both
anchors, so its position scales from the safe zone's corner like any rect, and is then placed in
the parent's rect per axis. `AlignX` and `AlignY` (`+10`, `+11`) put it at 0, 0.5 or 1 of the
parent's span less 0, 0.5 or 1 of its own size, the pivot, which is the unnamed `0x0a567dbd` on X
and `0x09567c2a` on Y (`+8`, `+9`). An align of 3 stretches the axis between the parent's edges
less two margins, `0xf00a15b2` on X and `0x8ecb313b` on Y, each near then far, scaled by
`screenH / SH` and the safe zone without the HUD scale. The parent is the nearest group with a
`Position` of its own, which in shipped data is the unnamed container `0x8ffd7c61` or the screen.

### Managed layouts

A `UiElementGroupManagedLayoutData` moves its children inside its `Region` (`0x1413E4740`). Its
`LayoutStyle` is `LayoutStyleHorizontalList`, `LayoutStyleVerticalList` or `LayoutStyleGrid`, and
the constructor zeroes every field:

| field                                                 | offset | values                                              |
| ----------------------------------------------------- | -----: | --------------------------------------------------- |
| `HorizontalJustification`, `VerticalJustification`    |   8, 9 | 0 start, 1 centre, 2 end, 3 space around, 4 between |
| `HorizontalFillDirection`, `VerticalFillDirection`    | 10, 11 | 1 fills from the far edge                           |
| `FillPriority` (grid)                                 |     12 | non-zero fills columns first                        |
| `RowVerticalAlignment`, `ColumnHorizontalAlignment`   |     16 | 0 start, 1 centre, 2 end across the row or column   |
| grid `RowHorizontalAlignment`, `RowVerticalAlignment` | 16, 17 | as above                                            |

Each child is measured by its rect with its own offset cleared, a group by the union of its
children, and with `IgnoreDisabledElements` a disabled child is left out. The children pack edge
to edge from the region's start, a grid wrapping at its far edge, even for a child that fits it
exactly. The whole run then moves by the justification, and each child by its alignment across
its row. A grid's `RowHorizontalAlignment` reaches the run-time group only for a right-to-left
locale, so it is 0 otherwise. `FlipForRTL` swaps justification 0 and 2 and the fill directions in
such a locale.

The answer is an offset per child (run-time element `+128`). An element's frame is its parent's
frame plus its own offset (`0x1413B0DD0`), so a layout that moves a group moves everything under
it, and that sum is the parent origin the formula above adds.

The HUD scale setting's callback is `0x140C3E620`, and `0x1413DABB0` stores the result and marks
every scene for a re-layout.

### Draw order

A scene keeps its own `Layer` as is. It is not added to its parent scene's layer (`0x1413CD1A0`).
The input sort (`0x1413C7A80`) orders by scene layer and then element layer, topmost first. Drawing
in the same key ascending is _(inferred)_, and the reference render in section 12 agrees with it.

### Drawing

A batched quad pipeline over `ASSETS/Shaders/HLSL/UI/UI.vs` with `UI_Alpha.ps` and `UI_Opaque.ps`,
and one shader pair per effect: `Cooldown`, `CooldownRadial`, `ArcFill`, `Ammo`, `Glow`,
`FillPercentage`, `Desaturate`, `CircleMaskDesaturate`, `CircleMaskCooldown`, `Line`, `LineGraph`,
`Gradient`, `TransformMesh`, `UI_Brightness`. Bootstrap ships them as 78 chunks under
`assets/shaders/hlsl/ui/`, so an editor can translate the game's own shaders through `hexshade` the
way the material shell does.

### No editor in the client

There is no string or code path for a UI editor or a live reload of UI data. The only editing-shaped
code is the rect inverse above.

## 12 A reference render

A 150-line script placed every element of a scene at its source resolution from the shipped data
alone: the IMAA entry or `AtlasData` rect for each icon, an outline for each text box, ordered by
scene layer and then element layer, with a button's non-default state elements hidden. It
draws the message box, the scoreboard and the item shop recognisably, judged by eye and not yet
against an in-game capture at the same resolution. Two things it cannot know:

- the scoreboard has one player row per team in data (`SB_T1P0`, `SB_T2P0`). The controller clones
  it for the other four players.
- the item shop's search overlay is its own scene, drawn over the shop because the script has no
  notion of which scenes start disabled.

Both are controller behaviour, and an editor preview has to stand in for them.

## 13 Open questions

- Which configuration flag switches each non-mobile variant on (RTL, flipped minimap, Tencent), and
  in what order two switched-on patches apply to one file. The priority sort exists, the values per
  slot were not read.
- `InheritScissoring` reads as the union of the parent's and the child's rect in `0x1413E6100`,
  which is unexpected for a clip rect and wants a second look.
- The layout formula needs a check against in-game captures at three resolutions and two HUD scales
  before an editor relies on it.

Hash contributions this note found, each reproduced under its hash function and present in
`UI.wad.client`: the two page paths in section 3 (XXH64, `hashes.game.txt`) and `AnchorHierarchy`
(FNV-1a, `hashes.bintypes.txt`).

## 14 Combo boxes

A `UiComboBoxDefinition` (class `0xeaf3a43d`) is no element. It names the elements a combo box
builds its list from, each by a bare `hash` rather than a link, and every one lives in the same
scene bin. Fifteen ship, all in `UI.wad.client`, across eleven scene bins: the LoL and TFT options,
the TFT loadouts and teams, the item shop and Jade's, the replay camera controls and the esports
broadcast HUD.

| Field                          | Target                                                              |
| ------------------------------ | ------------------------------------------------------------------- |
| `buttonDefinition`             | `UiElementGroupButtonData`, the box a click opens and closes        |
| `DropdownBackdropElementData`  | icon behind the list, authored for one row                          |
| `ListOptionHitAreaElementData` | region every row is cloned from, whose height is the row's          |
| `ListOptionTextElementData`    | text every row's label is cloned from                               |
| `DropdownHoverElementData`     | icon on the row under the pointer                                   |
| `SelectedHighlightElementData` | icon on the selected row: a full-row bar, or a check at its end     |
| `ListDisplayDirection`         | `u8`, 1 opens the list upward, absent (0) downward                  |
| `DropdownDisplayTraKey`        | the closed box's label, `@Name@` standing for the selected option   |
| `SoundEvents`                  | `UiComboBoxSoundEvents`, whose `OnSelectionEvent` a selection plays |

The backdrop starts at the button's bottom edge, one row tall plus padding. `ListDisplayDirection`
is 1 only on the two replay camera boxes, whose backdrop sits above the button. The controller
fills the options at run time. An options menu row names a combo box as its template and carries
its own `OptionItemDropdownItem` list, and every other owner fills them in code.

What the client does with one (16.17.8057408):

- The constructor (`0x140E1A6F0`) hides every part, the button included, until its owner shows
  it. A second combo box on one definition clones the parts under a `_uicb%08x` prefix.
- The button's click (`0x140E2D0B0`) toggles the list. Opening (`0x140E3ED70`) shows the backdrop
  and every row, and the highlight where an option is selected.
- `SetOptions` (`0x140E36350`) clones the text and hit-area templates once per option as
  `<prefix>_lo<i>`, row `i` at `pos.y + i * rowHeight * dir`, where the row height is the hit
  area's. The templates never show. Upward, row `i` holds option `N-1-i`, so option 0 stays on top.
- The backdrop (`0x140E38940`) grows by `(N - 1) * rowHeight`, its bottom edge downward and its
  top edge upward.
- Hover (`0x140E31430`) moves the hover icon onto the row and shows it. Leaving hides it.
- A row's click (`0x140E33C50`) selects its option, closes the list, plays the sound and tells the
  owner. `SetSelected` (`0x140E3ABD0`) moves the highlight and sets the button's text to the label
  key's string with `@Name@` replaced, else to the option itself.
- A primary click outside the button and the backdrop, any other button and the wheel close the
  list. Nothing caps or scrolls it, and it takes no keys.

## 15 Buttons

A `UiElementGroupButtonData` (`0x25e82b58`) is a group with eight states, each a
`UiElementGroupButtonState` of a `DisplayElementList` and a `TextElement` and `TextFrameElement`
link, beside a `HitRegionElement`, a `ClickReleaseParticleElement`, `SoundEvents`, three tooltip
keys and the flags `IsActive` (default true), `IsEnabled`, `IsSelected` and `IsFocusable`. A state
the file does not write is an empty list. All 2,287 shipped buttons name a hit region.

What the client does with one (16.17.8057408):

- Linking (`0x1413BFCB0`) resolves the hit region and every state's elements among the group's own
  children, and registers the button for down, up, click, roll-over and roll-out on the hit region.
- The state (`0x1413E6860`): inactive draws `InactiveStateElements`, or
  `InactiveSelectedStateElements` when selected, whatever the pointer does. Active draws
  `ClickedStateElements` while pressed, else `HoverStateElements` while hovered or focused, else
  `DefaultStateElements`, and a selected button the `Selected` form of each. Pressed wins over hover.
- A state switch (`0x1413DE780`) hides an element of the old state's list only where the new list
  lacks it, and hides the old `TextElement` and `TextFrameElement` before showing the new ones.
  Elements in no state list are left alone.
- `IsEnabled` is the button's show and hide: enabling shows every child, then hides the click
  particle and every state, then shows the current state. A button the file leaves disabled stays
  hidden until its owner enables it.
- A click never changes `IsSelected`. Only the owner's `SetSelected` (`0x1413DD460`) does. A click
  on an active button restarts the click particle and tells the owner.
- Each pointer event plays its `UiElementGroupButtonSoundEvents` string: `RollOverEvent`,
  `RollOutEvent`, `MouseDownEvent`, `MouseUpEvent`, and their `Selected` and `OnInactive` forms.

## 16 Meters

A `UiElementGroupMeterData` (`0x828bfdbd`) is a group whose `BarElements` the fill cuts, with a
`FillDirection` (u8), a `StartPercentage` (f32, default 0), an `IsEnabled` (default true) and an
optional `TipStyle`. The tip styles are `BarExtensionTipStyle`, `DoubleSidedTipStyle` and
`GlowCenteredOverlayTipStyle`, all with `DirectionalTipElements`. The double-sided one adds
`ReverseDirectionalTipElements` and a `Sliver` link, and the glow one an unnamed f32 `0xcc4c6d1d`
(default 0.5). 53 meters ship in the UI and Bootstrap archives. Every bar and tip is one of the
meter's own `Elements`, a bar is an icon or an animation effect, `FillDirection` is 0 or 1, and 29
meters have no tip.

What the client does with one (16.17.8057408):

- Linking (`0x1413C0280`) copies the direction, the tip kind, the glow factor, the start and the
  enabled flag, and resolves the bars and tips.
- `SetPercentage` (`0x1413DB8E0`) applies a fill as soon as it changes, with no easing. The start
  fill is the first one, applied on the first update after linking.
- Each bar takes a crop `[L, R]` (`0x1413DE3D0`), where direction 0 sets `R` to the fill and keeps
  the left edge, and direction 1 sets `L` and keeps the right. Any other direction cuts nothing.
  The rect always shrinks, `x0' = (1-L)x1 + Lx0` and `x1' = (1-R)x0 + Rx1` (`0x1413B2860`). The
  UVs follow only on an element with `PerPixelUvsX`, `u0' = u1 - (u1-u0)L` and
  `u1' = u0 + (u1-u0)R` (`0x1413B1690`), and without it the whole sprite squashes into the shorter
  rect. A crop clamps to 0 to 1.
- `IsEnabled` is the meter's show and hide (`0x1413DA570`).
- A tip moves along X only (`0x1413ADB80`), and `E` is the fill's edge.
  - A bar extension's tip sits just past `E`, and the bar fills `p - w`, where `w` is the tip's
    width over the bar's, so bar and tip together span the fill. Below `w` the bar is empty and
    the tip is cut to `p / w`.
  - A glow tip leaves the bar at `p` and puts its cut left edge at `E - f * width * L`, where `f`
    is the glow factor. 0.5 centres it on the edge. Below `w` it is cut to `p / w`.
  - A double-sided meter hides both caps and fills nothing below a threshold, showing only its
    sliver above zero. Past it the caps show and the leading tip sits past the bar's edge, while
    the reverse cap and the sliver keep their authored places. All four shipped ones are progress
    bars with a left cap, the bar and a right tip, so the preview spans the fill across all three
    and takes the two caps' share as the threshold. The client's own threshold (`0x1413AFAE0`)
    adds a pixel width to a ratio, so this reading is the intent and not the arithmetic.

## 17 Tooltips

The game's hover tooltip is a scene the client builds by hand from one string, and its data holds
only the parts. Shipped data below was read on 2026-10-01 from content
`16.19.8230722+branch.releases-16-19.content.release` with `bin-grep`, league-toolkit's
`bin_to_rito` example and the `en_US` string table.

### The data

Three views carry a `TooltipViewController` (`0xb3a16a85`): `LoLCommon/UX/Tooltips`,
`TFTCommon/UX/Tooltips` and `TFTCommon/UX/Tooltips_Mobile`. Its fields, at their offsets in the
1,408-byte controller (registration `0x14019D5F0`):

| field                                  | offset | value                                                            |
| -------------------------------------- | -----: | ---------------------------------------------------------------- |
| `DefaultAdjustments`                   |    360 | `PerLocaleTooltipAdjustments`                                    |
| `PerLocaleAdjustments`                 |    392 | map from a locale (`ko_kr`, `ja_jp`, …) to the same struct       |
| `TooltipPopupDelayTime`                |    492 | 0.3 in all three                                                 |
| `TooltipPopupTimeout`                  |    496 | 0.3 in all three                                                 |
| `0xf0ae6ff1` (`TooltipViewData` embed) |    624 | the parts, below                                                 |
| `0x7c7147eb` (u32, default 1)          |  1,376 | how many tooltips show at once, 2 in both TFT views, 1 in LoL    |
| `0xf5f250a8`                           |  1,384 | map from a hash to adjustment overrides, keyed by run-time state |

`TooltipViewData` (registration `0x140DD60F0`) names every part by a bare `hash`, in this order:
`Scene`, then the ten `IconElement`, `IconOverlayElement`, `TitleLeftElement`,
`TitleRightElement`, `SubtitleLeftElement`, `SubtitleRightElement`, `MainTextElement`,
`PostScriptTitleElement`, `PostScriptLeftElement` and `PostScriptRightElement`, then the images
`Backdrop`, `HrTop`, `HrBottom`, `HrTopSubScene`, `HrBottomSubScene` and `Caret`, then the regions
`CaretOffset` and `ClickAbsorbingRegionElement`. Older builds held the same fields on the controller
itself, up to 6897804.

`PerLocaleTooltipAdjustments` (`0x9e5aed77`, registration `0x14019B6C0`) is 28 bytes of pixel
nudges: an unnamed bool `0x8b64dacd` (default true) at 0, then the i32 `TitleYAdjustment`,
`TopHrYPreAdjustment`, `TopHrYPostAdjustment`, `BottomHrYPreAdjustment`,
`BottomHrYPostAdjustment` and `BottomYPaddingAdjustment` at 4 to 24. The LoL controller overrides
them for 18 locales and both TFT controllers for 9. Chinese, Korean, Thai and Vietnamese add 7 to
9 px before each line.

The scene's rects are not where the parts end up. In `TFTCommon/UX/Tooltips/UIBase` at 1600 x 1200:

| part, under `TooltipHTML_`          | position | size      |
| ----------------------------------- | -------- | --------- |
| `TitleLeft`, `TitleRight`           | 12, 16   | 770 x 34  |
| `SubtitleLeft`, `SubtitleRight`     | 12, 10   | 770 x 40  |
| `MainText`                          | 12, 19   | 770 x 563 |
| `PostScriptTitle`                   | 12, 12   | 770 x 588 |
| `PostScriptLeft`, `PostScriptRight` | 12, 12   | 770 x 38  |
| `Icon`, `IconOverlay`               | 12, 12   | 85 x 85   |
| `Caret`                             | 12, 12   | 34 x 17   |
| `TooltipHTMLHr0` to `Hr3`           | 10, 0    | 4 x 3     |
| `TooltipHTMLBackground`             | 0, 0     | 4 x 4     |

X is the inner padding, Y the gap below the row above, and 770 the wrap width. `HrTop` is `Hr0`,
`HrBottom` `Hr1`, `HrTopSubScene` `Hr2` and `HrBottomSubScene` `Hr3`. Every text links
`CSSSheet 0x9c87124a`, whose 427 styles include one per section name (`titleLeft`, `mainText`,
`postScriptRight`, `infoArea`, …), the keyword styles (`magicDamage`, `scaleAP`, `passive`,
`rules`, `flavorText`, …) and the inline icons (`cooldown`, `goldCoins`, `leftArrow`,
`rightArrow`, …).

### The string

A tooltip's content is one string of sections:

```
<titleLeft>[@Hotkey@]&nbsp;Orb of Deception</titleLeft><titleRight>@Cooldown@s %i:cooldown%</titleRight>
<subtitleLeft>@SpellTags@</subtitleLeft><subtitleRight>@Cost@ @AbilityResourceName@</subtitleRight>
<mainText>Ahri throws then pulls back her orb, dealing <magicDamage>@TotalDamage@ magic damage</magicDamage> …</mainText>
```

That one is `generatedtip_spell_ahriq_tooltip`, line breaks added. The game builds most of these
from a `TooltipFormat` (`0xb27d5b93`, 72 shipped, 35 in `UI.wad.client`), whose `mOutputStrings`
map an output name to a template key. `Spell`'s `Tooltip` is `Template_Spell_Tooltip`, the same
five sections over `@keyHotkey@`, `@keyName@`, `@keyCooldown@`, `@SpellTags@`, `@keyCost@` and
`@keyTooltip@`. A template's `@key…@` names one of `mInputLocKeysWithDefaults`, a string key, and
`{{ Key }}` includes another string (`Item_Gold_Value` is `%i:goldCoins% <gold>@Value@</gold>`).
The object tooltips (`game_ObjectTooltips_[Turret]_EnemyTooltip` and the rest the client names)
are finished strings with no variables.

A value token is `@[spell.Script:]Name[.precision][*factor]@`. `spell.Script:` reads the value
from the character's `SpellObject` whose `mScriptName` is `Script`, `.N` shows `N` decimals
(`-1` keeps the value's own) and `*factor` scales it. `Name` is, in order, a spell stat
(`Cooldown`, `Cost`, `AmmoRechargeTime`, `MaxAmmo`, each with its class default where the spell
leaves it out, `cooldownTime` 10), an `mSpellCalculations` entry, a `DataValues` name or
`EffectNAmount`. `@f1@` and its kin are set by the spell's script as it runs, so no data holds
them. Across all 174 champions of 16.17, 863 of 865 ability tooltips fill from data alone.

A calculation is a `GameCalculation` (formula parts, `mMultiplier`, `mDisplayAsPercent`,
`mPrecision`), a `GameCalculationModified` (another times a multiplier) or a
`GameCalculationConditional` (`mDefaultGameCalculation` where its requirements are unmet). Four
part classes the tables do not name read data values: `0x4ce08984` and `0xb22609db` grow
`0x91d404a5` by level, `0xee18a47b` interpolates `StartDataValue` to `EndDataValue`, and
`0x9e9e2e5c` reads `DataValue` off the spell `SourceObject`. A part naming a data value the spell
lacks reads 0, which is how a mode-only value such as Nidalee's `ModesBonusMaxTraps` reads outside
its mode.

How a calculation writes is its `mSimpleTooltipCalculationDisplay`, else the
`GlobalStatsUIData` (`0x42e2a2c6`) `mTooltipCalculationExpansion`, 6. The client's switch over it
(`sub_140593640` in 16.17) writes 5 as the number alone and 6 as the total with each part that
scales with a stat after it. The preview writes each such part through `mNumberStyleBonus`,
`@OpeningTag@(+@Value@@Icon@)@ClosingTag@`, as `<scaleAD>(+0.4&nbsp;%i:scaleAD%)</scaleAD>`: the
coefficient, and the stat's `StatUIData` icon and scaling tag. That matches the shipped client's
look but not a disassembly of mode 6's part text, which reads each part's `mScalingTagKey`.

A `CSSSheet` packs its icons into atlas pages: `UX/Fonts/CSS/StyleSheet`'s `scaleAD` names
`assets/ux/fonts/texticons/lol/statsicon/scalead.png`, which no archive ships, and the sheet's
`PathHashToSelf` (`ux/fonts/css/stylesheet`) is an IMAA manifest placing it on
`uiautoatlas/ux/fonts/css/stylesheet/atlas_0.tex`.

### What the client does with it

Read in the same 16.17.8057408 build as section 11.

- **Setup.** The controller's slot 5 (`0x140DFB3C0`) builds one tooltip object (`0x4C8` bytes,
  constructor `0x140DD9DD0`) per `0x7c7147eb`, and `0x140DFAD40` clones the scene and every part
  into it, the scene under a suffix from the second on. Each text and the icon keep their authored
  position (`0x140DF2770`).
- **Show.** The global tooltip service (the interface at controller `+336`, plain string entry
  `0x140E0BB40`) fills a content record (`0x140DD9C90`) and calls `0x140E0B7E0`, which splits,
  fills, lays out and places the first tooltip, and hides the others.
- **Split** (`0x140DE42D0`). The string is cut at each top-level `<tag>…</tag>` into `titleLeft`,
  `titleRight`, `subtitleLeft`, `subtitleRight`, `mainText`, `postScriptTitle`, `postScriptLeft`
  and `postScriptRight`, with `infoArea` an alias of the last. A section keeps its own tags.
  Text outside them, or inside a tag of another name, joins `mainText`.
- **Clean** (`0x140DE31F0`, per section). The section tags come off, tabs become spaces, `<hr>`
  with any `<br>` beside it becomes `<br><br>`, and `->` and `<-` become `%i:rightArrow%` and
  `%i:leftArrow%`. Two more passes (`0x140E03050`, `0x140E02670`) were not read. A non-empty
  section is wrapped again in its own tag, so the sheet styles it by the section's name, and an
  empty one is cleared.
- **Fill** (`0x140E019E0`). Each text takes its section and shows only when it is non-empty. The
  icon and the overlay take the record's two textures and show only when set. `HrTop` shows when
  the icon, a title or a subtitle shows and so does the main text, `HrBottom` when a postscript
  part shows and so does the main text. The two sub-scene lines follow the record's two optional
  sub-scenes.
- **Stack** (`0x140E10180`). Top to bottom, from `y = 0`:
  1. a header sub-scene and its line `HrTopSubScene`, when the record has one, then
     `TopHrYPostAdjustment`
  2. the icon at its authored offset
  3. the title row at `y + TitleYAdjustment`
  4. the subtitle row, and `y` becomes the lower of its bottom and the icon's
  5. `HrTop`, with `TopHrYPreAdjustment` before it unless the icon shows and the unnamed bool is
     set, and `TopHrYPostAdjustment` after
  6. `MainText`
  7. `HrBottom`, between `BottomHrYPreAdjustment` and `BottomHrYPostAdjustment`
  8. `PostScriptTitle`, then the postscript row
  9. a footer sub-scene with its line, when the record has one

  A row (`0x140E10860`) puts its left text at its authored offset, moved right by the icon's width
  where the icon shows, and its right text at its authored offset, moved right by any overlap with
  the left. A right-aligned left text swaps the two. Each part's top is the running `y` plus its
  authored Y, and the next row starts at this row's bottom _(inferred: the decompiler lost the
  returned value)_. Every adjustment is divided by an integer the render settings return
  _(inferred to be the UI scale)_.

- **Fit and place** (`0x140E10BA0`, `0x140E01F10`). The bounds (`0x140DE0CF0`) are the union of the
  icon, the eight texts as laid out and the sub-scenes, with `BottomYPaddingAdjustment` added to
  the bottom and the icon's bottom as a floor. A text adds its position plus the measured size its
  slot keeps at `+24` and `+28`, not its authored box, so the tooltip is as wide as its widest text
  and no wider than 770. The backdrop and the click region take that size, through a callback at
  controller `+568` that was not read, so whatever inset it adds on the right and bottom is
  unknown.
  The tooltip is the backdrop plus the caret less `CaretOffset` tall, goes beside, above, below or
  centred on its anchor by a placement mode, flips side when it would leave the screen, and is kept
  8 px inside it (controller `+1400`). A second tooltip stacks 2 px below the first (`+1380`). How
  the lines take the backdrop's width and how the caret flips (`0x140E07180`) were not read.

### What a preview needs

Atlas draws the parts where the file puts them, so every text sits near the scene's top-left over
a 4 x 4 backdrop and reads as its name. A preview that looks like the game needs a sample string
in the format above, the split, clean, fill and stack steps, a measured height per text, and the
backdrop fitted to the result. `generatedtip_spell_ahriq_tooltip` with its values filled matches
the Ahri sample loadout, and the object tooltips need no values at all.

Atlas does this in `engine/model/tooltip.ts` while sample content draws, with the sample chosen in
a row over the canvas. The samples are the passive and abilities of any character under
`Characters/`, each composed the way the client composes it (`crates/atlas/src/spell_tooltip.rs`):
the `Tooltip` output of its `TooltipFormat` with each `@key…@` in place of the text of the spell's
`mLocKeys` entry or the format's default, each `{{ }}` expanded, and each value read from the
spell at rank 1, a calculation with every stat at 0. A character with no ability tooltips leaves
the tooltip as the file places it. It mirrors the texts' left inset on the right and bottom of
the backdrop, which is a guess until the callback above is read, and leaves the caret off, since a
preview has no anchor for it to point at.
