# Atlas renderer

> Status: tiers 1 to 7 built (2026-09-30), except icon materials, the VFX shell's HUD-layer
> draw and the captures. It is the
> rendering half of `docs/plans/atlas-ui-editor.md`. The evidence is
> `docs/research/ui-data-layout.md`, the tree at `e18e3beb`, the UI and font shaders translated
> through Hexshade on the same day, and the 16.17 client read in IDA. An address below is a
> function in that client. Section 10 lists what this plan needs decided.

The renderer draws a UI view the way the client does: the element tree laid out for one screen
size, each element drawn with the game's own UI shader in the client's vertex format, text through
the game's font shaders, and the particles of the HUD layer where the client puts them. The editor
around it (selection, handles, panes) is the other plan's.

## 1 What the code is

Everything the renderer needs has a working counterpart for materials and particles:

| need                     | what exists                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| translate a game shader  | Hexshade, `ShaderCache::program(ShaderPath::Hlsl { vertex, pixel }, &Defines)`, with the disk cache under `<app data>/shaders` |
| serve a program over IPC | `read_particle_program`, over the closed `ParticleShader` enum of 11 engine pairs in `ltk-manager-game/src/program.rs`         |
| bind it in three         | `createProgramMaterial` and `EngineEnvironment` in `src/modules/viewport/hexshade/`                                            |
| a texture on the GPU     | the `ltk-asset` scheme: RGBA8 decoded in Rust, PNG across, `NoColorSpace` and `flipY = false` for a game shader                |
| a canvas                 | `Viewport` in `src/modules/viewport/scene/`, on one shared WebGL2 renderer lent between viewports                              |
| particles                | `VfxSystem` and its driver, drawn outside the VFX shell by `MapParticles`                                                      |
| strings                  | `lookup_string_values` over `lol.stringtable` (`crates/ltk-manager-core/src/strings.rs`)                                       |

Four things do not fit as they stand:

- **`Viewport` is a 3D stage.** It always mounts `SceneCamera` with its controls, and its children
  must mount `Passes`, which owns the render loop. A 2D canvas cannot turn either off.
- **A second context cannot draw a translated program.** `HandDrawnContext` records that a
  translated program in a canvas beside the viewport's fails its program queries and stops that
  canvas. Atlas has to draw on the shared renderer.
- **`createProgramMaterial` takes a material pass.** Its input is a `SubmeshProgram` with a
  `ResolvedPass`, and a UI program has no pass: its state and constants come from the element.
- **The scheme serves no font.** `PreviewRequest` answers images and buffers, and a request for an
  `.otf` answers 415.

## 2 What the client does

### 2.1 One vertex format

Every UI draw, text excepted, uses one 28-byte vertex (declaration `0x141E88FB8`):

| offset | semantic  | format               | holds                                                                        |
| -----: | --------- | -------------------- | ---------------------------------------------------------------------------- |
|      0 | POSITION  | `R32G32_FLOAT`       | the screen position in 0 to 1, origin top left, y down                       |
|      8 | COLOR0    | `R8G8B8A8_UNORM`     | a `0xAARRGGBB` value, so the bytes are B, G, R, A, which the shader swizzles |
|     12 | TEXCOORD0 | `R32G32B32A32_FLOAT` | `xy` the sprite UV, `zw` the vertex's place in the element rect, 0 to 1      |

A quad is four vertices in the order top left, top right, bottom left, bottom right, and six
16-bit indices `b, b+2, b+1, b+1, b+2, b+3` (`0x1413C33D0`). `UI_ELEMENT_MATRIX` is the scene's
transform times a base matrix with the rows `(2,0,0,0) (0,-2,0,0) (0,0,1,0) (-1,1,0,1)`, which takes
0 to 1 onto clip space with y flipped (`0x1413B8C10`, `0x1413BA6F0`). There is no screen-size
constant.

### 2.2 The programs

`Bootstrap.windows.wad.client` ships the UI programs as 78 chunks under `assets/shaders/hlsl/ui/`
and the font programs under `assets/shaders/hlsl/font/`, one permutation each. Every stage
translates. The client pairs them in its init functions, not by file name, which gives 26 pairs:

| `UiShader`             | vertex                      | pixel                     | draws                                            |
| ---------------------- | --------------------------- | ------------------------- | ------------------------------------------------ |
| `Blend`                | `UI.vs`                     | `UI_Alpha.ps`             | an icon, a slice, `UiElementEffectInstancedData` |
| `Opaque`               | `UI.vs`                     | `UI_Opaque.ps`            | an icon with `UseAlpha` false                    |
| `Copy`                 | `UI.vs`                     | `UI_CopyFromOffscreen.ps` | an offscreen group's composite                   |
| `Cooldown`             | `Cooldown.vs`               | `Cooldown.ps`             | cooldown, pass 0                                 |
| `CooldownLine`         | `CooldownLine.vs`           | `CooldownLine.ps`         | cooldown and circle-mask cooldown, pass 1        |
| `Ammo`                 | `Ammo.vs`                   | `Ammo.ps`                 | ammo, pass 0                                     |
| `AmmoLine`             | `AmmoLine.vs`               | `AmmoLine.ps`             | ammo, pass 1                                     |
| `CircleMaskCooldown`   | `CircleMaskCooldown.vs`     | `CircleMaskCooldown.ps`   | circle-mask cooldown, pass 0                     |
| `CooldownRadial`       | `CooldownRadial.vs`         | `CooldownRadial.ps`       | radial cooldown                                  |
| `CooldownRadialFill`   | `CooldownRadial.vs`         | `CooldownRadialFill.ps`   | radial cooldown with fill                        |
| `ArcFill`              | `ArcFill.vs`                | `ArcFill.ps`              | arc fill                                         |
| `Glow`                 | `Glow.vs`                   | `Glow.ps`                 | glow                                             |
| `GlowConstant`         | `GlowConstant.vs`           | `Glow.ps`                 | constant glow                                    |
| `Animation`            | `Animation.vs`              | `UI_Alpha.ps`             | the flipbook                                     |
| `FillPercentage`       | `FillPercentage.vs`         | `FillPercentage.ps`       | fill percentage                                  |
| `Desaturate`           | `Desaturate.vs`             | `Desaturate.ps`           | desaturate                                       |
| `CircleMaskDesaturate` | `CircleMaskDesaturate.vs`   | `CircleMaskDesaturate.ps` | circle-mask desaturate                           |
| `Line`                 | `Line.vs`                   | `Line.ps`                 | a line                                           |
| `LineGraph`            | `LineGraph.vs`              | `LineGraph.ps`            | a line graph                                     |
| `RotatingIcon`         | `TransformMesh.vs`          | `TransformMesh.ps`        | a rotating icon                                  |
| `GlowingRotatingIcon`  | `TransformMesh.vs`          | `UI_Brightness.ps`        | a glowing rotating icon                          |
| `AnimatedRotatingIcon` | `AnimationTransformMesh.vs` | `TransformMesh.ps`        | an animated rotating icon                        |
| `Gradient`             | `Gradient.vs`               | `Gradient.ps`             | no element class found yet                       |
| `Font`                 | `Font.vs`                   | `Font.ps`                 | a text fill                                      |
| `FontOutline`          | `Font.vs`                   | `FontWithOutline.ps`      | a text outline                                   |
| `FontIcon`             | `Font.vs`                   | `FontIcon.ps`             | an icon inline in text                           |

Every UI program reads two engine blocks, `UIPerPassVS` (`UI_ELEMENT_MATRIX` at 0) and
`UIPerPassPS` (`UI_COLOR` at 0, the scene tint in `rgb` and its opacity in `w`), and the texture
`UI_PRIMARY_TEXTURE_SharedTexture`. An effect adds a `$Globals` block of `params`, `params2`,
`color0`, `color1`, `angleParams`, `animationVSParams`, `fillVSParams`, `glowVSParams`,
`glowPSParams`, `brightnessParams` or `elementTransform`. The font programs read `FontVertexCB`
(`FONT_MATRIX`), `$Globals` (`FONT_COLOR`) and the textures `GLYPH_TEXTURE__TX`,
`OUTLINE_TEXTURE__TX` and `FILL_TEXTURE__TX`.

### 2.3 Blending and colour

| material                 | colour blend                     | alpha blend                |
| ------------------------ | -------------------------------- | -------------------------- |
| `Blend`, `Copy`, effects | `ONE, ONE_MINUS_SRC_ALPHA`       | `ONE, ONE_MINUS_SRC_ALPHA` |
| `Opaque`                 | off                              | off                        |
| fonts (`0x1412623A0`)    | `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` | `ONE, ONE`                 |

The UI blend is premultiplied, and the shaders premultiply: 16 of the 20 UI pixel shaders scale
their colour by the alpha they write, so textures stay straight. The four others: `UI_Opaque`
writes an alpha of one, `Ammo` passes `color0` and `color1` through so they arrive premultiplied,
`AmmoLine` writes solid white, and `Gradient` dithers. Text is straight alpha.

**The UI works in gamma space.** The client's texture-format table holds no sRGB format
(`0x141B6F020`): a BC7 page is created as `BC7_UNORM` and sampled without decoding, whatever the
TEX format's name in `ltk_texture` says. Nothing decodes and nothing encodes.

Alpha comes from three places. An element's alpha replaces the vertex colour's alpha byte
(`0x1413D95D0`). A scene's tint and fade multiply through `UI_COLOR` (`0x1413BA6F0`). A group whose
alpha is below 255, or that has a group material, draws offscreen and composites through `Copy` at
`UI_COLOR = (1, 1, 1, alpha)` (`0x1413B7030`).

### 2.4 The frame is a command list

The client sorts a scene's elements (`0x1413BC8E0`) and builds one command per element
(`0x1413B81E0`): an icon batch, a text, an effect, a particle system or a Spine rig, plus a push and
a pop around each offscreen group. Consecutive icons merge into one batch while they share the
element layer, the texture, `UseAlpha` and the material. Every other element is a draw of its own.
Each command sets its scissor rect, intersected with its scene's when the scene clips
(`0x1413BA6F0`). The rasterizer always has scissor on. There is no stencil and no depth write.

### 2.5 Text

- **Glyphs.** FreeType rasterizes each glyph (`FT_LOAD_RENDER`, `FT_Set_Char_Size` at 96 dpi, so a
  point is 4/3 of a pixel) into 256 x 256 `R8` pages, `GlyphTexture%u`, shelf-packed 1 pixel
  apart (`0x1412557E0`, `0x141260B40`). A glyph's cell is its bitmap padded by `outlineSize` on
  each side. The `_Outline` page holds the same cell dilated in 8 directions out to that size,
  not a stroked copy.
- **Passes.** A text draws its shadow through `Font` in `shadowColor` alone, only where a shadow
  depth is non-zero, then its outline through `FontOutline` in `outlineColor`, only where
  `outlineSize` is non-zero, then its fill through `Font` in `Color` (`0x14125FC30`,
  `0x141260540`). The vertex colour is the markup's in every pass. An inline icon draws through
  `FontIcon`. `glowColor` is never read.
- **Size.** `FontResolutionData` picks the locale's entry, then `en_us`'s. With `autoScale`, the
  size is `fontSize * screenH / screenHeight` of the first entry, and the outline and the shadow
  scale with it, at least a pixel each where they were any. Without, the entry with the nearest
  `screenHeight` applies unscaled (`0x14125AB20`). An outline moves the shadow out by its size.
- **Layout.** `TextAlignmentHorizontal` is left, centre, right per line (swapped under
  `FlipForRTL` in a right-to-left locale). `TextAlignmentVertical` is top, centre, bottom, and one
  line on the bottom edge. A line is `size->metrics.height` tall, and every offset is truncated
  to a pixel (`0x141259F60`, `0x14125CE10`). `WrappingMode` 0 overflows, 1 wraps after the last
  space, 2 wraps then shrinks, 3 truncates each line, 4 truncates with an ellipsis, and 5 shrinks
  one line, the shrink no further than the unnamed `0x24972BB9` (0.7) (`0x141257CA0`).
- **Markup.** `0x14125E3E0` reads the entities `&amp; &gt; &lt; &nbsp; &quot; &zwj; &#37;`,
  `%i:name%` icons from the `CSSSheet`, and a stack of styles: `<b> <i> <u> <s> <a>` set a flag,
  `<font color=#RRGGBB>` the colour, `<br>` and `<hr>` break, `<li>` a bullet, any other tag a
  sheet style, and `</…>` pops one.
- **Fill.** `GameFontDescription.fillTextureName` is a texture the fill samples at `TEXCOORD1`,
  which is how a gradient text is drawn.

### 2.6 The HUD layer

A `VfxSystemDefinitionData` with `drawingLayer` 1 draws with the ordinary particle shaders, blend
states and emitters. Only the projection changes (`0x1412FE760`, `0x1412B6D00`):

```text
layerW   = hudLayerDimension                    default 1024
layerH   = hudLayerDimension / HudLayerAspect   default 768
mProj    = ortho(width  = layerW * (screenW / screenH) / (layerW / layerH) / scale,
                 height = layerH / scale, near -1000, far 1000)
           translated to the system's origin in clip space
vCamera  = (0, 0, 0, 1)
pixels   = units * screenH * scale / layerH
```

Under bit `0x200` of the system's `flags`, the layer takes the owning element's source resolution
in place of `hudLayerDimension` and `HudLayerAspect`.

The origin is one of two things. With `hudAnchorPositionFromWorldProjection` false, it is the
centre of the owning element's rect. With it true (the default), the system's world position is
projected to the screen every frame and its depth dropped, so the effect keeps one size however far
the camera is (`0x1412EBD30`). World-anchored systems are still frustum culled.

A UI element's system (`UiElementParticleSystemData`) takes
`scale = VFXAdjustmentScale * element scale * HUD scale`, and is tinted by the element colour times
the scene colour (`0x1413B8960`). With `RenderAtElementLayer`, it draws inside the UI command list
at the element's place in the sort (`0x1413BAFD0`). Without, it draws in the particle manager's HUD
bucket, and where that falls against the UI was not traced.

Outside the UI archives, 2,775 systems draw on the HUD layer: 2,398 summoner emotes, 194 pings and
objective callouts in map bins, and about 150 champion and skin screen effects. The VFX editor
draws all of them in the world today.

## 3 Decisions

### 3.1 Rust resolves references, TypeScript lays out and draws

The rule of the particle renderer (its decision 2.1). The backend follows every link a view makes
(loadables, scene files, manifests, sheets, fonts, particle systems, variants) and answers one
`UiView` with every asset already an `AssetRef` and every effect's constants already named. It never
computes a screen rect. The solver, the command list and the geometry are TypeScript, because a drag
re-solves on every pointer move.

### 3.2 The game's shaders draw everything, in the client's vertex format

Each command draws with the `UiShader` the client pairs for it (section 2.2), translated by
Hexshade, on geometry in the client's own format: positions in 0 to 1 of the screen, the `BGRA8`
colour, the float4 texture coordinate, and the client's base matrix in `UI_ELEMENT_MATRIX`. Keeping
the client's space means the `Line` effect, which writes clip space directly, and every shader that
reads `TEXCOORD.zw` need no special case.

The programs are a closed enum, `UiShader`, served by a new command in the style of
`read_particle_program`, so the frontend never names a shader path (`docs/plans/hexshade-vfx.md`).
One hand-written pair that reproduces `UI_Alpha` draws while a program loads and where one fails.

### 3.3 The screen is a render target, and the canvas shows it

The view draws into a render target of the chosen screen size, say 1920 x 1080, times a render
scale. The canvas draws that target as one textured quad under the editor's pan and zoom. So:

- the client snaps rects to the screen's whole pixels (research section 11), and the draws keep
  those rects, whatever the scale
- the scale follows the canvas's pixels per screen pixel, the next power of two from 1 within a
  budget of about an 8K frame, so a zoomed-in frame is rasterized at the density it is shown at
  and stays sharp, and a zoom does not reallocate the target at each step
- past the scale, a canvas pixel shows the target texel under it, filtered nearest
- panning and zooming redraw one quad, and the UI redraws only when the model, the screen, the
  preview state or the clock changes

The target is `RGBA8` (not sRGB), premultiplied, cleared to transparent black, and the canvas
composites it over the backdrop with `ONE, ONE_MINUS_SRC_ALPHA`. Every material in the path is a
`RawShaderMaterial`, which three never colour-converts, so the bytes the shaders write are the bytes
the client's gamma-space pipeline writes (section 2.3). The particle renderer lost a power of
brightness through a render target (its decision 2.25) because its stock materials convert, which
none of these do. Tier 3 measures one flat colour through the target to hold that.

### 3.4 A command list runs as a sequence of renders

The frame is the client's command list (section 2.4): a run of UI draws, a particle system, a push
and a pop of an offscreen group, each with its scissor rect. Three cannot change the scissor or the
camera inside one `render` call, so the list runs as a sequence of `renderer.render` calls into the
same target with `autoClear` off, one per run of draws that share a scissor, one per particle
system with its own orthographic camera, and one per offscreen group into a target of its own that
the pop composites through `Copy`.

A run is one `Mesh` per icon batch, text or effect, drawn in list order by `renderOrder`. Icons
batch the way the client merges them (section 2.4): consecutive triangle draws that share the
program, the texture, the blend and the scissor, and that no effect drives, become one draw with
their geometry in list order, so the frame is unchanged. Such a draw writes no constant but its
texture, so every draw of one program, blend and texture shares one material, which the renderer
keeps across command lists and a drag recompiles nothing.

### 3.5 A flat viewport on the shared renderer

`FlatViewport`, beside `Viewport` in `src/modules/viewport/scene/`, takes the shared renderer
through the same lease (`takeSharedRenderer`, `releaseSharedRenderer`), draws in CSS pixels under an
orthographic camera of its own, and mounts no `SceneCamera`, controls, gizmo or `Passes`. Its loop is
`frameloop="demand"`: a change of model, screen, zoom, selection or preview state invalidates one
frame, and a running clock (an effect, a transition, a particle system) holds it at `"always"` until
the clock stops. Pan and zoom are pointer handlers that write a view transform, not three controls.

`SharedRendererClaim` moves out of `Viewport.tsx` beside `sharedRenderer.ts`, so both viewports
claim the renderer through one component.

### 3.6 Textures load as the game stores them

Pages and sheets arrive through the scheme as PNG, `NoColorSpace`, `flipY = false`, no mipmaps,
straight alpha, linear filtering, as `useAssetTextures` already loads for game shaders. A sprite is
a UV rect on its page, never a cropped texture, so a page uploads once however many elements use
it.

### 3.7 Text runs through the game's font programs over glyph pages Atlas builds

Atlas builds glyph pages shaped like the client's (`R8` coverage, a stroked outline page, 256 x 256)
from the game's own font files, and draws each text's shadow, outline and fill through `Font`,
`FontOutline` and `FontIcon`. Line breaking, alignment, the wrapping modes and the markup subset of
section 2.5 are TypeScript over the glyph metrics.

The pages are rasterized in the webview: the font file loads through `FontFace` from the scheme, and
each glyph draws white onto an `OffscreenCanvas` with `fillText`, the outline with `strokeText` at
twice the outline size, and the canvas's alpha becomes the page's coverage. The client rasterizes
with FreeType and the webview on Windows with DirectWrite, so hinting and edge coverage differ at
small sizes. If the captures of tier 5 show that difference, a backend rasterizer replaces the
webview's behind the same page format (section 10, decision 4).

### 3.8 One HUD-layer camera for UI and VFX

Section 2.6's projection is one function, `hudCamera(system, screen, origin, scale)`, answering an
`OrthographicCamera` the existing `VfxSystem` component draws under. Atlas uses it for element
particles, with the element's rect centre as the origin. The VFX editor uses the same function for
any system with `drawingLayer` 1, drawing it over a screen frame instead of in the world. The origin
is the frame's centre, or the projection of the preview rig's position when
`hudAnchorPositionFromWorldProjection` holds.

### 3.9 Hit testing reads the solved rects

Picking, hover and marquee test the solved rects and polygon outlines on the CPU, topmost first, in
the order of the client's input sort. There is no GPU picking pass. A click again on the same spot
picks the next element down the stack under it, a drag where a selected element lies under others
moves the selection, and the canvas menu's Select layer lists the whole stack.

## 4 The backend

### 4.1 The `atlas` crate

```text
crates/atlas/src/
|-- lib.rs        the re-exports
|-- imaa.rs       Manifest: read, write (sorted by key), find
|-- view.rs       resolve_view -> UiView
|-- model.rs      UiView and the types under it, ts-rs and specta under `ts`
|-- looks.rs      each element class's UiLook, and each effect's constants from its fields
|-- program.rs    UiShader, its pairs, read_ui_programs
|-- tests.rs
```

```rust
/// A controller's sprite manifest (research section 6).
pub struct Manifest {
    pub pages: Vec<u64>,
    pub entries: Vec<ManifestEntry>,
}

pub struct ManifestEntry {
    pub key: u64,
    pub uv: [f32; 4],
    pub page: u32,
}

impl Manifest {
    pub fn read(bytes: &[u8]) -> Result<Self, ImaaError>;
    /// Writes the entries sorted by key, which the client binary-searches.
    pub fn write(&self, out: &mut impl Write) -> io::Result<()>;
    pub fn find(&self, key: u64) -> Option<&ManifestEntry>;
}

/// Everything a view's links reach, resolved through the document's sandbox.
pub fn resolve_view(
    document: &BinDocument,
    entry: BinHash,
    assets: &dyn AssetLookup,
    names: &Names,
) -> Result<UiView, UiViewError>;

/// The UI and font programs, one closed variant per pair of section 2.2.
pub enum UiShader { Blend, Opaque, Copy, Cooldown, CooldownLine, /* … */ Font, FontOutline, FontIcon }

pub fn read_ui_programs(
    assets: &dyn AssetLookup,
    shaders: &[UiShader],
    translations: &TranslationCache,
    read: &mut dyn FnMut(&AssetRef) -> AppResult<Vec<u8>>,
) -> Vec<ProgramRead>;
```

`resolve_view` reads the controller, follows `BaseLoadable` and every loadable and override slot,
opens each scene file through `assets` so a project layer's copy wins, loads the manifest at
`PathHashToSelf` and every other manifest one of its keys resolves through, and resolves every
texture, font file and particle system. A reference it cannot resolve is a `UiViewWarning` on the
view, never an error. `read_ui_programs` locates the chunks the way `AssetChunks` does for
particles, so a layer's copy of a shader wins over Bootstrap's.

### 4.2 The view model

One record across IPC, `UiView`:

```text
UiView
  entry, class, folder                  the controller, and the path PathHashToSelf hashes
  files: UiFile[]                       each loadable: role (base, or its slot), asset, document
  scenes: UiScene[]                     key, name, parent, layer, enabled, transitions, clips
  elements: UiElement[]                 key, name, class, scene, layer, enabled, position, look, file
  variants: UiVariant[]                 slot, file, patch records { target, path, value }
  pages: AssetRef[]                     every manifest page a sprite names, by index
  fonts: Record<key, UiFont>            faces per locale (AssetRef), resolution entries, colours, fill texture
  systems: Record<key, UiSystem>        entry, drawingLayer, hudLayerDimension, HudLayerAspect, anchor mode
  warnings: UiViewWarning[]

UiPosition = rect { x, y, w, h, sourceW, sourceH, anchor, flags, min, max }
           | fullScreen
           | polygon { rect, vertices }
UiAnchor   = single { x, y } | double { left, right } | hierarchy { alignX, alignY, margins }

UiLook = icon     { sprite, color, useAlpha, flipX, flipY, perPixelUvs, fill, material? }
       | slice    { sprite, kind: h3 | v3 | nine, us, vs, edges }
       | text     { font, traKey, alignH, alignV, wrap, flipForRtl, color?, outline?, iconScale, styleSheet? }
       | effect   { passes: UiShader[], sprite?, color, flipX, flipY, constants: Record<member, number[]>, live: UiEffectInput? }
       | particle { system, scale, atElementLayer, maxPlays, playDuringTransition }
       | region | scissor { scene } | group { children, alpha, layout? } | spine { skel, atlas }
       | unknown  { class }

UiSprite = { page: AssetRef, uv: [u0, v0, u1, v1], size: [w, h], source: manifest | sheet, name? }
```

An effect's static constants are filled in Rust by section 6's table, so the frontend writes members
by name and knows no effect class. What the client sets at run time (a cooldown's angle, a fill's
percentage, a flipbook's frame) is `live`, the one input the preview scrubs, and the frontend turns
it into constants with the formula the same row names.

### 4.3 Commands and the scheme

| command                                                                     | answers                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------- |
| `read_ui_view(document: BinDocumentId, entry: String)`                      | `UiView`                                        |
| `read_ui_programs(document: Option<BinDocumentId>, shaders: Vec<UiShader>)` | one `ProgramRead` per shader, through the cache |
| `lookup_string_values(keys)`, existing                                      | the strings of the view's `traKey`s             |

Both new commands are `#[specta::specta]` in `src-tauri/src/commands/ui.rs` and join `migrated![]`
in `src-tauri/src/ipc.rs`. The view query is keyed `["ui-view", document, entry]` under a
`DOCUMENT_READS` root in `useBinEdit.ts`. A scene file is a document of its own, so the view lists
its files' document ids and refetches on an edit to any of them.

The scheme gains `?as=font`: an OpenType or TrueType file's own bytes under `font/otf` or
`font/ttf`, and 415 for any other kind. It is not a general raw read.

## 5 The frontend

```text
src/modules/workshop/bin/atlas/
|-- api/          uiQueries: view, programs, strings
|-- engine/       no React, no three
|   |-- model/    the tree from UiView, the variant overlay, the preview state
|   |-- layout/   solve(view, screen) -> Solved, and the inverse
|   |-- commands/ build(view, solved, preview) -> Command[], the sort, the icon merge
|   |-- geometry/ quads, slices, flipbook, line, polygon, in the client's vertex format
|   |-- effects/  live input to constants, one function per row of section 6
|   |-- text/     glyph pages, metrics, line breaking, alignment, markup
|   `-- clock/    effect, transition and flipbook time
|-- rendering/    three
|   |-- components/   AtlasFrame (the target and the command run), FrameComposite
|   `-- utils/        uiEnvironment, uiMaterials, hudCamera, glyphTextures, fallback shaders
|-- canvas/       the DOM overlay (the editor plan's)
|-- hooks/, state/
```

- `engine/layout/solve.ts` ports the client's formula (research section 11) top-down over the tree,
  since `AnchorHierarchy` needs its parent's rect. It runs on a change of model, screen, HUD scale
  or safe zone, never per frame.
- `engine/commands/build.ts` walks the scenes the preview shows, sorts by
  `(scene layer, element layer, file order)`, and emits `Command`s:

  ```ts
  type Command =
    | {
        kind: "draw";
        shader: UiShader;
        texture: TextureKey | null;
        vertices: Float32Array;
        colors: Uint32Array;
        indices: Uint16Array;
        constants: Constants;
        scissor: Rect | null;
        element: string;
      }
    | { kind: "text"; element: string; runs: GlyphRun[]; scissor: Rect | null }
    | {
        kind: "particles";
        element: string;
        system: string;
        origin: Vec2;
        scale: number;
        tint: Rgba;
      }
    | { kind: "push"; group: string; rect: Rect }
    | { kind: "pop"; group: string; alpha: number };
  ```

- `createInlinedProgramMaterial` sits beside `createProgramMaterial` in
  `src/modules/viewport/hexshade/programMaterial.ts`: it takes a `ReadyProgram` alone, declares
  every block of both stages as an array uniform, and makes every member writable by name through
  `writeProgramMember`. So a UI draw writes `UIPerPassVS`, `UIPerPassPS` and `$Globals` the same
  way, with no environment, and `createProgramMaterial` stays as it was for the shells that use it.
- `rendering/utils/uiMaterials.ts` builds one material per command over that core, writes the base
  matrix and `UI_COLOR`, sets section 2.3's blend state, and falls back to a hand-written `UI_Alpha`
  where a program is missing.
- `rendering/utils/hudCamera.ts` is section 3.8's function. It moves to the viewport barrel when
  the VFX shell draws the HUD layer, which waits on decision 10.2.
- `rendering/components/AtlasParticles.tsx` runs each element's system in a scene of its own under
  the HUD camera. The system is found through the object index in the file that declares it, and
  the frame draws the scene at its element's step. The frame target has no depth, so a particle
  material's depth test passes everywhere.

The path for one element:

```text
UiView -> model -> solve(screen) -> rects -> commands -> AtlasFrame renders -> target -> composite -> canvas
                                                  ^
                     UiShader -> read_ui_programs -> RawShaderMaterial
```

A scene starts shown in the preview whatever its `Enabled` says. The field defaults to false, and
614 of 1,018 scenes leave it unset for their controller to switch on at run time, so a preview that
followed the file would draw most views empty. The layers pane toggles any scene, and marks the ones
the file enables.

## 6 What each element draws with

From the client's effect table (`0x1413C93B0` and the functions it names). `d64` is the effect's
field at byte 64 of its data object, the first of its four class floats.

| element                                                                                    | programs                                                      | geometry                                                                 | constants                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiElementIconData`                                                                        | `Blend`, `Opaque` or its material                             | quad, or 3 or 9 quads for a slice                                        | none. `Color` is the vertex colour, the element's alpha its alpha byte                                                                                     |
| `UiElementEffectCooldownData`                                                              | `Cooldown`, then `CooldownLine`                               | quad with UV 0 to 1, and a 3-vertex line strip from top centre to centre | `params.x` the angle, `angleParams = (-sin a, -cos a, 1 / max(abs sin, abs cos), 0)`, `color0`, `color1`                                                   |
| `UiElementEffectAmmoData`                                                                  | `Ammo`, then `AmmoLine`                                       | as cooldown                                                              | as cooldown                                                                                                                                                |
| `UiElementEffectCircleMaskCooldownData`                                                    | `CircleMaskCooldown`, then `CooldownLine`                     | as cooldown                                                              | `angleParams = (-sin a, -cos a, 1, 0)`, `params`, `color0`, `color1`                                                                                       |
| `UiElementEffectCooldownRadialData`                                                        | `CooldownRadial`, or `CooldownRadialFill` with its fill flag  | quad with the sprite's UV                                                | `params`, `color0` from the vertex colour                                                                                                                  |
| `UiElementEffectArcFillData`                                                               | `ArcFill`                                                     | quad with the sprite's UV                                                | `params`, `color0`                                                                                                                                         |
| `UiElementEffectGlowData`                                                                  | `Glow`                                                        | quad                                                                     | `phase = fmod(t, d64) / d64`, `glowVSParams = (centre x, centre y, phase * d72 + d68, 0)`, `glowPSParams.x = sin(2π phase) * (1 - d76) + d76`              |
| `UiElementEffectGlowConstantData`                                                          | `GlowConstant`                                                | quad                                                                     | `glowPSParams = clamp(params.x, d64, d68)`                                                                                                                 |
| `UiElementEffectAnimationData`                                                             | `Animation`                                                   | quad over the sprite's UV, which is the first frame                      | `animationVSParams = (fmod(frame, perRow) * stepU, floor(frame / perRow) * stepV, 0, 0)`, a step being the sprite's UV size plus one texel (`0x1413BE670`) |
| `UiElementEffectFillPercentageData`                                                        | `FillPercentage`                                              | quad                                                                     | `fillVSParams` the frame step, `params.x` the percentage                                                                                                   |
| `UiElementEffectDesaturateData`, `…CircleMaskDesaturateData`                               | `Desaturate`, `CircleMaskDesaturate`                          | quad                                                                     | `params = lerp(d64, d68, params.x)`                                                                                                                        |
| `UiElementEffectLineData`                                                                  | `Line`                                                        | one quad between two points, in clip space                               | `params` the thickness, `params2 = (texture width, length in pixels, 0, 0)`                                                                                |
| `UiElementEffectRotatingIconData`, `…GlowingRotatingIconData`, `…AnimatedRotatingIconData` | `RotatingIcon`, `GlowingRotatingIcon`, `AnimatedRotatingIcon` | quad                                                                     | `elementTransform`, `brightnessParams`: not traced (`0x1413DDC40`, `0x1413DDA90`, `0x1413DD5C0`)                                                           |
| `UiElementEffectInstancedData`                                                             | `Blend`                                                       | `0x1413BECA0`, not traced                                                | none                                                                                                                                                       |
| `UiElementEffectCustomMaterialData`                                                        | its `StaticMaterialDef`                                       | `0x1413BE970`, not traced                                                | the material's own                                                                                                                                         |
| `UiElementTextData`                                                                        | `Font`, `FontOutline`, `FontIcon`                             | one quad per glyph per pass                                              | `FONT_MATRIX`, `FONT_COLOR` per pass                                                                                                                       |
| `UiElementParticleSystemData`                                                              | the system's own                                              | the VFX renderer's                                                       | section 2.6                                                                                                                                                |
| `UiElementRegionData`, `UiElementScissorRegionData`                                        | none                                                          | none, an outline in the editor overlay                                   | none                                                                                                                                                       |
| `UiElementSpineAnimationData`                                                              | out of scope                                                  | a placeholder rect                                                       | none                                                                                                                                                       |

An icon's slice geometry follows `0x1413CEF10` and `0x1413C2C50`: a 3-slice is three quads over
`Us` (four values) and `Vs` (two) with the edge widths in the element's frame, a 9-slice nine quads
row by row, and every quad of a slice carries the whole element rect as its reference, so
`TEXCOORD.zw` runs 0 to 1 over the element. An edge in pixels is `edge * screenH / sourceH * scale`.
`FlipX` swaps `Us` end for end and `FlipY` swaps `Vs`. `FillType` 1 crops the sprite to the
element's aspect, centred, as CSS `cover` does. `PerPixelUvsX` and `Y` crop the sprite by a
run-time fraction rather than squash it, which the preview drives as a live input.

A material on an icon (`UiElementIconData.Material`, 421 icons) replaces `Blend` but keeps the UI
vertex format and the two UI blocks. It reads through `read_material_programs` and binds through the
same core as section 5.

## 7 Verification

No pixel test exists in the repo, and the VFX and material pipelines were checked outside it, in
headless Edge and by eye. Atlas keeps that split: logic in unit tests, pixels against captures.

- **Rust, live.** Behind `LTK_LIVE_GAME`, `resolve_view` over all 300 controllers of the installed
  build answers with no error, and its counts match the research census. `Manifest::read` then
  `write` returns the same bytes for all 235 manifests.
- **Programs.** All 26 pairs of section 2.2 answer `ready`, and each links in the app on the shared
  renderer. A pair the client recombines, such as `GlowConstant.vs` with `Glow.ps`, is proven only
  by that link.
- **TypeScript.** The solver against the formula at four screens and two HUD scales. The geometry
  builders against the client's vertex order and slice layout. The command builder's sort and merge.
  The effect constants against the table of section 6. The text breaker's five wrapping modes.
- **Pixels.** Captures of five views from the game at 1920 x 1080 and 2560 x 1440, at the smallest
  and largest HUD scale: the scoreboard, the item shop, the player frame, the minimap frame and a
  skin overlay. The frame is compared per pixel in a harness outside the repo, as Hexshade's link
  test is. The Python reference render in research section 12 is the first, cruder check.
- **Byte order.** A file writes a colour as the bytes of `0xAARRGGBB`, B first: the fonts named
  `Blue1` and `Gold1` hold `{250, 250, 205}` and `{210, 230, 240}`, the palette's `#CDFAFA` and
  `#F0E6D2`. The resolver answers `r, g, b, a`.

## 8 Tiers

| tier | builds                                                                                                                              | proves                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1    | `ui::imaa`, `resolve_view`, `read_ui_view`, the model types                                                                         | every shipped view resolves, the manifest round-trips                            |
| 2    | `UiShader`, `read_ui_programs`, `createInlinedProgramMaterial`, `uiMaterials`                                                       | 26 of 26 programs link on the shared renderer                                    |
| 3    | `FlatViewport`, `AtlasFrame` and the composite, the solver, the command builder for icons, slices and regions, `Blend` and `Opaque` | a flat colour survives the target, and a view draws as the reference render does |
| 4    | the effects of section 6 with their live inputs, scissor, offscreen groups, icon materials                                          | a cooldown at 0, 25, 50 and 100 percent against a capture                        |
| 5    | text: `?as=font`, glyph pages, the three passes, layout, wrapping, markup, strings                                                  | a text-heavy view against a capture                                              |
| 6    | `hudCamera`, element particles in the command list, and the VFX shell's HUD-layer draw                                              | a skin overlay's particles and a summoner emote on screen                        |
| 7    | icon batching, a draw budget and a frame budget, measured on the largest views                                                      | the item shop at 60 frames a second while editing                                |

Tier 7 measured the six largest views of the installed `UI.wad.client`, every scene and every
disabled element drawn, at 2560 x 1440: the item shop's 681 elements lay out, build and batch in
0.7 ms into 46 draws from 132, and the worst of the six takes 2.0 ms and 269 draws. The budgets are
8 ms for that work, half a frame at 60 a second, and 512 draws a view.
`the_largest_shipped_views_dump_for_the_frame_bench` in `crates/atlas/src/tests.rs` dumps the
views, and `frame.sweep.test.ts` holds each to both budgets with `LTK_VIEW_DUMP` naming the dump.
The draw itself is not measured headless.

Tiers 1 and 2 stand alone and can land before any editor code. Tier 3 is the first one a user
sees, and after it every tier adds what one class of element looks like.

## 9 What stays out

- Spine skeletons. `UiElementSpineAnimationData` draws a placeholder rect. The client runs the
  official Spine C++ runtime, and a Spine runtime for the web is a separate decision.
- The `UiComponent` binding system, and anything a controller computes at run time beyond the live
  inputs of section 4.2.
- `UiPositionPolygon` tessellation, which was not found in the client. A polygon draws as its rect
  until it is.
- The HTML tag parser's full vocabulary. Atlas renders the tags of section 2.5 and shows any other
  tag as text.

## 10 Decisions this plan needs

1. **The shared renderer for a 2D canvas.** `FlatViewport` shares the lease with every 3D viewport,
   so Atlas and a skin preview cannot draw at the same time. The alternative is a second context,
   which the translated programs cannot use (section 1).
2. **Where HUD-layer VFX preview in the VFX shell.** Section 3.8 draws a `drawingLayer` 1 system
   over a screen frame. It changes what the VFX editor shows for 2,775 shipped systems, so it wants
   agreeing with whoever owns that shell.
3. **The render target size.** Section 3.3 uses the chosen screen size. A 3440 x 1440 preset
   allocates about 20 MB per offscreen level, which is fine on a desktop and worth a cap.
4. **The glyph rasterizer.** Section 3.7 rasterizes in the webview. A backend rasterizer (pure Rust
   through `swash`, or FreeType itself) is closer to the client and costs a crate and an IPC path
   for pages. Deciding waits on the tier 5 captures.
