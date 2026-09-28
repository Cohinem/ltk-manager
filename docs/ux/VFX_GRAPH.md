# VFX graph

The design principles of the Graph pane, the node canvas the particle shell draws for a
`VfxSystemDefinitionData`. Each principle states the rule, the reason for it, and where the code
applies it, as of `12661b7e`.

Single gestures are specified in docs/ux/BIN_EDITOR.md, in "Editing a node's structure in the
Graph pane", "The curve panel" and "The viewer". The driver evaluator and its tiers are in
docs/plans/shimmer-driver-graph.md, decisions 2.8 and 2.9.

Paths are relative to `src/modules/workshop/bin/vfx/drivers/` unless they start at the repo root.

## 1. The file holds the data

### The graph is read from the file

- `systemGraph` builds the tree again from the resolved system on every read
  (`utils/systemGraph.ts`, `utils/emitterGraph.ts`)
- the canvas changes the file only through document edits, the same edits the inspector sends
- the same tree gets the same layout on every read (`layoutGraph` in `utils/driverLayout.ts`)
- a dragged node keeps its place until Reset layout or until the pane closes, since the bin
  stores no positions (`moved` in `components/GraphCanvas.tsx`)
- folds, popped-out values, fields picked by Add field and not yet written, the preview node and
  the loop switch are view state. None of it reaches the file, and none of it outlives the pane.

**Why.** A bin file is read by the game and by other tools. Anything the file cannot store would
be gone on the next open, and a view that looks saved when it is not misleads the reader.

### A node stands for a place in the file

Every item carries a `wire`, the property path of the row it stands for (ADR-0027). Reveal,
change marks, the row menu, Delete and Duplicate all key on that path.

- a double click on a node, or its tree button, shows its row in Properties. A double click on a
  field or a button inside the node does not, so two quick presses on a stepper nudge the value
  twice (`inControl` in `components/GraphCanvas.tsx`).
- a changed row puts the document's change dot on the node's corner, and the changed-only view
  dims every node without a change (`components/NodeFrame.tsx`)
- a node that stands for no value of its own, an emitter or a Texture node, offers no Delete.
  An emitter is removed through the emitter clipboard, as everywhere else in the editor
  (`nodeRemoval` in `utils/nodeEdits.ts`).

### An edge connects a value to the field that holds it

Inputs stand to the left of the node they feed, each tree's root stands rightmost, and every
emitter feeds the system preview.

The reader cannot draw or cut an edge. `isValidConnection` refuses every connection, and React
Flow's own Delete key is off (`components/canvasAdds.ts`, `deleteKeyCode={null}`). A structural
change is an edit of the value, such as adding a field, plugging a curve into a socket or removing
a list item. The edge then follows from the next read.

**Why.** In a bin file each value has exactly one holder. A free wire editor would let the reader
draw shapes the format cannot store.

## 2. What gets a node

A system can hold dozens of emitters and hundreds of fields. A value gets a node of its own only
when the reader edits it as one unit. Deep nesting in the file does not add nodes by itself.

| Value                                          | Draws as                                                                      | Code                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| A leaf: number, vector, string, bool, hash     | A row of its holder, edited in place                                          | `FieldLine` in `FieldLines.tsx`        |
| A struct, pointer, list or map the file writes | A node on its field's input                                                   | `inputOf` in `utils/emitterGraph.ts`   |
| A struct whose one field holds another struct  | A section of the same node, so `primitive` over `mMesh` reads as one node     | `structTree`, `nested`                 |
| A struct inlined from another object           | A leaf, since its fields belong to that object                                | `inputOf`                              |
| A material, or a struct holding one            | A node even where linked, folded to a shape preview, its lists drawn as lines | `utils/materialNodes.ts`               |
| The texture and render fields                  | One Texture node, with erosion, distortion and `textureMult` as sections      | `utils/renderSection.ts`               |
| The force collection                           | A node per force, straight on the emitter rather than through the lists       | `forceTrees`                           |
| A keyed or random `Value*`                     | A value node, embedded in its socket until popped out                         | `valueTree`, `utils/socketEmbed.ts`    |
| A shimmer driver                               | A node per driver, a constant or a flat curve embedded in its socket          | `driverTree` in `utils/systemGraph.ts` |
| A file path under a struct                     | Its holder's row, with the file's picture on the holder node                  | `structTree`, `picture`                |

### Small values draw inside the socket they feed

`embedSockets` moves an item into its socket, with no node and no edge, when it is one of:

- a driver whose body is one value line: a constant, or a curve with no keys and no tables
- a keyed or random value, drawn as a one-line strip (`components/ValueLine.tsx`)
- a list of up to 8 items under a struct's field, where every item is a leaf or an embedded value

A driver the registry reports as unsupported always keeps its node, so its warning stays in
view. A button beside an embedded item pops it out to a node, and a header button on that node
embeds it back. Both are view state.

**Why.** A node and an edge for a single number take more room than the number does. The reader
can still give the value a node when they want to look at it as one.

## 3. Visual language

### Hue tells node types apart

A hue is how a reader tells nodes and edges of different types apart at a glance. The kind label
and the header title name the type.

- nodes and edges carrying a value use one hue per value kind, from the four socket tokens
  `socket-float`, `socket-vec2`, `socket-vec3` and `socket-vec4`, a scale minted for the graph
  (DS-KIND-HUE, `src/styles/global.css`). The hue is on the sockets, the edges, the header glyph,
  the kind label, the header wash, a single-channel curve line and the minimap.
- nodes carrying no value kind use one hue per node type: the accent for emitters and the
  preview, `bin-class` for components, structs and the Texture node, `doc-layer` for files
  (`itemHue` in `utils/graphTones.ts`)
- a vector draws its channels in `channel-1` to `channel-4`, the curve panel's X red, Y green and
  Z blue, so a curve reads the same on a node and in the dock
- a kind is labelled in the bin format's own words: `F32`, `Vec2`, `Vec3`, `Vec4` (`KIND_NAME`)
- the status hues mean status only: `info` for an inferred reading, `warning` for an unsupported
  one (`LEVEL_TONE`)

### Every node has the same frame

`NodeFrame` draws a 2px top edge in the item's hue, a header washed at 16% of it, the
`surface-800` body, an `accent-hover` border on hover (DS-HOVER) and an accent ring when selected.
The header holds, in order: the fold caret, a duotone glyph for the role, the title and subtitle,
any chips, the node's actions, and the Show in properties button, which appears on hover.

- the title names the role in the reader's words: the emitter's name, the field as the inspector
  labels it (`fieldAlias`, `emitterLabel`), or a driver's role such as Constant or Add
  (`itemTitle` in `utils/nodeText.ts`)
- the subtitle names the class, and its hash where nothing names it
- a value node names only its kind, because the socket it feeds already names the field
- a port label is a field path with its holders dimmed, so the field it ends in reads first
  (`PortLabel` in `components/GraphNodes.tsx`)
- the glyph tells a column of nodes apart: a sparkle for an emitter, an hourglass, wind, brush or
  polygon for a component's slot, a cube, list or braces for a struct's shape, a sphere for a
  material, and a number, wave, dice or function for a driver

### Unconfirmed readings are marked

A driver the registry reads on an unconfirmed reading carries an `inferred` chip, and one it
cannot evaluate an `unsupported` chip, each with a hint on hover. A class the registry does not
know draws as a generic node listing its fields and their types (`UnknownFields` in
`components/DriverBody.tsx`). Reading and compiling never throw (decision 2.4 of the plan).

**Why.** A preview built on a guess looks as convincing as one built on the binary. The chip is
the only place a reader learns the difference.

### A fixed line height, and sizes known before drawing

- a header is 48px, a value node's header 30px, and every line 30px (`LINE_HEIGHT`)
- no row opens in place (`NO_FOLD` in `components/FieldLines.tsx`), since a struct is a node of
  its own
- `sizeOf` computes each node's height from its content before anything draws, and estimates its
  width from its text, 232 to 440px per column. A struct node measures its own name column,
  144 to 248px, and shares the column's CSS variable with the inspector's `FieldRow`.
- a row whose read has not landed draws its name dimmed in the line it will fill (`NoteLine`)

**Why.** The layout places every node once. A read that lands later fills a line that is
already there, so nothing on the board moves under the reader.

### Two levels of detail, switched by zoom

Under a zoom of 0.6 (`FAR_ZOOM` in `components/ZoomDetail.tsx`) a node's rows are too small to
read, so:

- a plate covers the node with its most useful face: a curve, a colour band, a random span or a
  constant's value, and otherwise its title. The text is 15 screen pixels, shrunk only to fit
  (`plateFace` in `components/PlateFace.tsx`).
- a node whose body is a picture, such as an emitter's surface, a file, a spawn shape or a
  material, keeps its picture and sets its title above its top edge
- an embedded value draws its own plate over its row (`RowPlate`)
- an emitter frame's title is 20 screen pixels, so the board reads by emitter
- edges keep their screen width at every zoom (`vectorEffect: "non-scaling-stroke"`)

The zoom reaches the nodes as the CSS variable `--graph-zoom` and the `data-detail` attribute, so
scaling a plate re-renders nothing. Only the live readouts listen for the threshold
(`useFarZoom`), and they stop following the run under it.

### Edge animation and emphasis

- an edge animates when its source changes over time: a keyed or random value, a random driver,
  or a curve driver with more than one key (`changesOverTime` in `components/graphEdges.ts`).
  Every other edge is still.
- edges into the preview rest at 35% opacity, since they cross the whole board
- wires run at right angles with 8px rounded turns, and leave a socket by 16px before turning
- the edges into one node turn in separate lanes across 15% to 85% of the gap, ordered so no
  edge crosses a neighbour's run (`utils/edgeLanes.ts`)
- a disabled emitter, and one hidden by mute or solo, is dimmed

## 4. Showing and editing values

### One editor, one edit

A node's rows are the inspector's own components: `FieldRow`, `ValueCell`, `RowValue`,
`PrimitivePicker` and `DefaultProperty`. An edit on a node is the same edit, with the same
validation and the same single undo step, as in the inspector. A text or number field commits on
blur or `Enter` (BIN_EDITOR.md, "What an edit is"). Header switches such as an emitter's
`disabled` send the inspector's edit too (`components/EmitterToggle.tsx`).

The graph adds gestures, such as plugging a socket or a drop from the content tree. It has no
value editor of its own.

**Why.** Two editors for one value drift apart in rounding, validation and undo. One editor keeps
every surface of the object tab in agreement.

### A reference shows what it points at

An input row names what feeds it, not only that something does (`inputSummary`,
`driverSummary`):

| Input             | The row shows                                    |
| ----------------- | ------------------------------------------------ |
| A constant driver | Its value and its role, such as `1  Constant`    |
| A keyed value     | Its key count, or its random range least to most |
| A struct          | Its class                                        |
| A list or a map   | Its item or entry count                          |
| A file            | Its file name                                    |
| A Texture node    | Its texture's file name                          |
| A material        | A sphere glyph and the material's class          |

A number is written bare, a vector in parentheses, each to at most three decimals with trailing
zeros dropped (`formatValues`).

### How a value is drawn

- a keyed value draws a line per channel over the window 0 to 1, as the curve panel does
- a colour draws a band over a checkerboard, so its alpha shows
- a random value draws the span it draws from, least to most: a bar per channel where its base
  holds still, and a band across the life where the base is keyed (`RangePicture`)
- the same drawing serves every size: the one-line strip in a socket, the value node's body, the
  far plate and the curve dock (BIN_EDITOR.md, "The random spread" and "Where a curve is drawn
  small")

A click on a strip opens the dock on that row, and selecting a value node aims the dock at it.

### A keyed value reads at the run's playhead

- a curve carries a line at the run's time and a dot on each channel, and a colour band carries
  the line alone (`components/CurveMarker.tsx`)
- the value node's header reads the value there, numbers in the accent or a colour as a swatch
  (`components/LiveValue.tsx`)
- the time is the curve pane's: the emitter's life ratio for a birth value, and the life ratio of
  the particle the run follows for any other
- nothing draws while no particle lives, and nothing for a random value with no keys, which has a
  different value per particle
- the marker moves by writing to the DOM on each run frame rather than by re-rendering the node

**Why.** The reader tunes a value against the preview beside it, so the node shows where the
preview currently is on the value.

### Adding a field does not write it

- Add field shows the field on its node at its class default, marked as pending, until an edit
  writes it (`PendingFields` in `utils/emitterGraph.ts`)
- Delete on a field's node, or Reset to default, removes the field, and the holder then reads its
  class default. The menu names this Reset to default, and Remove item for a list or map item.
- a new list item takes the class of the list's last item
- a new emitter is named `Emitter1`, `Emitter2` and so on, the first name no emitter holds

**Why.** The file keeps only what the author chose. A field written at its default would look
authored and would stop following the game's default.

### Plugging into a constant keeps its value

A value row holding a constant has a hollow socket. A click on it, or a drag out of it that ends
on the canvas, offers what can plug in: a Curve, flat at the constant's level, or a Random range,
with both ends on the constant (`components/EmptySocket.tsx`). The preview does not change until
the reader edits the new curve or range.

## 5. Interaction

### Keys and pointer

| Input                                 | Does                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Drag on empty canvas                  | Pans. Shift draws a selection box                                               |
| Wheel                                 | Pans. `Ctrl` with the wheel, a pinch or the controls zoom, and fit caps at 100% |
| Click, with Shift or Ctrl             | Adds a node to the selection                                                    |
| `Ctrl+A`, `Escape`                    | Selects every node, selects none                                                |
| `Tab`, `Shift+A`, double click canvas | Opens the quick add at the pointer                                              |
| `Delete` on one node                  | Removes its value, per section 4                                                |
| `Ctrl+D` on one node                  | Duplicates a list item, or the emitter of a master node                         |
| `Ctrl+C`, `Ctrl+V` on a master node   | Copies the emitter, pastes one after it                                         |
| Double click a node                   | Shows its row in Properties                                                     |
| Double click a frame header           | Fits the view to that emitter                                                   |
| Right click                           | The node's menu, led by the row's actions where it lands on a row               |

A handled chord stops at the canvas, because `Ctrl+D` also opens Diagnostics app-wide.

### The actions offered depend on the pointer's place

- the quick add lists the unwritten fields and the forces of the emitter under the pointer, or
  of the emitter picked alone, and always New emitter. Opened from an empty socket it lists only
  what plugs in there. Typed words match an entry's name or its group.
- a group heading's plus lists that group's unwritten fields, and an emitter header's plus lists
  the groups the emitter writes nothing of yet
- an action the document cannot take is not drawn: a read-only document shows no Add menu, no
  enable switch, and no forces or New emitter in the quick add

### Highlighting and folding

- hovering a node lights every path through it, its inputs and what it feeds, and fades every
  other edge to 20% (`chainThrough` in `utils/graphChain.ts`)
- one selected node fades the nodes off its paths to 40%. A group selected to move fades nothing,
  since the reader is arranging the board.
- a fold keeps the node it was asked on still on screen while the layout moves around it
  (`anchor` in `components/GraphCanvas.tsx`)
- Collapse others folds every other node of the same type, and Frame fits the view to a node and
  everything that feeds it
- the pane opens with emitters folded to their header and preview, materials folded to their
  header and shape, and a material's lists folded. A folded node counts its hidden inputs in a
  chip. Expand all leaves the material lists folded.

### The graph is one of several linked panes

| In the graph                                           | Elsewhere                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Pick a master node alone                               | The inspector and the outline open its emitter                             |
| Pick a value node alone                                | The curve dock aims at its row                                             |
| Hover any node of an emitter                           | The viewport draws that emitter's gizmo                                    |
| Spawn Shape node's Show shape switch                   | The viewport's one gizmo turns on for that emitter                         |
| Mute and solo on a master node                         | The same switches as the timeline lanes                                    |
| Choose an emitter in the viewport, timeline or outline | The graph selects its master node and centres it                           |
| Turn on the preview node                               | The viewport moves into the graph, and the Preview pane says where it went |

The graph only follows a choice made elsewhere. A choice it made itself, and the one it opened
on, leave the view where it is (`useGraphFollowsChoice` in `components/viewportLink.ts`).

### The board

- each emitter's tree sits in a frame titled with the emitter and its node count. A drag on the
  header moves the whole block, and the frame's body passes the pointer through, so a pan or a
  selection box can start inside it (`components/EmitterFrame.tsx`).
- the frames pack onto a board of about 16 by 10, each taking the lowest free place, so a short
  block fills the space beside a tall one (`utils/packBlocks.ts`)
- the preview node stands right of the board's top. It is off by default, and a control switches
  it on.
- the minimap fills each node with its type's hue

## 6. Node previews

- a node preview draws with the renderer's own code. An emitter's surface is the viewport's
  particle fragment pass, so layers, ramp, palette, erosion, alpha test and blend match
  (`components/SurfacePreview.tsx`). A trail draws its ribbon on a figure eight through the
  viewport's `Trails`, and a beam draws live.
- the surface shows the run's own particle at the transport's cursor, follows it until it dies,
  then takes the newest. The loop switch plays one particle from the emitter's first emission
  instead.
- a spawn shape draws as its analytic body, faint faces under crisp edges, and a point as a
  crosshair on a stem from the emitter's axes, with its size or place as a caption
- a material draws on a sphere, and a switch turns it to a cube, a plane or a cylinder
- where a preview departs from the game on purpose, a control says so: the distortion strip's
  switch draws the warp eight times stronger, because a particle filling the box covers far more
  of its screen than one in game
- one backdrop, stepped through dark, grey and light, serves every preview in the graph and in
  the inspector

**A failing preview does not stop the others.** Every preview is a view of one shared WebGL canvas. A
preview whose draw throws is hidden alone and shows its error on its strip
(`utils/frameGuard.ts`). The canvas stops drawing while the pane has no size, and the previews
are off while the pane is hidden.

## 7. Tensions and gaps

Found while writing this, against `12661b7e`:

1. **Width estimates still assume the mono face.** `MONO_ADVANCE` and its comment in
   `utils/driverLayout.ts` describe Geist Mono, but `65188dba` moved node labels to the sans face.
   Sans is narrower, so nodes come out wider than they need rather than truncating.
2. **The plan contradicts itself on dragging.** Decision 2.8 of
   docs/plans/shimmer-driver-graph.md says a drag moves a node for the session, which the code
   does. Its risks table says nodes do not drag.
3. **Two levels of editing on one canvas.** Classic emitter nodes support Add field, a class
   change, Delete and Duplicate. Shimmer driver nodes edit their leaves only, since tier E1 waits
   on section 5.1 of the plan. Nothing on a driver node says why its structure cannot be edited.
4. **Live values only on classic value nodes.** Driver nodes show no value at the playhead
   until tier E2.
5. **Read-only is mostly absence, with two exceptions.** Add menus and switches disappear in a
   read-only document, but a list's Add item line draws disabled
   (`components/StructureLines.tsx`). The quick add still opens and lists the emitter's unwritten
   fields, since `useFieldChoices` in `components/MasterAdd.tsx` is not gated on an edit, and a
   pick shows a pending field that can never be written.
6. **`Tab` opens the quick add.** With focus on a button inside the canvas, `Tab` opens the
   quick add rather than moving focus to the next control. Only fields are exempt
   (`typing` in `components/GraphCanvas.tsx`), so the keyboard cannot walk a node's buttons
   forward.
7. **`FOLDING` is defined twice**, in `components/GraphPane.tsx` and `components/GraphMenu.tsx`.
