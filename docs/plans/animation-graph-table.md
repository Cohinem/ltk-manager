# Animation graph table

A clip table beside the skin's preview: one row per entry of the graph's `mClipDataMap`, tabs
for the tracks, masks and sync groups the clips key into, a row that plays in the preview and
unfolds to its fields.

The reference is the Character Animation Graph Editor recording read in section 2 of
`docs/research/bin-editor-higher-order-views.md`. The spec row is `AnimationGraphData` in "The
layouts" of `docs/ux/BIN_EDITOR.md`. This plan is the route from the code as it stands to that
row. Each stage stands on its own and leaves the shell usable.

## What the data is

`AnimationGraphData` (`0xf5fb07c7`) holds nine fields. Four are maps keyed by `Hash`:

| Field               | Value                   | What a clip holds of it             |
| ------------------- | ----------------------- | ----------------------------------- |
| `mClipDataMap`      | `Pointer<ClipBaseData>` | the table's rows                    |
| `mTrackDataMap`     | `Embed<TrackData>`      | `mTrackDataName`, a key into it     |
| `mMaskDataMap`      | `Embed<MaskData>`       | `mMaskDataName`, a key into it      |
| `mSyncGroupDataMap` | `Embed<SyncGroupData>`  | `mSyncGroupDataName`, a key into it |

`TrackData` is `mPriority`, `mBlendMode`, `mBlendWeight`. `MaskData` is `mId` and `mWeightList`.
`SyncGroupData` is `mType`. The other five fields are `mBlendDataTable`
(`Map<U64, Pointer<BaseBlendData>>`), `mUseCascadeBlend`, `mCascadeBlendValue`,
`AnimStateGraphEntryClips` and `objectPath`. A `mBlendDataTable` key is two clip name hashes
packed into one `U64`, the clip blended from and the clip blended to, each a key of
`mClipDataMap`.

`ClipBaseData` is an interface with ten concrete kinds. Every kind carries `mFlags`,
`mAnimationInterruptionGroupNames` and `Accessorylist`. The three key fields above and
`mEventDataMap` sit on `BlendableClipData`, which `AtomicClipData` and `ParametricClipData`
derive. `SequencerClipData` carries its own `mEventDataMap`. Only `AtomicClipData` names a file,
through `mAnimationResourceData.mAnimationFilePath`, and a tick rate, through `mTickDuration`.

The kinds and the clips each one names:

| Kind                              | Children                                                 |
| --------------------------------- | -------------------------------------------------------- |
| `AtomicClipData`                  | none                                                     |
| `ParametricClipData`              | `mParametricPairDataList[].mClipName`                    |
| `SelectorClipData`                | `mSelectorPairDataList[].mClipName`, with `mProbability` |
| `ConditionBoolClipData`           | `mTrueConditionClipName`, `mFalseConditionClipName`      |
| `ConditionFloatClipData`          | `mConditionFloatPairDataList[].mClipName`                |
| `SequencerClipData`               | `mClipNameList`                                          |
| `ParallelClipData`                | `mClipNameList`                                          |
| `EventControlledSelectorClipData` | `SelectorPairDataList[].mClipName`, `DefaultClipName`    |
| `StateAnimClipData`               | `ChildClipName`, `Transitions[]`                         |
| `SwitchIntClipData`               | `SwitchIntPairDataList[].mClipName`                      |

Meta as of 16.18. Types are the `meta-cli` skill's answers and drift by patch.

## What the code is

`resolve_clips` in `crates/ltk-manager-core/src/skin/mod.rs` reads `mClipDataMap`, keeps the
atomic clips, and answers `AnimationClip { name, hash, animation }`. `graph_clips` and
`search_linked` find the graph in the open document or breadth first through the files it links,
capped at 32. `read_animation_clips` in `src-tauri/src/commands/skin.rs` is the command over them.

The skin shell holds two panes, `preview` and `inspector` (`shellPanes.ts`, ADR-0036). The clip is
picked in a `Select` in `SkinTransport.tsx`, and `SkinChoice` in `skinChoice.ts` holds `picked`
above the frame. `EmitterTable.tsx` is the table precedent: a `Column` list hashed once, sideways
scroll under a sticky header. `useRowWindow.ts` is the row virtualizer. `useEmitters` in
`emitterChoice.ts` is the precedent for an inspector aimed at a row rather than at the object.

The bin editor is read-only. No patch command exists.

## The decisions

| #   | Question                           | Decision                                                                                                     |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Where the table lives              | One widget. A `clips` pane of the skin shell first, the graph's own layout after                             |
| 2   | Editing                            | Read-only. A cell is a path and a value, per "A cell is a row"                                               |
| 3   | Columns                            | Name with kind, File, Track, Rate, Mask, Sync group, Events. Mask and Sync group only where a clip names one |
| 4   | Non-atomic kinds                   | Flat rows with the kind suffix. Children as chips in the unfolded row                                        |
| 5   | Row detail                         | A caret unfolds the clip's field rows under its row, any number at once                                      |
| 6   | The sibling maps                   | A segmented control in the pane header: Clips, Tracks, Masks, Sync groups                                    |
| 7   | Rate                               | `anm fps / tick fps`, the left half from the `.anm` header                                                   |
| 8   | Backend shape                      | A typed `read_animation_graph` over all four maps, as `read_skin` is typed                                   |
| 9   | Filter                             | A name filter in the pane header. #462 reuses it                                                             |
| 10  | The preview's Show menu            | Out of scope. Skeleton, bone names, bounding box and submesh sets are their own issue                        |
| 11  | Row click and preview              | Row selection is the transport's `picked`. A composite plays what it reaches                                 |
| 12  | The shell tree                     | Preview 3 beside a column of clips over inspector 2                                                          |
| 13  | Inspector while a clip is selected | The inspector keeps the skin's sections. The row itself unfolds                                              |
| 14  | Events                             | A count column. The rows draw in the unfolded row, and the preview plays them, decision 33                   |
| 15  | Rate cost                          | Lazy. One `read_clip_header` per row on screen, cached as a query                                            |
| 16  | Row order                          | By name                                                                                                      |
| 17  | Track, mask, sync group cells      | A chip. A click switches to that tab and marks the row                                                       |
| 18  | Dangling references                | A cell drawn as missing. No Problems rule                                                                    |
| 19  | Tab and filter state               | Ephemeral                                                                                                    |
| 20  | Graph-level fields                 | An Other section of the graph's own layout. Absent from the skin pane                                        |
| 21  | Deliverable                        | This plan, then an EPIC with the stages as children. No ADR                                                  |
| 22  | Saved skin layouts                 | `sanitizeShellLayout` inserts the pane over the inspector's leaf                                             |
| 23  | Kind vocabulary                    | The class name minus `ClipData`: Atomic, Selector, Sequencer                                                 |
| 24  | Command shape                      | `read_animation_graph` replaces `read_animation_clips`                                                       |
| 25  | Plan output                        | `docs/plans/animation-graph-table.md`, uncommitted                                                           |
| 26  | File column                        | One mark with the path on hover, opening the `.anm`. The read's own located asset                            |
| 27  | Unnamed clips                      | The bare hex, dimmed. No `Unnamed` prefix                                                                    |
| 28  | Composite playback                 | Sequencer end to end, any other kind its first child reaching a file, leaf named                             |
| 29  | Masks                              | A row unfolds to its weighed joints by skeleton name. A click weighs it on the model                         |
| 30  | Editing shape                      | Cells edit in place once leaf writing lands: dropdowns, fields, an events sub-table                          |
| 31  | Armature                           | Armature and Names pills in the preview. A picked mask turns the armature on                                 |
| 32  | Parametric clips                   | The library's ruler slider in the transport, a tick per pair value, snapping to the nearest. No blend        |
| 33  | Events in the preview              | Submesh visibility and particle events play on the pass. Other kinds draw nothing                            |
| 34  | Event frames                       | `mTickDuration` seconds a frame, else the `.anm`'s rate, else thirty                                         |
| 35  | Particle event keys                | The skin crosses with its resolver's map, each system with the linked file declaring it                      |
| 36  | Joint names                        | One 2D canvas over the scene, painted per frame. A DOM label per joint lagged                                |
| 37  | Submesh overrides                  | A Submeshes menu in the preview's controls, ticks over the skin and the events, view-held                    |
| 38  | Ground layer under the character   | A ground-layer emitter draws as an opaque object at `GROUND_ORDER`, section 2.44 of the VFX plan             |
| 39  | Joint snap events                  | `snappedPose` rewrites the joint's local over the span, so its skin, armature and effects follow             |
| 40  | Conform to path events             | Read typed, the mask a `KeyRef`. No path on a flat stage with a standing unit, so nothing moves              |

Decisions 4, 5, 11, 13 and 14 were revised on screen after the first build, together with
26 to 30: the inspector swap and its crumb went, and the row unfolds instead. Decisions 33 to
35 came with the events build.

Decision 10 is the one the recording shows most of. Frames 2 to 8 are the viewport's hamburger
and the `Form1` to `Form3` submesh sets. That menu belongs to the preview and not to the table.

## The pane

```
+-- Skin5 (Pulsefire Ezreal) ---------------------------------------------------------+
| Characters/Ezreal/Skins/Skin5                                          [Panes v]     |
+---------------------------------+---------------------------------------------------+
|                                 | Clips | Tracks | Masks | Sync groups   [filter]   |
|                                 |  Name             File        Track   Mask  Rate  |
|   character on the grid         |  Attack1  Atomic  attack1.anm Default  -   30/30 |
|                                 |  Idle1    Atomic  idle1.anm   Default  -   30/30 |
|                                 |  Run      Selector    -          -     -     -   |
|                                 +---------------------------------------------------+
|                                 | Skin > Idle1                                      |
|                                 |  mAnimationResourceData                           |
|   [<] [>] [Idle1 v] [x1.0]      |  mEventDataMap (4)                                |
+---------------------------------+---------------------------------------------------+
```

The pane is `clips` in `ShellPaneId`, listed for the skin shell after `preview`. The default
tree is a row split, preview 3 beside a column split 2 of clips over inspector.
`sanitizeShellLayout` reads a saved skin tree with no `clips` leaf and splits the inspector's
leaf in two, clips above. A saved tree that holds the pane is left as it is.

The header row carries the segmented control and the filter. The transport under the preview
keeps its `Select`, and both draw the same `picked`.

## The model

`read_animation_graph(document, entry)` answers one `AnimationGraph`:

```
AnimationGraph
|-- source: AssetRef | null        the file declaring the graph, null for the open document
|-- clips: GraphClip[]             mClipDataMap in map order
|   |-- name, hash                 the key, named by the tables or as hex
|   |-- class: string              the pointer's class name, or its hex
|   |-- animation: NamedAsset | null
|   |-- track, mask, syncGroup: KeyRef | null
|   |-- tickDuration: number | null
|   |-- events: ClipEvent[]        mEventDataMap in map order
|   |   |-- name, hash, class      the key and the pointer's class, named or hex
|   |   |-- startFrame, endFrame   endFrame null for the meta's -1
|   |   |-- kind                   submeshVisibility { show, hide }, particle { effectKey,
|   |                              effectName, spawns, isLoop, isKill, scale },
|   |                              jointSnap { joint, snapTo, offset },
|   |                              conformToPath { mask, blendIn, blendOut }, or other
|   |-- children: KeyRef[]         per the kinds table above, in field order
|   |-- parameters: number[]       a parametric clip's mValue per child, else empty
|   |-- interruptionGroups: string[]
|   |-- flags: number
|-- tracks: Track[]                name, hash, priority, blendMode, blendWeight
|-- masks: Mask[]                  name, hash, id, weights (the list's length)
|-- syncGroups: SyncGroup[]        name, hash, kind
```

`KeyRef` is `{ name, hash, declared }`. `declared` is false where the sibling map holds no entry
under the hash, which is the missing cell of decision 18. A child whose hash names no clip row is
the same.

A submesh and a joint an event names are `HashRef`, `{ name, hash }`, and the viewport matches
the hash against the names the `.skn` and the `.skl` spell. `SkinModel.effectSystems` is the
resolver's map as `{ key, system, source }`, which is what a particle event's `effectKey` is
looked up in. `source` is the linked file declaring the system, null for the skin's own, and a
key no file within reach declares a system for is left out. A skin keeps its systems in a
shared multi-skin bin as often as in its own, so `search_linked_systems` walks the links as
the graph search does, and the viewport holds each source open through a `DocumentOpener`
and reads the system through that handle.

The viewport places the playlist on its pass in `clipEvents.ts`: `timedSteps` gives each step
its start and its frame length, `visibilityTimeline` folds the visibility events into one
hidden list per moment they change, and `particleCues` lists what to spawn, when, and on which
joint. `ClipEffect.tsx` drives one cue's system through `followCue` in `follow.ts`, which runs
the driver on the pass's time past the cue and stands it down before it. The events of the
first pass alone are placed, since the pass repeats.

`source` is what the unfolded row reads the clip's rows from. A graph another file declares costs a
`useBinDocument` on that file, as `AlsoCheck` in `ClassCells.tsx` does for a linked object. The
row's path is `mClipDataMap` then the key, addressed as `entryKeyHash` in `binRows.ts` reads a
map key back.

The viewport takes `clips.filter(clip => clip.animation !== null)` where it took
`AnimationClip[]`. `openingClip` and `BIND_POSE` are unchanged.

`read_clip_header(asset)` answers `{ fps, duration }` for one `.anm`. `ltk_anim` decodes the
whole clip on a read, and the wad chunk's decompression is the larger cost either way. A
header-only decoder is an upstream seam and not this plan's.

## The stages

### 1. The graph read

`resolve_graph` in `skin/mod.rs` beside `resolve_clips`, over all four maps and every kind of
the kinds table. `graph_clips` and `search_linked` answer `AnimationGraph` in place of
`Vec<AnimationClip>`. `resolve_clips` and `AnimationClip` go. `read_animation_graph` replaces
`read_animation_clips` in `commands/skin.rs` and `ipc.rs`, and `pnpm generate:types` rewrites
the bindings. `skinQueries.clips` becomes `skinQueries.graph`, and `SkinViewport` filters the
atomic clips out of it.

Tests in `skin/tests.rs`: one graph object holding a clip of every kind, each with its children,
a clip keying a track the map does not declare, an unnamed key, a graph found through a linked
file. `skinScene.test.ts` keeps its assertions over the filtered list.

### 2. The pane and the table

`clips` in `shellPanes.ts`, its title in `messages/en/workshop.json`, the default tree, and the
insertion in `sanitizeShellLayout`. `shellPanes.test.ts` covers the saved tree with and without
the pane.

`ClipTable.tsx` in `bin/skin/`, on the `Column` shape of `EmitterTable`. The name column carries
the kind as a chip after the name. The file column is the asset's name with the chip its kind
draws, per "String links". Rows sort by name and virtualize through `useRowWindow`. A row click
sets `picked` where the clip is atomic, and sets `inspected` in every case (stage 4). The picked
row is marked as the transport's `Select` marks it.

The filter is a `ClipFilter` input in the header, matching case-insensitively on the name. #462
takes the same component for the emitter strip.

`SkinShell` in `ClassFrames.tsx` gains the `clips` body. The narrow frame stacks a Clips section
under the hero, through a `clips` section widget the skin layout places over
`skinAnimationProperties`.

### 3. The tabs

A `SegmentedControl` in the pane header over four values. Tracks, Masks and Sync groups are
three small tables of the model's rows: name and hash, then each struct's own fields as columns.
The mask row draws the weight list's length. A track, mask or sync group chip on a clip row
switches the control and marks the row, through a `jump` in the pane's own state.

### 4. The inspector

Built this way first, then revised into the unfolded row of decision 5: `SkinChoice` holds
the unfolded keys and `ClipDetail.tsx` draws the rows under the row's caret.

`SkinChoice` gains `inspected: string | null` and `setInspected`. `SkinShell`'s inspector body
draws the clip's field rows while `inspected` is set, under a crumb of the skin's name and the
clip's, and the skin sections otherwise. Escape in the pane and a click on the crumb's first
segment clear it. The rows are the generic `FieldRows` over `bin_read` at the clip's path in
`source`, so `mEventDataMap`, the pair lists and the accessories fold open as any struct does. A
child clip's row in a pair list carries a jump link that selects that row in the table.

### 5. The rate

`read_clip_header` in `commands/skin.rs` over `ltk_anim`. `skinQueries.clipHeader(asset)` with
`staleTime: Infinity`. The rate cell mounts the query for the row and draws `fps / tick`, the
right half from `1 / tickDuration` rounded, blank where the clip sets none, and a dash where the
file is not located. Virtualization bounds the queries to the rows on screen.

### 6. The docs

"The clips pane" under the skin paragraph of `docs/ux/BIN_EDITOR.md`, the `AnimationGraphData`
row of "The layouts" reworded to the pane, and step 6 of the views track marked. Section 6.8 of
the research note points at the spec.

### 7. The graph's own layout

`animationGraphLayout` in `classLayouts.ts` keyed on `nameHash("AnimationGraphData")`, a stack
frame: Clips through the same table widget with no preview, Tracks, Masks, Sync groups, and Other
for the five remaining fields. A row click sets `inspected` only.

## Not built

- Editing, in the shape of decision 30, which waits on leaf writing
- The preview's Show menu as one menu: bounding box. Armature and Names are icons, decision
  31, and the submesh ticks are their own menu, decision 37
- Problems rules for a dangling track, mask or child, or a file not located
- An events sub-table with a frame column, and event marks along the scrub
- A particle event's `scale`, `mIsLoop` and `mParticleEventDataPairList[].0x4fce52ba`,
  and a kill event stopping an effect: every cue runs once at the definition's own scale
- Sound and the other event kinds, and a joint snap whose parent is itself snapped
- A path for a conform to path event to bend the masked joints along, which needs the
  preview's unit to move
- Persisted tab, filter and unfolded state
- A condition or a chance driving which child a composite plays, and a blend between the two
  pairs a parametric clip's value falls between
- The recording's `Browsable` and `Interruption Groups` tabs
- A Blends tab over `mBlendDataTable`, each row the two clips its packed key names
