# Shimmer Driver Graph — Implementation Plan

> Status: **draft, D0, D1, D2 (inferred), E0 and E3 built** (2026-09-26). Section 1 is evidence gathered the same day against
> this repository at `318d102a`, the league_structs reversing notes (16.13 to 16.17 clients), the
> LTK meta dataset of 2026-09-21 (16.19.8207193) and a census of the 16.19 live install. Section 2
> is proposed and needs the maintainer's decision. Section 5 is reverse-engineering work that gates
> every tier past D1 and the editing tier E1.

A shimmer emitter does not hold its values as `ValueFloat` curves. It holds them as graphs of
driver nodes: a `VfxFloatDynamicProperty` points at an `IVfxFloatDriver`, which may be a constant,
a sum of other drivers, a sine of a time driver, a read of a particle property, and so on. The VFX
preview cannot draw a shimmer emitter until something evaluates those graphs.

Scope is the evaluator: reading a graph, compiling it, and evaluating it against a context the
caller supplies. It is also the editor that draws a graph as nodes and edits it (decision 2.8,
tiers E0 to E2). The component runtime that calls it (lifetime, physics, render and geometry
components) is the consumer. Section 4.6 lists what the consumer needs and what it must provide,
and the runtime itself gets its own plan.

## 1. Current state

### 1.1 The repository

| Piece              | Where                                              | Shape                                                                                                                                                          |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The system read    | `crates/ltk-manager-core/src/vfx/resolve.rs`       | `resolve_system` returns every struct as `VfxValue::Struct { class_hash, fields }`. Driver nodes arrive as ordinary structs, so the graph needs no Rust change |
| The emitter lists  | `engine/parsing/readVfxSystem.ts`, `EMITTER_LISTS` | `complexEmitterDefinitionData` and `simpleEmitterDefinitionData`. `shimmerEmitterDefinitionData` (`0xeb0aabeb`) is not read                                    |
| Legacy values      | `engine/parsing/readValue.ts`, `curve()`           | `ValueCurve { constant, keys, tables }`                                                                                                                        |
| Legacy sampling    | `engine/utils/sampleCurve.ts`                      | `sampleCurve`, `drawCurve`, `drawCurveInto`. Writes into a caller's `Float32Array` without allocating                                                          |
| The particle store | `engine/simulation/pool.ts`                        | Fixed typed-array columns, 32,768 rows for a root pool                                                                                                         |
| The step           | `engine/simulation/integrate.ts`, `stepEmitters`   | `emit` then `integrate` per emitter, on a seeded `Rng`, stepped by `fixedRateStepper` at 30 Hz                                                                 |
| Material previews  | `crates/ltk-manager-core/src/material/mod.rs`      | `MaterialPreview` per linked material. Shipped shimmer render components embed their `StaticMaterialDef` inline, and no preview is built for an embed          |
| Logic drivers      | none                                               | Nothing in the repository evaluates an `ILogicDriver` tree. #677 covers `dynamicMaterial` drivers                                                              |
| Structural edits   | `bin_document/property_edit.rs`, `ValueEdit`       | `EnsurePointer`, `ReplacePointer` (a class swap that keeps each field both classes declare), `InsertItem`, `RemoveItem`, `SetLeaf`. A batch is one undo step   |
| The curve dock     | ADR-0032                                           | A dock under the object tab. A mark on an inspector row targets it, and the target follows its field from emitter to emitter                                   |
| A node canvas      | none                                               | `@xyflow/react` is not a dependency                                                                                                                            |

Paths under `engine/` are relative to `src/modules/workshop/bin/vfx/`. `bin_document/` is under
`crates/ltk-manager-core/src/`.

### 1.2 The engine

What the league_structs notes attest:

- The class tree: `IVfxBaseDriver`, four kind interfaces (`IVfxFloatDriver`, `IVfxVector2Driver`,
  `IVfxVector3Driver`, `IVfxVector4Driver`, the last also used for colour), and the four
  `Vfx*DynamicProperty` wrappers that embed a driver pointer in a component
  (`VfxDriverGraph.md`).
- **In 16.13 no driver can be evaluated.** Every driver vtable holds a destructor, `getMetaClass`,
  a cast and three stubs. There is no evaluate method (`VfxDriverGraph.md`, "Binary confirmation").
- **In 16.17 the component emitter path is live.** The system prepares the graph, runs the
  components in a fixed order each update and spawns through them (`VfxShimmerEmitter.md`
  sections 3, 5 and 7). Particles are rows of floats addressed through a per-emitter channel
  table (`VfxDrawPaths_Round7.md` section 4.1).
- **No note traces whether 16.17 or later evaluates the drivers, or which code does.** The
  component drivers the notes name are the runtime objects the five slots produce, not
  `IVfx*Driver` nodes.

The first question of this plan is therefore open: what the engine does with a driver graph
today. Section 5.1 answers it before anything past D1 is built.

### 1.3 Shipped data

A census of every WAD in the 16.19 live install finds driver nodes in `Map11.wad.client` only,
all under the 80 Hall of Legends cube-grid shimmer emitters. The emitters hold 420 graphs: 280
`VfxFloatDynamicProperty`, 120 `VfxVector3DynamicProperty` and 20 `VfxVector4DynamicProperty`,
each a wrapper over one node:

| Node                       | Objects | What they hold                                                                |
| -------------------------- | ------- | ----------------------------------------------------------------------------- |
| `VfxFloatConstantDriver`   | 200     | `-1` (140), `1` (40), `2` (20)                                                |
| `VfxVector3ConstantDriver` | 120     | `(1, 1, 1)` (60), `(180, 0, 0)` (20), `(0, 100, 0)` (20), `(10, 10, 10)` (20) |
| `0x1d04cfa7`               | 80      | a `ValueFloat` of constant `3` (20). The other 60 write no curve and read `0` |
| `0x7cc5a312`               | 20      | a `ValueColor` of constant `(0.554, 0.540, 1, 1)`                             |

No other node class ships, and no shipped curve leaf has keys. Every one of the 80 emitters sets `disabled`, and the engine never
builds a disabled shimmer emitter, so no shipped graph runs in game. The preview has to draw them
anyway to be useful, which section 4.6 covers.

### 1.4 Where graphs are consumed

76 live fields across the component classes hold a `Vfx*DynamicProperty` or a driver pointer:

| Consumer                                                     | Fields                                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifetime behaviours `0x7015f762`, `0x287a50ff`, `0xdbb4f634` | `EmitterDuration`, `particleLifetime`, `startDelay`, `IntroDuration`, `OutroDuration`, `LoopDelay`                                                                                       |
| Spawn behaviours `0x31beb841`, `0x3fd44d66`, `VfxBurstSpawn` | `EmissionRate`, `0x10498eed`                                                                                                                                                             |
| Physics modifiers                                            | `InitialScale`/`KeyedScale`, `InitialDrag`/`KeyedDrag`, `InitialRotation`, velocity, orbit, acceleration, noise, attraction, terrain and ground-collision fields                         |
| Emission sources                                             | `ShapeCenter`, `rotation`, `scale`, `BoxSize`, `radius`, `height`                                                                                                                        |
| `VfxMaterialRenderComponent`                                 | `Color.InitialColor`, `Color.ColorOverLife`, `Drivers.materialDrivers` (`Map<String, IVfxVector4Driver>`), `0x9999dd64` `InitialParameters`/`KeyedParameters`, UV animation `0x32952395` |
| Light component `0xb0cdad34`                                 | `lightColor`, `radius`                                                                                                                                                                   |

The names pair up: `InitialScale` with `KeyedScale`, `InitialDrag` with `KeyedDrag`,
`InitialParameters` with `KeyedParameters`, `InitialColor` with `ColorOverLife`. That reads as one
value evaluated at spawn and one evaluated over the particle's life. It is a reading of names, and
section 5.4 has to confirm it.

`materialDrivers` is keyed by shader parameter name, so a graph's output can become a material
uniform. That makes the evaluator an input to the render path as well as to the simulation.

## 2. Decisions (proposed)

### 2.1 The evaluator is TypeScript, beside the curve sampler

This follows decision 2.1 of `docs/plans/vfx-particle-renderer.md`: Rust resolves references and
TypeScript evaluates them. The module is `engine/drivers/`. Rust stays unchanged for the graph,
since `resolve_system` already hands every node over with its class hash.

### 2.2 A graph is read once, compiled once, then evaluated

Three stages:

1. **Read.** `readDriver(node: VfxValue)` turns a struct into a typed node of a discriminated
   union (`DriverNode`), through a registry keyed by class hash. Named classes key on
   `nameHash(name)`, unnamed ones on their hex hash.
2. **Compile.** `compileDriver(node)` resolves defaults, folds constant subgraphs, assigns random
   slots (decision 2.5) and returns an evaluator plus its variability (decision 2.3).
3. **Evaluate.** The caller runs the evaluator against a context (decision 2.7).

A compiled graph belongs to the emitter definition. An edit recompiles and swaps it, the way
decision 2.5 of the renderer plan swaps a definition and keeps the pool.

### 2.3 Every node has a variability

| Variability | Meaning                                                 | Sources                                                  |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `constant`  | The same value for the life of the definition           | constant nodes, and any subgraph of them                 |
| `emitter`   | Can change between updates, the same for every particle | time nodes, emitter properties, emitter random slots     |
| `particle`  | Can differ per particle                                 | particle properties, particle age, particle random slots |

A node's variability is the highest of its inputs'. The consumer decides when to evaluate (at
spawn, or each update). The variability tells it whether a value can change, so a `constant`
result is read once at compile time and an `emitter` result once per update rather than once per
particle.

### 2.4 Unknown and unverified semantics are data, not errors

Each registry entry declares its support level:

| Level         | Meaning                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| `attested`    | Behaviour read from the binary, or fixed by the node's shape (a constant) |
| `inferred`    | Implemented on a stated reading that section 5 has not confirmed          |
| `unsupported` | Not implemented. Evaluates to the kind's zero                             |

Reading and compiling never throw. Every `inferred` and `unsupported` node, and every class the
registry does not know, is reported as a diagnostic with its class hash and property path. The
inspector shows them on the emitter the way it shows `MaterialPreview.warnings`, so a preview that
depends on a guess says so.

### 2.5 Randomness draws from the system's seeded stream

The engine keeps an emitter-level random array seeded when the emitter starts and a per-particle
random block refilled at spawn (`VfxShimmerEmitter.md` section 7). The evaluator mirrors that:
compile counts the random slots a graph needs at each scope, the runtime fills particle slots at
spawn and emitter slots at restart, and both draw from the system's seeded `Rng` in a fixed order
(renderer decision 2.6). `ShareRandom` maps a node to a shared slot rather than its own.

### 2.6 Evaluation writes into the caller's buffer

```ts
type Evaluate = (context: DriverContext, out: Float32Array, at: number) => void;
```

The same shape as `drawCurveInto`, so a step allocates nothing. A batch form that evaluates a
`particle` graph over a range of pool rows is deferred until a profile asks for it. Every shipped
graph folds to a constant or to one curve sample, so the scalar form is enough for D0 to D3.

### 2.7 The context is an interface the runtime implements

```ts
interface DriverContext {
  readonly now: number;
  readonly emitterAge: number;
  readonly emitterPhase: number;
  readonly particle: ParticleSample | null;
  readonly randoms: Float32Array;
  property(kind: PropertyKind, id: number, out: Float32Array, at: number): void;
  logic(node: LogicNode, out: Float32Array, at: number): void;
}
```

The evaluator never reads the pool or the component runtime directly. Tests build a context from
literals, and the component runtime builds one per update over its own state. `particle` is null
for an emitter-scope evaluation, and a `particle` graph evaluated without one reports a
diagnostic and reads zeros.

### 2.8 The editor is one node canvas per system, on React Flow

A driver graph is a typed expression: each node has named inputs of a known kind and one output.
Nested pointers read poorly as rows past two levels, and a node canvas shows the same tree with
every input labelled. The canvas is `@xyflow/react` (React Flow 12, MIT). Its nodes are React
components, so a node's fields reuse the inspector's controls and the design tokens.

| Part      | Proposal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope     | One canvas per system: every shimmer emitter, each fed by its components, each component fed by the driver graph of every dynamic property under it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Host      | The Graph pane of the particle shell (ADR-0034), opened from the Panes menu beside the Preview pane                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Sink      | The live preview is the rightmost node, shown from the canvas controls and off by default. While shown, the one viewport moves into it, and the Preview pane says where it went                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Layout    | Each emitter's tree is one block, inputs to the left of their node, and each block takes the lowest free spot on a board of the pane's shape. The preview stands right of the board's top, and an emitter's edge to it leaves the emitter's top edge. A drag moves a node for the session only, since the bin stores no positions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Frames    | Each emitter's block sits in a frame, a React Flow parent node named for the emitter. A drag on its header moves the emitter and everything feeding it, and a child dragged past its edge grows it. The frame body passes clicks through, so a pan, or a selection box with Shift held, starts inside it. Under a zoom of 0.6 its title keeps a fixed screen size                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Folding   | An emitter or a component folds away everything feeding it. A complex or simple emitter opens folded to its header and preview                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Zoom      | Under a zoom of 0.6 a node's rows are too small to read, so a plate in the node's hue covers it with its curve, colour band or value, or else its title at 15 screen pixels, shrunk only to fit the node. An emitter keeps its preview and sets its title over its top edge, and a file or spawn shape keeps its picture alone. Edges keep their screen width at every zoom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Files     | A file an emitter names is a node that previews it by extension: a texture's picture, a mesh turning in 3D, or a note. A file under a struct draws on the struct's node instead, except `textureMult`'s, `alphaErosionDefinition`'s and `distortionDefinition`'s, whose nodes draw the emitter's surface. A spawn shape draws as an analytic body in 3D, faint faces under crisp edges: a box, sphere or cylinder as itself, a legacy shape as the box its births span through the engine's own shape sampler, with each emit rotation's axis as a line and the arc its angle sweeps. A short list of leaves or keyed values, such as the rotation angles and axes, draws in its socket as its rows until the reader pops it out, and a point as a crosshair on a stem from the emitter's axes, with the size or the place as a caption. Its header switch opens its emitter and turns the viewport's gizmo on, which draws the same body placed through the live spawn frame, so the node and the viewport share one gizmo |
| Folding   | A struct whose one field holds another struct draws that struct as a section of its own node, so a pointer chain such as `primitive` over `mMesh` reads as one node                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Reveal    | A double click, or the node's Show in properties button, reveals the row the node stands for in Properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Ports     | One per input field, typed Float, Vec2, Vec3 or Vec4, each kind a colour of the `socket` token scale. A connection is valid only between matching kinds. A `params` list draws one port per entry and a spare port that appends one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Component | A component node reads as a small inspector: each struct it holds heads a section, each list item a section under its list, each field edits in place, and each dynamic property is an input where it sits, with its driver's value or role beside it. Its glyph names the slot: lifetime, physics, render or geometry. A `StaticMaterialDef`, or a `VfxMaterialContainer` or a classic emitter's `VfxMaterialDefinitionData` holding one, is a material node of its own on an input, linked or not, and opens folded to its header and a preview of the material on a sphere, which a switch on the preview turns to a cube, a plane or a cylinder. Its parameters, samplers and switches are lines of that node, one per item, rather than nodes of their own                                                                                                                                                                                                                                                             |
| Embedding | A driver whose body is one value line, a constant or a curve with no keys, draws inside the socket it feeds with its value edited in place, and has no node or edge. A button beside it pops it out to a node, and the node's header button embeds it back. A driver the registry cannot read always keeps its node                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Node body | The node's leaf fields (a constant's value, a clamp's bounds, an enum) as inline controls. A curve leaf draws its curve small and opens it in the curve panel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Support   | Each node carries its registry level from decision 2.4. `inferred` and `unsupported` nodes are marked on the canvas, and an unknown class draws as a generic node with its class hash                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Values    | Once the evaluator runs, a `constant` or `emitter` node shows its value at the preview's current time. A `particle` node shows none, since it has one value per particle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Palette   | The families of section 3, each class under its readable name, with the class hash for an unnamed one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Recording the Graph pane is a maintainer decision: an amendment to ADR-0034, or an ADR of its own.

### 2.9 Complex and simple emitters draw as one node each, with inputs for their structs

A complex or simple emitter has leaf fields, and struct, pointer, list and map fields under
them. The canvas draws one node per emitter for its leaf fields, and one node per struct field,
connected to that field's input on the emitter node.

| Part           | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emitter node   | The emitter's leaf fields under the inspector's group headings (`emitterGroups.ts`). Each is drawn by the inspector's `FieldRow`, so an edit is the same undo step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Field list     | The fields the file writes. Each group ends in an Add field picker listing the class's unwritten fields of that group. A picked field shows its default value until it is edited                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Value classes  | A `Value*` with no dynamics is a leaf and is edited on the emitter node. One with keys or probability tables is a curve node on the field's input, and opens in the curve panel. A random value draws as the span it draws, least to most as the curve panel reads it: a bar per channel where its base holds still, and a band across the life where its base is keyed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Struct nodes   | Every struct, pointer, list and map the file writes is a node on its field's input. It lists its own leaf fields, and its own struct fields are nodes on its inputs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Class change   | A pointer node's first line picks its class from the classes the pointer can hold, as `ReplacePointer`, which keeps the fields both classes declare. An unset pointer added by Add field shows the same picker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Primitive      | The primitive's node picks its class from the inspector's primitive select, grouped by family, and draws the inspector's sketch of it over its rows in place of a file preview                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Linked objects | A struct the resolver read from another object is a leaf field, since its fields belong to that object                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Preview        | Each emitter node draws its texture as one particle renders it, in a square under its header: the particle fragment of the viewport's quads, so the layers, colour ramp, palette, erosion, alpha lock, alpha test and blend are the viewport's, at the particle's aspect. The particle is the run's own at the transport's cursor, one followed until it dies and then the emitter's newest, and the square is empty while none lives. The canvas controls' loop switch plays instead one particle born when the emitter first emits, reborn each life and lingering after it where its emitter lingers. A distorting emitter bends a grid. A strip under the square shows the life as a bar, tiles the texture around the particle, switches between the texture layers and, for a distorting emitter, draws the warp eight times stronger, since a particle filling the square covers far more of its screen than one in the game. A trail is not one particle's quad, so its node draws a flat swatch through the viewport's own ribbon draw: the ribbon laid on a figure eight seen head on, its points born at even steps and left where they were born, each drawing its own chance unless the run pins one, sized by the ribbon's widest point and spanning 60% of the path over one life, with no world acceleration or cutoff. A mesh draws its surface as a quad does, since its shape is the Render Primitive node's picture, and a strip switch draws the mesh itself in 3D, framed on the mesh's reach times each particle's scale. A beam draws the emitter itself through the viewport's own draw, under a camera that follows its live particles and eases out faster than in. The bar of either holds the emitter's life. A `distortionDefinition` node draws the same surface and opens with the warp magnified. An `alphaErosionDefinition` is no node of its own: the Texture node draws its fields as a section under its rows, takes over its inputs, and its surface dissolves by the erosion's drive where the emitter sets one and draws plainly where it does not. The Texture node draws it with the texture layer alone and the `textureMult` node with the secondary layer alone, each without the layer switch, and a trail's swatch takes the same layer. The canvas controls and the inspector's preview step every preview's backdrop through dark, grey and light, grey first. Every preview is a drei `View` of one canvas over the pane, so the nodes share one WebGL context, and the canvas stops drawing while the pane has no size. Previews draw with the hand-written materials whatever the shaders switch says, since a translated program in the previews' second WebGL context fails and stops the canvas. A preview whose draw throws is hidden alone, and its strip shows the error |
| Sizes          | Every line of an emitter or struct node is one row tall, and no row expands in place, since struct fields are separate nodes. The layout knows each node's height before it draws                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## 3. Reference: the node catalogue

92 live classes descend from the four kind interfaces in the 16.19 dataset. One of them,
`IVfxRandomDriver`, is an interface. Six are removed and are not read: the three
`Vfx*EasingDriver` vector classes, `VfxRenderParamVector4Driver`, `VfxScaleColorRgbaDriver` and
`VfxVector4PropertyDriver`. Classes added in 16.18 (14) and 16.19 (4) are marked `new`.

| Family              | Classes                                                                                                                                                                                                              | Proposed evaluation                                                                     | Level       | Unknown                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------- |
| Constants           | `VfxFloatConstantDriver`, `VfxVector2ConstantDriver`, `VfxVector3ConstantDriver`, `VfxColorConstantDriver`, `VfxColorRgbConstantDriver`                                                                              | the stored value                                                                        | attested    | nothing                                                           |
| Wrappers            | `VfxFloatDynamicProperty`, `VfxVector2DynamicProperty`, `VfxVector3DynamicProperty`, `VfxVector4DynamicProperty`                                                                                                     | the held driver                                                                         | attested    | what a null driver reads as                                       |
| N-ary math          | `VfxAdd*`, `VfxMultiply*`, `VfxMin*`, `VfxMax*` over four kinds (`params` list)                                                                                                                                      | fold over `params`, component-wise                                                      | inferred    | an empty `params` list                                            |
| Unary math          | `VfxAbs*` (4), `VfxNormalizeVector2Driver`, `VfxNormalizeVector3Driver`, `VfxLengthVector2Driver`, `VfxLengthVector3Driver`                                                                                          | the named operation                                                                     | inferred    | normalizing a zero vector                                         |
| Clamp               | `VfxClamp*` (4): `Param`, `Low`, `High`                                                                                                                                                                              | component-wise clamp to the stored bounds                                               | inferred    | `Low > High`                                                      |
| Lerp                | `VfxFloatLerpDriver`, `VfxVector2LerpDriver`, `VfxVector3LerpDriver`, `VfxVector4LerpDriver`: `From`, `To`, `Factor`                                                                                                 | `From + (To - From) * Factor`                                                           | inferred    | whether `Factor` is clamped                                       |
| Scale               | `VfxScaleVector2Driver`, `VfxScaleVector3Driver`: `Vector`, `ScaleFactor`                                                                                                                                            | vector times scalar                                                                     | inferred    | nothing else                                                      |
| Divide              | by a scalar: `0xd6738324`, `0x168d2f0d`, `0x95182f0a`, `0xff2348d3`. Component-wise: `0x997d54ab`, `0x64707da8`, `0xa995ecc5`                                                                                        | quotient                                                                                | inferred    | division by zero                                                  |
| Compose             | `0x399295b9` (X, Y), `0x65e1b9a2` (X, Y, Z), `0x3624c20b` (X, Y, Z, W), `0x791d4f88` (xy, Zw), `VfxColorRgbaDriver` (Rgb, Alpha)                                                                                     | build the vector from its parts                                                         | inferred    | nothing else                                                      |
| Broadcast           | `0x9a2d73f2` (to Vec2), `0xdef9bfd5` (to Vec3), `0x7c387678` (to Vec4)                                                                                                                                               | the float in every component                                                            | inferred    | nothing else                                                      |
| Extend `new`        | `0xe3a77546` (Vec2 to Vec3), `0x9c5c4342` (Vec3 to Vec4), `0x14daebe5` (Vec2 to Vec4), each with a stored `0xb1ea6248`                                                                                               | the input with `0xb1ea6248` appended                                                    | inferred    | where the stored part goes                                        |
| Select              | `VfxFloatFromVector4Driver`, and `new`: `0x1a95dbf`, `0x799a50ac`, `0xdab8397c`, `0xfd9b311`, `0x76c70374` (`Input`, `Select`)                                                                                       | pick components by `Select`                                                             | unsupported | the `Select` enum                                                 |
| Compare `new`       | `0xdfe3528c`, `0xc2685905`, `0x1d708462`, `0x4b5aa9eb` (`Left`, `Right`, `Comparator`)                                                                                                                               | none yet                                                                                | unsupported | the `Comparator` enum and what the node outputs                   |
| Curve leaves        | `0x1d04cfa7` (ValueFloat), `0x3eb74cbe` (ValueVector2), `0x2d42ea41` (ValueVector3), `0x44852d75` (ValueColorRgb), `0x7cc5a312` (ValueColor), each with `frequency`, `looping`, and `ShareRandom` on the vector ones | sample the held curve with `sampleCurve`, and draw its tables with `drawCurve` at spawn | inferred    | the `frequency` enum, what `looping` wraps, the time input        |
| Factor curves `new` | `0x2959e51d`, `0x5ff9a600`, `0x7a39d82b`, `0xfc39b68c` (`Factor` and a curve)                                                                                                                                        | sample the curve at `Factor`                                                            | inferred    | whether `Factor` is normalized time                               |
| Random              | `0x414d1503`, `0xc5e53afa` (`Range`)                                                                                                                                                                                 | a slot's unit draw mapped into `Range`                                                  | inferred    | which is per particle and which per emitter                       |
| Time                | `VfxFloatTimeDriver` (`Time`, default `7`, and `offset`), `VfxFloatSineDriver` (`Time`, `period`, `Remap`), `VfxFloatEasingDriver` (`EasingFunction`, `duration`, `frequency`, `looping`)                            | none until section 5.2                                                                  | unsupported | the `Time` and `EasingFunction` enums, the sine's phase and remap |
| Property reads      | `VfxPropertyFloatDriver`, `VfxPropertyVector3Driver`, `VfxPropertyVector4Driver` (a `U8` property id), `VfxEmitterVelocityDriver`                                                                                    | `context.property`                                                                      | unsupported | the three property enums                                          |
| Logic bridges       | `VfxFloatLogicDriver`, `VfxVector3LogicDriver`, `VfxVector4LogicDriver`, `0x93fdd326`, `VfxSwitchVector4LogicDriver`                                                                                                 | `context.logic` over the legacy `ILogic*Driver` tree                                    | unsupported | the `Source` enum, and a game state to read                       |
| Empty `new`         | `0x88406627` (Vec3, no fields)                                                                                                                                                                                       | none                                                                                    | unsupported | everything                                                        |

**The curve-leaf reading.** `0x1d04cfa7` and its siblings wrap a legacy value class, so the
proposal reuses the legacy sampler rather than inventing one. The legacy engine samples the same
`ValueFloat` type at particle age or at emitter phase depending on the field that holds it
(`CurveDriveParameter`, renderer plan section 3.4). The shimmer leaf moves that choice into the
node: D2 reads `frequency` as the engine's `VfxMaterialDriverFrequency` enum (`kPerEmitter = 0`,
`kPerParticle = 1`, from the league_structs enum dump), so a leaf samples the emitter's phase or
the particle's age by its own field rather than by its consumer. Every shipped leaf is `0` and
constant, so the reading changes no shipped value. The 16.19 factor-curve classes read like the
same leaf with an explicit time input, which supports the reading without proving it.

## 4. Tiers

Each tier leaves the evaluator tested and the diagnostics accurate. Nothing past D1 starts before
section 5.1 answers. The editor tiers E0 to E2 follow decision 2.8 and run beside the D tiers,
each on the D tier it names.

### D0 — read, compile and the shipped nodes

- `engine/drivers/`: `DriverNode`, the registry, `readDriver`, `compileDriver`, `DriverContext`
  and diagnostics
- Constants, wrappers and the five curve leaves, with the leaves marked `inferred`
- Constant folding and variability
- Fixtures built from the 80 Hall of Legends emitters, read out of `Map11.wad.client` once and
  kept as `VfxValue` JSON beside the tests. The 420 graphs are 10 distinct ones, each written once
  with its count
- The census example of section 5.5

Exit: every node in shipped data reads and compiles with no `unsupported` diagnostic. Every
shipped graph folds at compile time. The 20 leaves holding a `ValueFloat` evaluate to the same
numbers `sampleCurve` gives for their curves. A synthetic keyed leaf covers sampling at the
particle's age and at the emitter's phase.

Built in `engine/drivers/` as `readDriver`, `compileDriver` and a registry of the four wrappers,
the five constants and the five curve leaves. `compileDriver` takes the consumer's scope, which
decides the time a keyed curve leaf samples and its variability. `DriverContext` holds the fields
D0 reads, and D2 to D4 add the random block, `property` and `logic`.

### D1 — pure math

The n-ary, unary, clamp, lerp, scale, divide, compose, broadcast and extend families. Each is a
few lines over `Float32Array` components, and its edge cases (empty lists, zero divisors, zero
vectors) follow section 5.3 once it answers. Until then each edge case returns the kind's zero
and reports it.

Exit: a table-driven test per family, and a folding test showing a folded graph evaluates the
same as the unfolded one.

Built as `OperatorNode` and `engine/drivers/operators.ts`, with the 52 classes of the nine
families in the registry, each marked `inferred`. An operator whose inputs all fold folds at
compile time. Each input evaluates into a buffer allocated at compile time, so an evaluation
allocates nothing. The edge cases that read as zero are an empty `params` list, a clamp whose
`Low` exceeds its `High`, a zero vector to normalize and a zero divisor component. Read reports
the first two as `emptyParams` and `inverseBounds`. The other two depend on evaluated values and
are not reported. `Lerp` leaves its factor unclamped. The Graph pane draws an operator with a port
per input, one per `params` entry, and edits a clamp's bounds and an extension's appended part in
place. The meta schema's defaults put the vector curve leaves at a constant of ones, which the
registry now follows.

### D2 — time, oscillators and random

`VfxFloatTimeDriver`, `VfxFloatSineDriver`, `VfxFloatEasingDriver`, the two random nodes and the
random slot allocator. Gated on the `Time` and `EasingFunction` tables of section 5.2 and the
random scope of section 5.3.

Exit: a seeded run reproduces the same values twice, and a hot swap that keeps the slot layout
keeps each particle's draws.

Built ahead of section 5, on the maintainer's call, with every class `inferred`:

- `VfxFloatSineDriver` is an operator: `sin(2 pi Time / period)` remapped from `[-1, 1]` to
  `Remap`, zero phase at time zero, and zero for a zero period
- `VfxFloatEasingDriver` eases from `Left` to `Right` over `duration` seconds, held at `Right`
  past the end or wrapped where it loops. `EasingFunction` reads as the engine's 34-member
  `EasingType` from the league_structs enum dump, with the standard Penner curves, and
  `frequency` as `VfxMaterialDriverFrequency`. `Easing`, a second `U8` with no known meaning,
  is reported when set
- The two random nodes map one unit draw into `Range`. Which draws per particle and which per
  emitter is section 5.3's question, so both follow the consumer's scope. Compiling hands each
  random node the next slot of its scope's block in walk order and reports the counts as
  `randomSlots`. `DriverContext` carries the emitter's block and `ParticleSample` the
  particle's, and `drawRandoms` fills a block from the system's seeded `Rng`
- `VfxFloatTimeDriver` stays unread: the `Time` enum is not in the dump

The curve leaves read `frequency` the same way, as section 3 describes.

### D3 — property reads

The three property drivers and `VfxEmitterVelocityDriver`, through `context.property`. Gated on
the property enums of section 5.2. The component runtime has to expose each property the enums
name, so this tier lands together with the runtime tier that provides the state.

### D4 — logic bridges

The four logic drivers and `VfxSwitchVector4LogicDriver`. They read gameplay state (spell rank,
buff counts and similar) through the legacy `ILogic*Driver` tree, which nothing in the repository
evaluates yet. This tier needs a preview game-state model, which #677 needs for `dynamicMaterial`
too, so the two should share one. Until then a logic node reads its authored default and reports
it.

### D5 — the 16.18 and 16.19 additions

Selects, comparators and anything later patches add. The registry already reports them as
`unsupported`, so this tier is driven by section 5.5: implement a class when shipped data first
uses it or when a user's file does.

### E0 — the read-only canvas

Needs D0. Nothing edits yet.

- `@xyflow/react` as a dependency, and `src/modules/workshop/bin/vfx/drivers/`: the node
  components, the tree layout and the mapping from a `DriverNode` to canvas nodes and edges
- The registry of D0 gains what the canvas draws per class: the output kind, the input ports
  with their kinds, and whether the class outputs a colour
- The inspector row of a dynamic property gains the mark that targets the dock, beside the curve
  mark
- Shimmer emitters listed in the inspector, disabled ones included, since every shipped one is
  disabled (section 1.3)

Exit: every Hall of Legends graph opens from its inspector row. The layout of a graph is the same
on every read, which a test over the fixtures pins. A class the registry does not know draws as a
generic node listing its fields.

Built as the Graph pane of decision 2.8. The graph is read out of the resolved system that
`readVfxSystem` answers, and `SchemaNames` gives that read the meta schema's names for the
classes and fields the hash tables leave unnamed. A constant's value and a flat curve leaf's
constant edit in place through the inspector's own field, where the file writes them. The
Graph pane shows the shimmer emitters that the emitter strip does not list.

### E1 — editing the graph

Needs E0 and D1, and section 5.1 answered. A graph the game does not evaluate is a file an
author cannot check in game, so authoring waits until the plan knows which nodes the engine runs.
Where 5.1 finds only some node types evaluate, the palette offers only those, and a file that
holds another keeps drawing it marked.

| Gesture                               | Edit                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Change a leaf in a node body          | `SetLeaf`                                                                                                                                                          |
| Swap a node's class (Add to Multiply) | `ReplacePointer`, which keeps the fields both classes declare                                                                                                      |
| Fill an empty input from the palette  | `EnsurePointer`                                                                                                                                                    |
| Append or remove a `params` entry     | `InsertItem`, `RemoveItem`                                                                                                                                         |
| Delete a node and its inputs          | `ReplacePointer` with no class, which leaves the input empty                                                                                                       |
| Wrap a node (Constant into Multiply)  | A new `ValueEdit` that moves a subtree into an input of a new node. `CopyItem` and `PasteItem` copy a subtree into a list, and no variant moves one into a pointer |

Each gesture is one `ValueEdit` batch and so one undo step. Every gesture is reachable from the
keyboard as well as the pointer, and edits in place on the canvas without a dialog.

Exit: each gesture round-trips through `BinDocument` in a Rust test and through the canvas in a
component test. A class swap between two n-ary classes keeps `params`.

### E2 — live values

Needs D2 and the component runtime tier that evaluates the emitter. Each `constant` and
`emitter` node shows its current value, which updates with the preview's playhead. A held edit
redraws the values downstream of it on every frame of a drag, the way a held material value does
for Hexshade.

Exit: a node's shown value equals the evaluator's result for the same context in a test, and
scrubbing the playhead changes the value of a time node.

### E3 — complex and simple emitters on the canvas

Needs E0. Decision 2.9, beside the shimmer emitters in the same Graph pane.

- `systemGraph` reads `complexEmitterDefinitionData` and `simpleEmitterDefinitionData` from the
  resolved system into emitter, struct and curve items. An emitter node reads its own rows, the
  same rows the inspector edits
- A pointer node's class picker reads `itemClasses` and sends `ReplacePointer`. Add field lists
  the class schema's unwritten fields of the group
- The context menu copies the class of emitter and struct nodes

Exit: every emitter of a system draws as an emitter node. A keyed value and a struct each draw
as a node on their field's input. A class change and an added field are each one undo step.

### 4.6 The consumer: what the component runtime needs

Not part of this plan, listed so the seam is designed for it:

- `readVfxSystem` reads `shimmerEmitterDefinitionData` into a `ShimmerEmitterModel` holding the
  component graph, with every dynamic property compiled
- The minimum to draw the shipped content: the lifetime behaviour `0x7015f762`, the spawn
  behaviour `0x31beb841`, `VfxModularPhysicsComponent` with the scale, rotation and velocity
  modifiers, `VfxMaterialRenderComponent` with its colour container, and `VfxGeometryComponent`
  with the shimmer mesh (`.gmesh`) and quad
- A material preview for an inline `StaticMaterialDef`, which is a Rust change in
  `crates/ltk-manager-core/src/material/`
- A way to preview a disabled shimmer emitter, since every shipped one is disabled and `emit`
  returns early for a disabled emitter
- The runtime writes into the existing `Pool` and reuses the existing mesh and quad draw paths.
  The engine's component draw loop mirrors the complex one (`VfxDrawPaths_Round7.md` section 1.1),
  so the draw side needs little new code. What differs is the spawn count (straight from the
  lifetime component, no accumulator or burst clamp) and the evaluation schedule of each field

The component semantics are as unverified as the drivers', so the runtime plan carries its own
section 5.

Until then a simple runtime stands in for it (`engine/shimmer/`). `shimmerParticles` places an
emitter's particles as a pure function of the run's time, so a scrub and a loop draw the same
frame a play does:

- The emitter starts after `startDelay`, spawns the burst `0x10498eed` at once or spread over
  `SpawnDuration`, and `EmissionRate` a second until `EmitterDuration` runs out. A negative
  duration or lifetime lasts for ever, and an emitter writing neither a burst nor a rate spawns
  one particle
- The lifetime behaviour `0xdbb4f634`, the one holding `LoopDelay`, starts over after its
  duration and `LoopDelay`
- Every emitter-scope property is read once at the emitter's start, so a rate that changes over
  the emitter's life is read at its first value
- A particle reads its initial properties at its birth and its keyed ones at its age. Its scale
  is `InitialScale` times `KeyedScale`, its colour `InitialColor` times `ColorOverLife`, its turn
  `InitialRotation`, and it moves by `InitialVelocity` under every acceleration field the
  modifiers write. Physics fields are gathered across the modifier list by name, the first
  writer winning. Drag, orbit, noise, attraction and rotation rates are not read
- Each emitter draws its newest 32 particles at most, each as the mesh with its own engine
  environment. The VFX preview evaluates at the run's clock and the map at the frame's time

The Hall of Legends cube grid is a burst of one with no lifetime, so it draws one mesh for ever
and its motion is its shader's. The emitters read are the complex list's that hold components, which the game
draws, and the shimmer list's where no complex one carries the same name, since the shipped
shimmer list keeps disabled copies. A `StaticMaterialDef` the render component embeds draws with
its translated passes, read by its object and property path, which is how the Hall of Legends
cube grid draws `Shaders/Particles/ShaderPreset/VFX_Uber_StaticMesh_Unlit`. A render component
that links its material instead, in its own `Material` or in the linked `VfxMaterialContainer`
`0x44ad896b`, draws the linked material's passes, read from the file the system read found it
in. A link into the system's own bin is inlined by the read and draws as an embedded one.

That shader's pixel stage writes a second target, `SV_Target1`, which is the frame colour
weighted by how far it rises past white: none at 1, all of it at 3. The frame colour itself
clamps to white on an 8-bit target, so the grid's purple is carried by the second target alone.
The preview draws each pass with a second target again on a glow layer, with the second target
at the only location a single target draws. That layer draws into a half-float buffer over the
scene's depth, and the buffer is blurred down five halvings with a dual filter and added onto the
frame after the warp pass. The engine's own bloom strength and radius are not read, so the
preview's glow is an estimate of the shape, not a measurement.

## 5. Evidence that precedes it

All of section 5 except 5.5 needs IDA with the `ida-pro-mcp` server against a current (16.19)
database, which the league_structs `lol-binary-re` skill describes. This machine has IDA Pro 8.3
without the server, and the newest local database is 16.1. The first task is getting that set up.

### 5.1 Does the engine evaluate drivers

In 16.13 the answer was no. Find the 16.19 vtables of `VfxFloatConstantDriver`,
`VfxAddFloatDriver` and `0x1d04cfa7`, and whether any slot past the cast now does work. Then find
the callers: the code that reads a `VfxFloatDynamicProperty` in a lifetime behaviour or a physics
modifier.

- If drivers evaluate, the evaluate slots are the reference for every tier.
- If the component code reads only some node types directly (a constant by cast, say), the
  evaluator implements exactly those, and the plan shrinks to match.

### 5.2 The enum tables

`FloatProperty`, `Vector3Property`, `Vector4Property`, `Time` (default `7`), `EasingFunction`,
`Select`, `Comparator`, `frequency` and the logic `Source`. Each is a `U8` whose meaning lives in
a switch or a table the evaluate code indexes. In 16.13 there was no such code, so they could not
be recovered then.

### 5.3 Edge cases

What a null driver pointer reads as, an empty `params` list, division by zero, normalizing a zero
vector, whether `Lerp` clamps its factor, and whether each random node draws per particle or per
emitter.

### 5.4 The evaluation schedule of each consumer field

For each field in section 1.4: evaluated at spawn, each update, or once at prepare, and with which
time input. This decides the variability the consumer asks for, and whether the `Initial` and
`Keyed` reading holds.

### 5.5 A census each patch

`crates/ltk-manager-core/examples/survey_drivers.rs` walks every WAD given and counts every
class under a `shimmerEmitterDefinitionData` list, beside `survey_vfx.rs`, which counts the fields
shipped emitters write. `--fixtures` writes the driver graphs the tests read. Rerun it each patch
and record which node classes ship. It is the input to D5 and the check that the fixtures still
match live data.

```text
cargo run -p ltk-manager-core --release --example survey_drivers -- \
  --fixtures src/modules/workshop/bin/vfx/engine/drivers/__tests__/hallOfLegends.fixture.json \
  "<install>/Game/DATA/FINAL/Maps/Shipping/Map11.wad.client"
```

## 6. Risks

| Risk                                                                      | Response                                                                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The engine still evaluates few or no node types                           | Section 5.1 runs first, and the tiers past D1 are built only for what it finds                     |
| An `inferred` node draws a convincing but wrong preview                   | Decision 2.4: every guess is a diagnostic the inspector shows                                      |
| The schema changes every patch (18 node classes added in 16.18 and 16.19) | Class-hash registry with an `unsupported` fallback, and the census of section 5.5                  |
| The editor authors a graph the game does not evaluate                     | E1 waits for section 5.1, and its palette offers only the node types 5.1 finds the engine runs     |
| Nodes laid out by hand would not survive a save                           | The bin stores no positions, so the layout is computed on each read and nodes do not drag          |
| A canvas costs render time beside the viewer                              | One canvas at a time, in the dock, over one field's tree. A shipped tree is a wrapper and one leaf |
| Per-particle closure trees cost too much on large pools                   | Shipped graphs fold to constants. The batch form of decision 2.6 waits for a profile               |
| No shipped graph runs in game, so no in-game capture can check a preview  | The Hall of Legends graphs are the only fixture, and an in-game check waits until Riot enables one |

## 7. Sources

- league_structs `docs/reversing/`: `VfxDriverGraph.md`, `VfxShimmerEmitter.md`,
  `VfxComponent_System.md`, `VfxDrawPaths_Round7.md`
- LTK meta wiki: `VfxComponents`, `VfxShimmerEmitterDefinitionData` and the shimmer primitive
  pages (LeagueToolkit/lol-meta-wiki PR #23), and the class dataset at 16.19.8207193
- A census of the 16.19.8217343 live install with `survey_drivers`, 2026-09-26
- `docs/plans/vfx-particle-renderer.md` decisions 2.1, 2.5 and 2.6, and section 3.4
- [ADR-0032](../adr/0032-a-curve-draws-in-a-dock-under-the-object-tab.md), the dock the editor
  opens in
- React Flow, <https://reactflow.dev/>, the `@xyflow/react` package
