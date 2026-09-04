# Editor Split Tree — Implementation Plan

> Status: **implemented** (2026-08-19), through phase 5. Deviations from the letter of the plan:
> `splitLeaf` returns `{ tree, leafId }` so the store can focus the fresh leaf, the store imports
> the tree ops from `@/modules/editor/layout` because the full barrel evaluates a cycle through
> `@/stores`, and the drop preview is one element that covers the leaf and glides into the target
> half, per review. The two phase 5 items about the tab title prefix and the preview tab were
> no-ops, since neither feature exists yet. Three follow-ups landed the same day, past this
> plan's scope: `.ltk/editor.json` persistence with a versioned schema, the side panel sash
> from section 11, and an accent rail marking the focused group's active tab.
> Design source: `docs/ux/PROJECT_EDITOR.md` — [The panel layout](../ux/PROJECT_EDITOR.md#the-panel-layout),
> [A tab drag creates a panel](../ux/PROJECT_EDITOR.md#a-tab-drag-creates-a-panel).
> Feature row this closes: **Panel split layout**.

The editor surface is one fixed pane today. This plan replaces it with a tree of splits, so a user
drags a tab onto the edge of a surface and gets a second surface there.

## 1. Current state (verified 2026-08-19)

| Piece               | Where                                                      | Shape today                                                                                                                  |
| ------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Generic tab surface | `src/modules/editor/components/EditorSurface.tsx`          | Takes `documents` / `activeId` / `registry` as props, already generic over `EditorDocumentBase`                              |
| Tab strip           | `src/modules/editor/components/EditorTabs.tsx`             | Owns its **own** `DndContext`, `SortableContext`, `restrictToHorizontalAxis`, `closestCenter`                                |
| Editor state        | `src/stores/workshopEditor.ts`                             | `byProject[path] = { open, activeId, selectedLayer, dirty, collapsed, reveal }`, persisted under `ltk-workshop-documents` v1 |
| State hooks         | `src/modules/workshop/state/useProjectEditor.ts`           | Resolves the project from `ProjectContext`, so no panel is handed a path                                                     |
| Composition         | `src/modules/workshop/components/ContentBrowser.tsx`       | `const panes = layerPanelSide === "right" ? [surface, sidebar] : [sidebar, surface]` inside a `flex gap-1.5 p-1.5`           |
| Sidebar sizing      | `src/modules/editor/components/SidePanel.tsx`              | A hand-written vertical boundary drag, per section. Stays as it is                                                           |
| Sidebar layout      | `src/stores/workshopLayout.ts`                             | `layerPanelSide`, `layerPanelOpen`, section heights                                                                          |
| Layout control      | `src/modules/workshop/components/ContentLayoutPopover.tsx` | Side and visibility of the one sidebar                                                                                       |

Facts that shape the plan:

- `EditorSurface` is already parameterised over its document list, so a second instance needs no new
  props beyond the ids it reads
- `EditorTabs` owning a `DndContext` is the one blocker for a cross-surface drag. A drag cannot leave
  the context it started in
- `ContentLayerList` owns a `DndContext` of its own for layer reorder. Keeping the new context off
  the sidebar avoids nesting two of them
- `restrictToHorizontalAxis` in `src/utils/dnd.ts` has exactly one call site, `EditorTabs`. It goes
  unused after this work

## 2. The library

`react-resizable-panels@4.12.3`. Headless, zero runtime dependencies, `react` and `react-dom`
`^18 || ^19` as peers. Add it with `pnpm add react-resizable-panels`.

Version 4 renamed everything the older articles use, so read the v4 README and not a v2 example.
The declarations that matter:

```ts
type Layout = { [id: string]: number };
type LayoutChangedMeta = { isUserInteraction: boolean };

type GroupProps = HTMLAttributes<HTMLDivElement> & {
  defaultLayout?: Layout;
  onLayoutChange?: (layout: Layout) => void;
  onLayoutChanged?: (layout: Layout, meta: LayoutChangedMeta) => void;
  orientation?: "horizontal" | "vertical";
};

type PanelProps = {
  id?: string | number;
  defaultSize?: number | string;
  minSize?: number | string;
  // ...
};
```

| Our model          | Library                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| A split node       | `Group`, `orientation` from `dir`                                      |
| A child of a split | `Panel`, `id` is the child node's id                                   |
| A seam             | `Separator`, which carries `role="separator"` and its own key handling |
| A split's sizes    | `defaultLayout` in, `onLayoutChanged` out                              |

`Panel` must be a **direct DOM child** of its `Group`. A nested split renders as a `Group` inside a
`Panel` with no wrapper between them, and the gap between panels comes from the `Separator`'s own
width rather than a `gap` on the group.

## 3. Scope

**Two layout systems, and a fixed boundary between them.** This is the shape Visual Studio Code
uses, and the editor already borrows its tab strip and its side panel from there.

| System          | Holds                                                      | Sized by                | Owns             |
| --------------- | ---------------------------------------------------------- | ----------------------- | ---------------- |
| The shell       | The two side panels and the editor grid between them       | One sash per side panel | `workshopLayout` |
| The editor grid | A split tree of editor groups, each with its own tab strip | A seam per split        | `workshopEditor` |

The split tree is the second row and nothing else. A leaf of it is an **editor group** in the
Visual Studio Code sense: a tab strip over a stack of documents. The identifier stays `LeafNode`,
because `Group` is already the library's own component.

The side panels never enter the tree. A tab dragged over one does nothing, exactly as it does in
Visual Studio Code. Section 11 gives the reasoning and what the shell does instead.

**In scope.** The editor grid becomes a split tree. A tab drag onto an edge splits it. A tab drag
onto another group moves it. A seam resizes. A closed group gives its space back. The tree persists
per project, in the store that already persists the strip.

**Out of scope, and why.**

| Left out                         | Reason                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A sash for the side panels       | The shell's own job, and independent of this work. Section 11 sketches it                                    |
| Views moving between side panels | The other half of the workbench model, and it shares no code with the tree                                   |
| `.ltk/editor.json`               | Needs a Rust command and a debounced writer. Only the storage adapter changes, so it stays a clean follow-up |
| Named presets                    | A preset is a tree, so it is data over a model that does not exist yet                                       |
| Detaching a tab to an OS window  | A different feature with a Tauri window behind it                                                            |

## 4. Design decisions

**D1 — A leaf holds document ids, and the documents live in one flat map.**
`ProjectEditor` gains `documents: Record<string, ContentDocument>`, and a leaf's `tabs` is a list of
ids. A move between leaves then rewrites two id lists and touches no document, and `dirty` stays a
flat set of ids as it is today.

**D2 — One document lives in exactly one leaf.**
Opening a document that is already open activates it where it is and focuses that leaf. Dragging it
moves it rather than copying it. This keeps document ids globally unique, keeps one mounted editor
per document, and keeps `dirty` keyed by document id alone. Two views of one document would need a
per-instance id and a second dirty key, which is a feature of its own and not a side effect of this
one.

**D3 — Splits are binary at creation and flatten when they can.**
A split of a leaf whose parent already runs in the same direction inserts a sibling into that parent
instead of nesting a second group inside it. Three surfaces in a row are then one `Group` of three
panels, and every seam in that row shares one budget. This is the model the UX doc describes with
`children: Node[]`, and it is what a user expects when they drag a seam.

**D4 — A split's sizes are opaque.**
`layout` is written only by `onLayoutChanged` and handed back only to `defaultLayout`. Nothing
authors a number into it. Redistribution on a close normalises by the sum of the map, so the
arithmetic holds whatever unit the library reports. A default or a preset carries no sizes at all
and takes even shares from the library, and a panel type that wants a starting share sets
`defaultSize` on its own `Panel`.

**D5 — The tree is persisted state, not derived state.**
It goes in `useWorkshopEditorStore` beside the strip it replaces, under the same key, at version 2
with a migration. Nothing derives a layout from the open documents.

**D6 — One `DndContext` for the grid, and it never wraps a side panel.**
The context sits at the root of the editor grid. The sidebar keeps its own context for layer
reorder, and because the boundary in section 3 is permanent the two never nest. A tab is draggable
only within the grid, so no drop target outside it has to reject one.

**D7 — A cross-surface drag commits on drop, with no optimistic move.**
The multi-container dnd-kit recipe moves an item between lists during `onDragOver`. That is a lot of
state for a strip of six tabs. Instead the target paints where the tab will land, and `onDragEnd`
performs the one tree operation. Reorder inside a strip keeps the sortable transforms it has today.

**D8 — A reset merges every strip into one, in tree order.**
This answers open question 1 of the UX doc. Reading order is depth first, so a row merges left to
right and a column merges top to bottom. The active tab of the focused leaf stays active.

## 5. The model

New file `src/modules/editor/layout/tree.ts`. Pure, no React, no workshop types.

```ts
export type Edge = "top" | "right" | "bottom" | "left";

/** One editor group: a tab strip over a stack of documents. */
export interface LeafNode {
  kind: "leaf";
  id: string;
  /** Document ids in strip order. Empty only while this leaf is the whole tree. */
  tabs: string[];
  activeTab: string | null;
}

export interface SplitNode {
  kind: "split";
  id: string;
  dir: "row" | "col";
  children: LayoutNode[];
  /** What the library last reported, keyed by child id. Absent means even shares. */
  layout?: Record<string, number>;
}

export type LayoutNode = SplitNode | LeafNode;
```

Two departures from the `Node` type in the UX doc, both forced by what is above.

- `sizes: number[]` becomes a map keyed by child id, because that is what `Layout` is and because a
  positional array goes wrong the moment a child is removed
- `panel: PanelType` is gone. Every leaf is an editor group, since the side panels live in the shell
  and the game browser opens as a tab like any other document

### Operations

Each takes a tree and returns a tree, and returns the tree it was given when nothing moved, so the
store's identity comparison keeps subscribers asleep.

| Operation                                     | Behaviour                                       |
| --------------------------------------------- | ----------------------------------------------- |
| `singleLeaf(tabs, activeTab)`                 | The starting tree, and what a reset produces    |
| `findLeaf(tree, leafId)`                      | The leaf, or null                               |
| `leafHolding(tree, documentId)`               | Which leaf has this document open               |
| `leaves(tree)`                                | Depth first, which is reading order             |
| `insertTab(tree, leafId, documentId, index?)` | Appends when the index is absent, and activates |
| `removeTab(tree, leafId, documentId)`         | Drops the tab, then prunes                      |
| `moveTab(tree, documentId, toLeafId, index?)` | Remove then insert, then prune                  |
| `splitLeaf(tree, leafId, edge, documentId)`   | Below                                           |
| `setActiveTab(tree, leafId, documentId)`      |                                                 |
| `setSplitLayout(tree, splitId, layout)`       | Writes what `onLayoutChanged` reported          |
| `mergeToSingleLeaf(tree)`                     | The reset of D8                                 |

### Split

`left` and `right` give `dir: "row"`, `top` and `bottom` give `dir: "col"`. `left` and `top` put the
new leaf before the target, the other two put it after.

- When the target's parent is a split of the same `dir`, insert the new leaf as a sibling of the
  target. The target's entry in the parent's `layout` splits in two, half to each
- Otherwise wrap the target in a fresh split with no `layout`, so the library gives the two even
  shares

### Prune

One pass after every removal, and the shape of the tree is what makes one pass enough.

1. A leaf with no tabs is removed, unless it is the root. The root leaf stays and shows the empty
   state.
2. A removed child's share goes to the sibling it sat against, the previous one falling back to the
   next.
3. A split left with one child is replaced by that child. **The parent's `layout` key for the split
   id is renamed to the surviving child's id**, or the parent's sizes are lost.

## 6. State

`src/stores/workshopEditor.ts`, version 2.

```ts
interface ProjectEditor {
  documents: Record<string, ContentDocument>;
  layout: LayoutNode;
  /** The leaf a newly opened document lands in. */
  activeLeafId: string;
  selectedLayer: string | null;
  dirty: ReadonlySet<string>;
  collapsed: Record<string, ReadonlySet<string>>;
  reveal: RevealRequest | null;
}
```

`documents`, `layout`, `activeLeafId` and `selectedLayer` persist. `dirty`, `collapsed` and `reveal`
stay out of storage, as they are today.

**Migration from v1.** `open` becomes `documents`, and a single leaf carries their ids in order with
`activeId` as its active tab. Written as a `persist` `migrate`, so an existing user keeps the strip
they left open.

| Action                                                    | Note                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `openDocument(path, document, leafId?)`                   | Defaults to `activeLeafId`. A document already open elsewhere activates there and focuses that leaf |
| `activateDocument(path, leafId, id)`                      | Also sets `activeLeafId`                                                                            |
| `closeDocument(path, leafId, id)`                         | Drops it from `documents` once no leaf holds it                                                     |
| `reorderDocuments(path, leafId, ids)`                     | The existing length guard against a stale drop stays                                                |
| `moveDocument(path, documentId, toLeafId, index?)`        |                                                                                                     |
| `splitWithDocument(path, documentId, targetLeafId, edge)` |                                                                                                     |
| `focusLeaf(path, leafId)`                                 |                                                                                                     |
| `setSplitLayout(path, splitId, layout)`                   | Called only when `meta.isUserInteraction`, so a first mount and a window resize write nothing       |
| `resetLayout(path)`                                       | D8                                                                                                  |

`moveProject` and `forgetProject` are unchanged.

Hooks in `src/modules/workshop/state/useProjectEditor.ts` gain `useLayoutTree()`, `useActiveLeafId()`,
`useLeafTabs(leafId)` and `useLeafActiveId(leafId)`. `useActiveDocumentId()` keeps its name and
returns the active tab of the **focused** leaf, which is what the sidebar's details highlight reads.

A `LeafProvider` in the workshop module carries the leaf id down, in the shape `ProjectContext`
already uses, so nothing under a surface takes a leaf id as a prop.

## 7. Rendering

New files under `src/modules/editor/layout/`:

| File                 | Holds                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `tree.ts`            | Section 5                                                                     |
| `SplitLayout.tsx`    | The recursive renderer, generic, `{ node, onLayoutChanged, renderLeaf }`      |
| `LeafDropZones.tsx`  | The five droppables of one leaf, and the drop preview                         |
| `TabDndProvider.tsx` | The one `DndContext`, its sensors, its collision detection, its `DragOverlay` |
| `dnd.ts`             | Droppable id encode and decode, and `resolveDrop`                             |

`SplitLayout` renders a split as a `Group` whose `Panel` children are interleaved with `Separator`,
and a leaf through `renderLeaf`, so the editor module never learns what a content document is. The
workshop supplies a `ContentLeaf` that binds a leaf id to the existing `EditorSurface`.

`ContentBrowser` keeps the sidebar and the flex row it lives in, and the surface half becomes:

```tsx
<TabDndProvider>
  <SplitLayout node={layout} onLayoutChanged={setSplitLayout} renderLeaf={renderContentLeaf} />
</TabDndProvider>
```

`EditorSurface` and `EditorTabs` change in three ways and no more.

- `EditorTabs` loses its `DndContext`, its sensors and its modifier. It keeps `SortableContext`
- Both take a `leafId`, so a sortable id is `tab:{leafId}:{documentId}` and unique across strips
- `EditorSurface` calls `focusLeaf` on a pointer down anywhere in it, tab strip or document body

`data-ui` on a surface becomes `` `EditorSurface:${leafId}` `` so two of them are told apart in
devtools.

The route's `key={project.path}` on `ContentBrowser` stays. The bootstrap effect that opens the
details document on a fresh project stays, and opens into the active leaf.

## 8. Drag and drop

**Droppable ids.** `tab:{leafId}:{documentId}` for a position in a strip, and
`leaf:{leafId}:{center|top|right|bottom|left}` for a region of a surface.

**The zones.** Each leaf renders an absolutely positioned, `pointer-events-none` layer of five
regions. They are mounted at all times, because dnd-kit measures droppables at drag start, and they
paint nothing until a drag is over them. An edge band is 20% of the leaf's smaller side, clamped to
32–120px. A leaf too narrow or too short to hold two panels reports its centre alone, so a drag
never produces a split that cannot be read.

**Collision detection.** `pointerWithin`, then a rank over what it returns: a `tab:` beats an edge,
and an edge beats the centre. Without the rank the strip's own centre zone swallows every tab
collision. `closestCenter` is the fallback for a pointer outside every leaf.

**Sensors.** `PointerSensor` with the existing `distance: 6` constraint, so a click still activates a
tab and its close button still fires.

**Preview.** A `DragOverlay` carries a ghost of the tab, styled as the current `isDragging` tab is.
The overlay is plain, since `framer-motion` is reserved for `DragDropOverlay`.

**`onDragEnd`.** `resolveDrop` is a pure function from the active and over ids to one outcome, and it
is unit tested without a DOM.

| Over                                        | Outcome                                   |
| ------------------------------------------- | ----------------------------------------- |
| A tab in the same leaf                      | `reorderDocuments`                        |
| A tab in another leaf                       | `moveDocument` at that index              |
| `leaf:X:center`, another leaf               | `moveDocument` to the end of X            |
| `leaf:X:{edge}`                             | `splitWithDocument`                       |
| `leaf:X:{edge}` where X holds only this tab | Nothing. The leaf would split into itself |
| Nothing                                     | Nothing                                   |

**The keyboard route.** Edge splitting by keyboard is an awkward gesture, so the accessible route is
a command rather than a drag: a tab's context menu gains **Split right** and **Split down**, over the
`ContextMenu` component that already exists. The seams are keyboard resizable already, because
`Separator` handles that.

## 9. Visuals

Load the `design-system` skill before writing any of this. Every colour is a token.

| Element            | Treatment                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seam               | A 6px transparent `Separator`, matching the `gap-1.5` it replaces, with a centred 2px rail that takes `bg-accent-500/60` on hover and `bg-accent-500` on focus. `SidePanel`'s `ResizeHandle` already does this, so the two read as one control |
| Drop preview       | One `rounded-xl border border-accent-500 bg-accent-500/12` element per leaf. It covers the leaf edge to edge over the centre and glides into the target half near an edge, as Visual Studio Code's does                                        |
| Centre caret       | A 2px `bg-accent-500` caret in the strip at the insert index                                                                                                                                                                                   |
| Drag ghost         | `bg-surface-800 shadow-lg rounded-md`, the tab's current dragging style                                                                                                                                                                        |
| An empty root leaf | The existing `NothingOpenState`                                                                                                                                                                                                                |

Each leaf keeps its own rounded frame and its own border, so a split reads as two islands on the
fold rather than one pane with a line through it: DS-GROUND.

## 10. Order of work

Each phase ends green under `pnpm check`.

**Phase 0 — the dependency.** `pnpm add react-resizable-panels`. Stand a `Group` of two `Panel`s
inside the current surface, confirm the seam drags, and log one `onLayoutChanged` payload to see what
the library reports. Throw the spike away.

**Phase 1 — the model.** `tree.ts` and its tests. No React, no store, no rendering. This is the phase
that decides whether the rest is easy.

**Phase 2 — the store.** `ProjectEditor` v2, the migration, the actions, the hooks. The UI still
renders one leaf, so the only visible change is that an existing user's strip survives the upgrade.

**Phase 3 — the tree on screen.** `SplitLayout`, `ContentLeaf`, `ContentBrowser` rewired. Splits are
reachable through the new **Split right** and **Split down** commands alone, so the tree is exercised
before any drag code exists. **Reset layout** joins `ContentLayoutPopover` in the same phase, because
a user can now break the layout.

**Phase 4 — the drag.** Hoist the `DndContext`, add the zones, the collision rank, the preview and
`resolveDrop`. Delete `restrictToHorizontalAxis` from `src/utils/dnd.ts` and its export.

**Phase 5 — the edges.** Focus follow on pointer down, the tab title prefix now scoped per strip, one
preview tab per leaf rather than per project, and the doc updates of section 13.

## 11. Why the side panels stay out

A side panel is not an editor group with a different body in it. The two differ in every way that
the tree encodes.

| Question                       | An editor group           | A side panel                      |
| ------------------------------ | ------------------------- | --------------------------------- |
| What does it hold?             | Documents, behind tabs    | One view, or a stack of sections  |
| How many are there?            | As many as the user drags | Two, and the shell names them     |
| Does it close when it empties? | Yes                       | No. It hides and its sash returns |
| Does it take a tab drop?       | Yes                       | No                                |
| Whose state is it?             | The project's             | The application's                 |

Folding them into one tree costs three things and buys nothing this feature needs.

- Every operation in section 5 grows a case for a node that has no tabs, so `removeTab`, `prune` and
  `mergeToSingleLeaf` each carry a branch that the editor grid never reaches
- The `DndContext` would have to wrap `ContentLayerList`, whose own context handles layer reorder.
  Nesting two contexts, or merging the layer drag into the tab drag, is a cost paid for a drop that
  section 3 rules out anyway
- A panel's visibility is per application and a leaf's contents are per project, so one tree would
  hold state with two different lifetimes and two different storage keys

**What the shell does instead.** `layerPanelSide` and `layerPanelOpen` in
`src/stores/workshopLayout.ts` stay as they are, and `ContentLayoutPopover` keeps both controls. The
one thing worth adding later is a sash, so the sidebar's width is the user's rather than the
`w-56` it is fixed at today. That is a second, flat `Group` in `ContentBrowser` with the sidebar and
the editor grid as its two panels, using the same library and none of this plan's model. It is
independent work, and section 3 leaves it out.

`SidePanel`'s section boundaries stay as they are either way. They size sections inside one panel,
which is a different job from sizing panels against each other.

## 12. Tests

`src/modules/editor/layout/__tests__/tree.test.ts`:

- A split on each of the four edges puts the new leaf on the right side, in the right direction
- A split inside a parent of the same direction flattens instead of nesting, and halves the share
- Closing the last tab of a leaf removes the leaf, and the sibling takes its share
- A split left with one child collapses, and the parent's size for it survives under the new id
- The root leaf survives its last tab closing
- A move between leaves preserves the document, its order and the active tab of both leaves
- `mergeToSingleLeaf` returns depth-first reading order
- Every operation returns the same object when nothing moved

`src/modules/editor/layout/__tests__/dnd.test.ts`: `resolveDrop` over the table in section 8,
including the self-split guard and the id round trip.

`src/stores/__tests__/workshopEditor.test.ts`: the v1 to v2 migration, and a v2 read-back.

## 13. Documentation

`docs/ux/PROJECT_EDITOR.md`, under that document's own rules. The boundary of section 3 is the
larger edit, because the document currently describes one layout over all three regions.

| Section                    | Edit                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Feature status             | **Panel split layout** moves from Planned to In progress, then to Available                                                    |
| What the layout governs    | The table splits in two. The shell sizes the side panels, the split tree governs the editor grid alone                         |
| The split tree             | The `Node` type is replaced by section 5's. Ids, an opaque `layout` and no `panel` field                                       |
| Panel types                | Becomes the list of views a **side panel** can host. The editor surface leaves the list, because it is the grid and not a view |
| A tab drag creates a panel | Stands as written. It already says that no other panel type holds a tab                                                        |
| Presets                    | A preset is a grid tree plus the shell's own settings, not one tree covering both                                              |
| Open questions             | Question 1 moves to Answered with D8, that the tabs merge into the surviving leaf in reading order                             |
| Answered                   | A row for the boundary, that the side panels sit outside the split tree as they do in Visual Studio Code                       |
| Change table               | A new row at the top                                                                                                           |

## 14. Risks

| Risk                                                                                                            | Answer                                                                                                |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `react-resizable-panels` v4 renamed everything v2 and v3 documented, and most examples online are the old names | Pin the version, read the v4 README, and keep Phase 0's spike short                                   |
| dnd-kit measures droppables at drag start, so a zone that mounts during a drag may not register                 | The zones are mounted at all times and are `pointer-events-none`, so measurement is never in question |
| A document remounts when it moves between leaves, and loses its scroll position                                 | Accepted. A move is rare, and a tab switch still keeps every editor's state as it does today          |
| The tree grows a second node kind later, and every operation in section 5 grows a branch                        | Ruled out by section 3. The boundary is a decision, not a phase, and section 11 records why           |
| A user builds a layout they cannot read                                                                         | **Reset layout** ships in the same phase as the first split, not later                                |
