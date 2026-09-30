# Atlas, the UI editor

> Status: phases 1 to 3 built (2026-09-29), less icon materials, the capture comparison and
> dropping an element into another group. Phase 4 built (2026-09-30), less listing a manifest's
> unused entries and the in-game check. Phase 3 builds on `ltk_game_data`'s `PTCH` targets
> (league-mod ADR-0035), released in 0.8.0.
> The evidence is `docs/research/ui-data-layout.md`, read against the installed 16.19 client and
> the tree at `e18e3beb`. Section 9 lists the decisions still open.

Atlas is the workshop's editor for the game's UI: the engine that lays out and draws a UI view, and
the canvas, panes and tools around it. It does for `UI.wad.client` what the VFX shell does for a
`VfxSystemDefinitionData`. An author opens a view controller, sees its scenes drawn at a chosen
screen size, and moves, resizes, re-anchors, re-skins and adds elements the way a design tool
works, with every change written as ordinary bin edits.

**On the name.** The game uses "atlas" for a packed texture (`uiautoatlas`, `AtlasData`). In this
plan and in the code, **Atlas** is the editor. The texture is always a **page** (an auto-packed
`atlas_<n>.tex`) or a **sheet** (a hand-made atlas texture such as `clarity_hudatlas.tex`), and a
region of either is a **sprite**. Code under `atlas/` never uses the bare word for a texture.

## 1 What Atlas opens

The unit is a **view**: one view controller object and everything its loadables name. The
controller is the right unit because it is what the game loads as one piece, and it owns every file
a change can touch:

| part                   | where it lives                                               |
| ---------------------- | ------------------------------------------------------------ |
| the controller         | an object in the root bin `<clientstate>.<name>.bin`         |
| base scene bin         | `<folder>/uibase`, a `PROP` with no extension                |
| variant scene bins     | `<folder>/uimobile`, `uitablet`, …, most of them `PTCH`      |
| sprite manifest        | `<folder>`, the IMAA file                                    |
| pages                  | `uiautoatlas/<folder>/atlas_<n>.tex`                         |
| sheets, fonts, effects | anywhere in `UI.wad.client`, found through the scene's links |

`<folder>` is the path `PathHashToSelf` hashes. A view opens from its controller object in the
objects browser, from a root bin, from a scene bin (which resolves to its controller through the
path), or from the list of views a client state loads.

Atlas vocabulary, and the game class under each word:

| Atlas word  | game data                                                               |
| ----------- | ----------------------------------------------------------------------- |
| view        | a `ViewController` subclass and its loadables                           |
| scene       | `UISceneData`, a layer of the tree with a `Layer` and `Enabled`         |
| element     | a `UiElementIData`: icon, text, region, group, button, effect, …        |
| variant     | a `UiPropertyOverrideLoadable` in a named slot (mobile, tablet, rtl, …) |
| frame       | the source resolution an element's rect is authored in                  |
| sprite      | an IMAA entry or an `AtlasData` rect                                    |
| page, sheet | an auto-packed texture, a hand-made atlas texture                       |

## 2 Where it sits in the workshop

The VFX editor is a class view whose layout names a shell (`vfxLayout` in
`src/modules/workshop/bin/classes/utils/classLayouts.ts`, drawn by `VfxShell` in
`bin/classes/components/ClassFrames.tsx`). Atlas takes the same seat:

- **A shell kind.** `ShellKind` gains `"atlas"` in `bin/shell/utils/shellPanes.ts`, with its pane
  ids, default split tree and title map. `ShellPaneTree`, the pane portals and `.ltk/editor.json`
  persistence come unchanged.
- **A layout per controller class, matched by base class.** `LAYOUTS` is keyed on the exact class
  hash and lists every subclass by hand. There are 154 named controller subclasses, so the layout
  lookup has to fall back along the class's bases (the meta schema already answers `lineage()`)
  before Atlas can open them all. This is the one change to shared code the shell needs.
- **A read command.** `read_ui_view(document, entry)` does for a view what `read_vfx_system` does
  for a system: follows the loadables through the sandbox, reads the scene bins, the variant files
  and the manifest, and answers one `UiView` model. The engine draws from that model and never
  walks bins itself.
- **Its own crate.** `crates/atlas` holds the view resolver, the IMAA reader and writer, the UI
  programs and the packer, above core and the game crate, as hexshade holds the shaders. The IMAA
  format could move to `league-toolkit` once it is stable, beside `ltk_texture`.
- **Edits through `bin_edit`.** Every change is a `BinEdit` on the scene document it touches. A
  change to several elements is one `EditProperties`, a property edit per element, which records
  one undo step, or in a declared document folds its declarations into one. The 64-edit ceiling
  stays per property, and a group holds up to 512 properties.
- **The open scene bin.** A controller's shell opens its base scene bin and draws the view from
  that open document (`read_ui_view`'s `scene`), so an edit shows before its save. The bin's
  history is lent to the controller's tab, whose undo keys step it before the tab's own.
- **Sandbox.** Atlas reads and writes through the document's sandbox (ADR-0056). In a project, an
  edit to a game scene bin becomes a declaration over the game's copy (ADR-0042), so a UI mod ships
  only what it changed and survives the game adding elements to the same scene.
- **Variants.** A drawn variant opens as a declared variant document: the base with the project's
  declarations of the base, and the variant's `PTCH` with the project's declarations of the variant
  laid over it. An edit made over it lands in a `target` module of the variant chunk, and the build
  lowers each key to one record of the variant (league-mod ADR-0035).

## 3 The engine

The engine is frontend code under `src/modules/workshop/bin/atlas/engine/`, split like the VFX
engine into a model, a solver, a renderer and the interaction layer.

### Model

A tree rebuilt from `UiView` on every read: scenes through `ParentScene`, elements through `Scene`,
group children through `Elements`. Each node keeps its wire address (entry hash and property path,
ADR-0027) so any value on screen maps to the edit that changes it. Variants are layers over the base
model: the active variant's patch records and replacement objects apply on top, and each value
records which layer it came from so the inspector can mark it.

### Layout solver

A pure function from a node, a screen size, a HUD scale and a safe zone to a screen rect. It ports
the client's formula (research section 11: scale by `screenH / SH` times the HUD scale about the
anchor, aspect-corrected on X, anchor placed in the safe zone, snapped to whole pixels) and is
tested against in-game captures of the same view at 1280 x 720, 1920 x 1080, 2560 x 1440 and
3440 x 1440, at the smallest and largest HUD scale. `AnchorHierarchy` solves against the parent's
rect, so the solver runs top-down over the tree rather than per element. The inverse
matters as much as the forward pass: a drag produces a screen delta, and the solver turns it back
into `UIRect.Position` in the element's own frame, keeping its anchor. Changing an anchor re-solves
the position so the element does not move on screen.

### Renderer

The renderer, text included, is its own plan: `docs/plans/atlas-renderer.md`. In short, three.js
on the shared renderer draws each element with the game's own UI and font shaders in the client's
vertex format, into a render target of the chosen screen size that the canvas shows under pan and
zoom. UI particles and every other HUD-layer system draw through the VFX renderer under one HUD
camera. Selection handles, rulers, guides and labels draw as DOM and SVG over the canvas, as the
curve panel and the timeline already do, so they stay crisp at every zoom and take pointer events
normally.

### Interaction

What a design tool is expected to do, each mapped to the edit it writes:

| gesture                        | edit                                                   |
| ------------------------------ | ------------------------------------------------------ |
| move, nudge, align, distribute | `Position.UIRect.Position`                             |
| resize from a handle           | `Position.UIRect.Position` and `Position.UIRect.Size`  |
| drag the anchor pin            | `Position.Anchors` (and position, so nothing moves)    |
| reorder in the layers pane     | `Layer` of the element or scene                        |
| drop into another scene        | `Scene`, and `Elements` of the old and new group       |
| drop a sprite on an icon       | `TextureData`                                          |
| duplicate, delete              | object create and remove through the declared document |

Snapping goes to the pixel grid of the frame, to sibling edges and centres, to the parent group
and to the screen and safe zone edges. Hide and lock are view state and never written. Zoom, pan,
marquee and multi-select work like any canvas tool.

As built, a move or a resize writes the change of each edge through the inverse of the rect solve:
the solve is linear on each axis, so the parent, the safe zone's corner and any layout offset
cancel out of the difference, and a stretched hierarchy axis moves its margins. A group moves with
everything under it, a child a hierarchy anchor places follows its parent unwritten, and a child a
managed layout places moves only with its layout. A re-anchor from the inspector's grid keeps the
element where it is on the screen. The keys are the arrows to nudge by a source pixel, and the
brackets to step the draw order.

## 4 Panes

`SHELL_PANES.atlas`, in the order the Panes menu lists them:

| pane      | what it holds                                                                         |
| --------- | ------------------------------------------------------------------------------------- |
| canvas    | the view at a chosen screen size, with the frame, safe zone and handles               |
| layers    | the scene and element tree, with visibility, lock, scene `Enabled` and layer order    |
| inspector | the selection's scene, layer, anchor, rect and look, then every field the file writes |
| sprites   | the view's manifest and pages, the sheets its elements use, and imported images       |
| variants  | base and every variant slot, the drawn one's records by element, and which PC applies |
| timeline  | scene transitions and `Sequence` actions (phase 5, reusing the timeline pane)         |

The canvas header holds the screen presets (16:9 at three sizes, 16:10, 21:9, 4:3), a HUD scale
slider from 0.66 to 1.0 as the client clamps it, and the safe zone toggle. The PC client never
applies a `uimobile` or `uitablet` patch (research section 11), so the variants pane marks those
slots as not on PC, and the canvas previews them without taking edits. The drawn variant is the
one edits write into, and the layers pane marks the elements it changes.

The layers and sprites panes each carry a search box and take the keyboard the way the map
outliner does, since a view such as the item shop holds two thousand elements. The inspector's
sections fold on their titles and stay folded across selections, and the canvas status strip lists
the canvas and preview keys.

## 5 Sprites and the pack

An element reaches its image one of two ways (research section 5), and Atlas treats them
differently.

**Reading.** The sprites pane lists every IMAA entry with its source name, page and rect, and every
`AtlasData` rect with its sheet. Selecting an element highlights its sprite, and selecting a sprite
lists the elements that use it.

**Adding an image.** An author imports a PNG. The default route is a **sheet the mod owns**: Atlas
packs the project's imported images into `assets/ux/<project>/<view>.tex` and points the element at
it with `AtlasData` and a pixel rect. The client already reads that shape for 9,005 references, it
touches no game page, it survives a patch that repacks the game's pages, and two mods that change
the same view do not collide over one page.

The other route, not offered (decision 9.4), repacks the controller's own pages: add the image as a `LooseUiTextureData`,
re-pack every sprite of the view, and write new pages and a new manifest. It reproduces the game's
own shape exactly, but a mod then replaces all pages and the manifest of that view, so it breaks on
the next patch that adds a sprite and conflicts with any other mod on the same view. Were it ever
offered, a written manifest would keep its entries sorted by key, because the client
binary-searches it.

There is no third route. The client never reads a loose file for a `TextureName` (research section
11), so an image a mod adds reaches the screen through a sheet or through a repacked page. The
lookup also searches every loaded manifest and caches the first hit by hash, so a second manifest
that repeats a game key does not reliably win. Atlas never writes a key the game's manifests
already hold into a different manifest.

**Replacing pixels.** A HUD reskin changes the pixels of an existing sprite. The new image joins the
mod's sheet and every element drawing the sprite points at it, whether the sprite sat on a page or
on a game sheet, so no file of the game is copied or written (decision 9.4).

**The packer.** It reproduces the game's measured page rules: power-of-two pages up to 2048, 2 px
of padding per sprite with the edge pixels extruded into it, no mipmaps, BC7 for pages with
alpha and BC1 for pages without. Placement is MaxRects, sorted by a stable key so an unchanged input
packs to identical bytes. Encoding is `ltk_texture` with `intel-tex`, already in the build. No rect
packing crate is in the tree, and the algorithm is small enough to own.

**When packing runs.** The project keeps the source PNGs and a pack spec in `.ltk/atlas/<sheet>/`,
outside `content/` so a build never ships them, and every import writes the page into the layer
the document declares into, under the archive folder of the view's own bin. The page is always
derived from the spec and the sources, and never edited by hand. A sprite placed once keeps its
pixel rect for good: a new image fills free space, and the page grows only where it does not fit,
keeping the old page as its top left corner. An element's `AtlasData` names its rect and the
page's size, so a repack that moved sprites would leave every element pointing at the old rects,
including elements of documents that are not open. A replacement the same size as the sprite it
replaces keeps its rect, and any other joins as a new sprite.

**The sprites pane** lists every sprite the view draws by texture: the atlas pages, the game's
sheets and the project's own. A row selects the elements drawing it, and replacing its image
points all of them at the new sprite in one undo step. The inspector's Sprite section does the
same for one element, and the layers pane and the objects browser show an icon's sprite.

## 6 A preview that looks like the game

The data holds only what the controller does not create at run time (research section 12). Atlas
fills the gaps the same way for every view, and never writes any of it:

- **Scene state.** Every scene starts shown, because `Enabled` defaults to false and 614 of 1,018
  scenes leave it for the controller to set at run time. The layers pane marks the scenes the file
  enables and toggles any scene for the preview, so the item shop's search overlay can be hidden.
- **Button and slider state.** A state picker shows default, hover, clicked, selected and inactive,
  drawing only that state's `DisplayElementList`.
- **Meter fill.** A meter draws its `StartPercentage`, or the live progress while sample content
  shows, and a drag in interact mode or the inspector sets one meter's fill (research section 16).
- **Sample content.** Text the controller sets shows a sample of the kind its element's name
  suggests (a timer reads `1:24`, a cost `1,250`), else that name in words. A texture the
  controller sets (a champion icon, an item) shows a checker placeholder.
- **Repetition.** Where a controller clones a template row (the scoreboard's `SB_T1P0`), a per-class
  table says how many copies to draw and how they offset. The table starts with the controllers
  modders touch most and grows with need.
- **Motion.** Transitions, flipbooks and cooldown effects play on a scrub bar. UI particles play
  through the VFX run.

## 7 New UI

An author adds a view the game does not have by creating a `LogicDriverViewController`. It is the
controller class the game itself uses for skin HUD overlays, it needs no client code, and its
scenes and element groups switch on through the material driver tree the VFX graph pane already
edits. A new view is:

- a root bin with the controller, a `UiPropertyLoadable` and the scene bin it names
- an entry in a `ViewControllerList` of the client state root (`gameplay.bin`), declared as an added
  object with a filter (a champion skin, a mode, mobile or not)
- a sheet for its images

Templates in the style of ADR-0058 give a starting point: a panel, a button, a timer bar, a
buff-driven overlay.

## 8 Phases

| phase | delivers                                                                                                             | proves                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1     | renderer tiers 1 to 4 (`docs/plans/atlas-renderer.md`), the layers pane, scene toggles, screen presets. Read-only.   | a view renders as the game does, compared against captures at three sizes |
| 2     | move, resize, anchor, layer and re-parent edits, snapping, multi-select, undo                                        | the edit mapping and the inverse solver                                   |
| 3     | the variants pane, and editing inside a variant                                                                      | the variant write path (decision 9.2)                                     |
| 4     | the sprites pane, import to a mod sheet, pixel replace, the packer and encoder                                       | a reskinned HUD in game                                                   |
| 5     | renderer tiers 5 and 6 (text, HUD-layer particles), element templates, new views, the timeline and driver conditions | a new skin overlay built from nothing                                     |

Out of scope: Spine skeletons (the client runs them through the official Spine C++ runtime, and
Atlas draws their elements as a placeholder rect), the `UiComponent` binding system, and anything a
controller does in code.

## 9 Decisions this plan needs

1. **Layout lookup by base class.** Taken in phase 1: `classLayout` takes the class's bases from
   the meta schema (`ClassSchema.bases`) and falls back to `BASE_LAYOUTS`, which maps
   `ViewController` to Atlas. Exact layouts still win.
2. **How a variant is written.** Taken in phase 3: an edit made in a variant is a game data
   declaration over the variant chunk, never a `PTCH` a layer ships. `ltk_game_data` takes a
   `PTCH` target and lowers each settled key to one record (league-mod ADR-0035), so a variant
   edit composes with other mods and with the game's later changes to the variant.
3. **Where the sheet lives and who packs it.** Taken in phase 4: the page is
   `assets/ux/<project>/<view>.tex`, the spec and sources sit in `.ltk/atlas/`, and packing runs
   at each import (section 5).
4. **Whether an existing page is ever rewritten.** Taken in phase 4: never. An edited sprite moves
   onto the mod's sheet, and the repack of a view's own pages is not offered.
5. **Renderer.** Moved to `docs/plans/atlas-renderer.md`, section 10.

Research section 13 carries the questions still open about the client. None of them blocks phase 1,
which ports the formula in research section 11 and checks it against captures.
