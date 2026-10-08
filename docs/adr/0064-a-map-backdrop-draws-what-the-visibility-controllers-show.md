# ADR-0064: A map backdrop draws what the visibility controllers show

- **Status:** Accepted (2026-10-08)
- **Date:** 2026-10-08
- **Crates:** `ltk-manager-assets`, in `preview/map`. `ltk-manager-game`, in `map/controllers`
- **Related:** Amends
  [ADR-0045](0045-a-map-backdrop-draws-the-visibility-flags-the-reader-toggles.md), which filtered
  meshes by the layer mask only. Changes the buffer of
  [ADR-0044](0044-a-map-backdrop-ships-in-one-buffer.md) to `LTKM` v3.
  [LTKM visibility controller field](https://github.com/LeagueToolkit/ltk-manager/issues/659) is the
  change request.
  [A variant at mask 255 stacks in every layer](https://github.com/LeagueToolkit/ltk-manager/issues/653)
  holds the measurement.

## Context and problem statement

The backdrop drew a mesh if its layer mask shared a bit with the active flags. On Summoner's Rift
this draws several variants of the same ground at once: the Ocean dragon pit and the base pit, three
extra Baron pit stages and the base stage, and two copies of a ChaosRed ground. Each extra variant
has mask 255.

The field that separates the variants is `EnvironmentMesh::visibility_controller_path_hash`. It is
the path hash of an `IMapVisibilityController` object in the map's `.materials.bin`. Issue 653
inferred the controller rules from the data. This ADR records the rules of the 16.16 client
(`16.16.8042073`) and replaces the inferred ones.

## Client behavior

**A controller replaces the layer mask.** The `.mapgeo` loader reads the controller hash in file
version 15 and later. The loader handles a mesh as follows:

- If the hash is not zero, the controller with that hash decides visibility. The layer byte is not
  used.
- If the hash is zero and the layer byte is not `0xFF`, the loader creates a
  `LegacyVisFlagVisController` for the byte. The mesh is visible while the byte shares a bit with the
  active flags.
- If the hash is zero and the layer byte is `0xFF`, the mesh has no controller and is always drawn.

A placeable follows the same rule with its `VisibilityController` link and its `mVisibilityFlags`.

**Each controller class has one visibility predicate.**

| class                              | visible when                                                              |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `0xe07edfa4`, unnamed              | its state byte is set. The initial state is `DefaultVisible`              |
| `0xc406a533`, extends `0xe07edfa4` | same as the base class                                                    |
| `0xec733fe2`, extends `0xe07edfa4` | same as the base class                                                    |
| `ChildMapVisibilityController`     | the number of visible parents satisfies `ParentMode`                      |
| `LegacyVisFlagVisController`       | `VisFlags` shares a bit with the active flags                             |
| `MutatorMapVisibilityController`   | always. The loader creates resources only if the game applies the mutator |
| `LogicDriverVisibilityController`  | a driver object that the controller holds returns true                    |
| `0xf9cfefd4`, unnamed              | always. Its resource predicate was not decompiled                         |

`0xc406a533` has the field `0x27639032`, a layer mask. `0xec733fe2` has the field `0x8bff8cdf`, a
stage mask. The loader tests each against a byte of the game state to decide whether to create the
resources of the meshes under the controller. Neither field is the visibility state.

`ParentMode` values: 0 requires all parents visible, 1 requires at least one, 2 requires exactly
one, 3 requires none. A child with no parents is visible in modes 0 and 3. A child with any other
value is never visible.

A server packet sets the state byte of a `0xe07edfa4` controller by name. No file records when an
elemental terrain or a Baron stage becomes visible.

## Decision

**`LTKM` v3 adds the controller hash to the mesh record.** It is a `u32` at the end of the record.
The record grows from 36 bytes to 40.

**`read_map` returns every controller that the map's `.materials.bin` declares.** Each controller
has its path hash and one rule: `named`, `child`, `layer`, `mutator` or `driven`.

**The frontend evaluates the rules under the active flags and applies the client's rule.** A mesh
or a placeable with a controller is drawn if the controller is visible. Without a controller, the
layer mask is tested against the active flags, and mask `0xFF` is always drawn.

**A terrain controller is visible while a layer in its mask is active.** The backdrop has no
server, so the active layer flags set the state instead of the packet. On Summoner's Rift, 373 of
the 383 meshes under a terrain controller have a layer mask equal to the controller's
`0x27639032`. The other ten have mask 255 or 127. A Baron stage controller has no layer mask, so
its state stays at `DefaultVisible`.

**A `mutator` controller and a `driven` controller are not visible.** No mutator is applied in a
preview, and a driver is not evaluated. A placeable under one of these controllers is treated as
an event, as before this change.

**A controller hash with no declared controller has no state.** For a mesh, the layer mask is
used. This is how a map is drawn before its model is loaded, and how a map without a
`.materials.bin` is drawn. A placeable with such a hash is not drawn.

**A map's visibility is listed in a Visibility pane of the map shell.** The pane is a tab behind
the outliner. The map file tab shows the same list in the panel beside the map. A skin's
viewport has no map shell, so its backdrop shows the list in a popover on the viewport controls.
The flags and the overrides of a map shell are state of the map scene, so the preview and the
pane read one value.

**The list shows a layer if activating only that layer changes which meshes are drawn.** The triangle count of a layer is the number of triangles drawn when it is the only active
layer.

**The list shows every controller, and the reader sets the state of the ones that are not
children.** A controller is shown by its name if a hash table resolves its `name` hash or its
object path, and by its path hash if not. A controller that is not a child has a checkbox and is
listed in the group of its kind: Terrain, Stage, Mutator or Other. A state that the reader sets
is an override. The rule of an overridden controller is not evaluated. An override that equals
the computed state is removed, so the stored overrides are only the states that differ. The
reset returns to the opening flags and removes every override.

**A child controller is listed under each of its parents and has no checkbox.** Its state is
computed from its parents. The row has a plus if the child is in mode 0, 1 or 2, where the
parent being visible counts toward showing it, and a minus if it is in mode 3, where the parent
being visible hides it. An eye shows its current state. A child whose parents are all undeclared
is listed in Other. In the Visibility pane a row opens the controller object in its own tab,
where its fields are edited.

**The backdrop keeps its materials when the visibility changes.** A visibility change rewrites the
draw groups of the geometry. The materials are built once for every submesh of the map. Rebuilding
them on each change disposed the old materials, which deleted their shader programs and compiled
every program again.

**The opening flags and the subject's origin use the layer masks only**, as ADR-0045 defines them.
Neither changes when the controllers are loaded.

## Consequences

- Summoner's Rift under layer 0 draws 188 meshes. The mask rule drew 210. Of the five stacks in
  issue 653, the backdrop draws `Ground_D4_DragonPit_A`, `Ground_B2_BaronPit_A`, the mask 1
  `Ground_C2_ChaosRed_A`, `Chaos_Baron_A` and `Chaos_Baron_B`. It draws none of their eleven
  variants. The only drawn meshes whose bound centres are within 100 units of each other are three
  grass meshes. This was measured by running `base_srx` at `16.20.8248524` through the encoder, the
  controller read and the frontend rule. The mesh indices at 16.20 differ by one or two from the
  indices in the issue.
- Activating the layer of a terrain hides the base terrain, because the base terrain is a child in
  mode 3 of the six terrain controllers.
- A mesh with mask `0xFF` and no controller is drawn when no layer is active, and it adds no entry
  to the layer list. A map whose meshes all have mask `0xFF` and no controller, such as Howling
  Abyss and Arena, has no layer entries.
- A mesh with a visible controller is drawn regardless of its mask. The base dragon pit is drawn
  when layer 1 is not active.
- The two Hall of Legends meshes of Summoner's Rift are not drawn, because their mutator is not
  applied.
- The frontend reader rejects a version 2 buffer. The `ltk-asset` scheme encodes the buffer on each
  request and no version 2 buffer is stored.

## Unknowns

- No object of `base_srx.materials.bin` is a `LogicDriverVisibilityController` or a `0xf9cfefd4`.
  Which maps declare these classes, and what those maps draw by default, was not measured.
- The packet that sets the state of a named controller was located but not decoded. The order in
  which the server shows terrains is not known.
- The result was measured on the decoded data. It was not checked on screen.
