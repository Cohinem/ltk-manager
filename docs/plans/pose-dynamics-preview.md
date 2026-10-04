# Pose dynamics and sockets in the skin preview

> Status: **D0, D1, D2, D4, D5, D6, D7, S1 and S2 built, D3 built in part, E0 run for the chain
> only** (2026-10-04). Written against this repository at `d10ed820`, the game client `16.18`
> for behaviour and the LTK meta dataset `16.19` for classes. Section 8 says what each stage
> holds and what is left.

The skin shell simulates the game's bone physics and resolves skin sockets. The reader marks
joints as simulated, changes a parameter, and sees the hair, cloth or tail swing, on the
animation and under the unit as the reader moves it. A socket is a place the reader can see
and attach effects to.

## 1. What the game does

Three features of `SkinMeshDataProperties`, described on the class pages of the LTK Meta Wiki:

| Feature        | Data                                                                          | What it does                                                                                                                           | Shipped     |
| -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Spring         | `rigPoseModifierData` -> `SpringPhysicsRigPoseModifierData`                   | One joint lags behind the unit's movement or turning and springs back                                                                  | 448 objects |
| Dynamics chain | `rigPoseModifierData` -> `DynamicsChainRigPoseModifierData`                   | Trees of joints simulated as particles: gravity, pull to the animated pose, collision, angle limit, optional rod constraints and links | none        |
| Socket         | `SocketDefinitions` -> `SocketDefinitionSingleJoint`, `SocketDefinitionWorld` | A named point that any lookup by bone name finds when no joint has the name                                                            | none        |

Facts that shape the design:

- **Order.** Animation, then the local pose modifiers sorted by kind (lock root orientation,
  synced animation, conform, joint snap, vertex animation, spring, joint orientation), then
  local to world, then the dynamics chains, then skinning. Sockets resolve on demand from the
  final pose.
- **Three kinds need no entry in the skin.** The game makes a joint snap, a lock root
  orientation and a synced animation modifier on its own for a skin whose clips hold the
  matching event. No shipped skin lists a joint snap or a lock root orientation, and 12,510
  joint snap events and 530 lock root orientation events ship.
- **The chain simulates in world space.** The unit's movement and turning are its main input.
  A character that stands still on a looping clip shows only what the animation itself excites.
- **One step per frame at the raw frame time.** `Damping` is taken off per frame, so the
  result depends on the frame rate. It is also taken off the motion the unit itself makes, so
  a steady run trails a damped chain behind it.
- **Every parameter is a value times a curve along the tree**, from the root (0) to the tip
  of the longest branch (1), by length.
- **State is never reset** by the game after the modifier is built.
- **Colliders come from a file** a `String` property names. Its layout is known from the
  game's loader, which reads two leading words and uses neither. No example ships.

## 2. Scope and evidence

**A dynamics chain crashes the retail game.** A test mod with one chain on Ahri crashed live
16.19 as the champion spawned (2026-10-03). A chain can be previewed and authored and cannot
run in game on that build, and the pane does not say so.

No behaviour of a chain was observed in a running game, and no shipped skin uses a socket,
so the preview has nothing to be compared with. A parameter name does not prove what the game
does with it: the game's reader was traced for each one, and the trace is the source. Half of
the property names are hash matches with no shipped string, so the typed read keys on hashes
and a rename costs labels only.

Support levels, which are this plan's own classification and are not shown to the reader:

| Level       | What                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| attested    | Nothing yet. E0 raises items to this level                                                                                                     |
| inferred    | Every simulated behaviour. The collision math, the three constraint solves, the write-back blend and the spring were read once and not re-read |
| unsupported | External forces, a spring event's blend time, cubic curve spans in the curve dock, the `Start` and `End` float pairs of builds before 16.14    |

## 3. Decisions

### 3.1 Rust resolves, TypeScript simulates

`resolve_skin` carries two typed lists on `SkinModel`: `pose_modifiers` and `sockets`
(`crates/ltk-manager-game/src/skin/dynamics.rs`). Each of the eight classes of
`BaseRigPoseModifierData` is a kind of its own, and a class a later patch adds is carried as
`Other` with its class, so a list is complete. Every item carries the hash path of its own
struct under the skin object, so an item of the Physics pane and a viewport handle address the
rows the inspector does (ADR-0027).

### 3.2 A simulated pose is a baked pass

The pose stays a pure function of time (ADR-0035). The simulation is not stepped by the
render loop. It is baked:

1. Take the clip pose and a unit that stands still (3.4), both functions of time.
2. Step the simulation at a fixed rate over the warm-up passes of the loop, then record one
   pass: the local transform of every simulated joint, per frame.
3. `simulatedPose(base)` is a pose wrapper beside `snappedPose`. It samples the pass the way
   `createPose` samples a clip.

A seek, a scrub, a cue rig and a particle that poses by age all read the same pass. The
loop seam is continuous once the warm-up has reached the steady state. A bake is a function
of the rig, the clip, the rate and the clip's events, and a change of any of them starts a
new bake. The wrapper keeps its identity and swaps its pass, so the clock does not restart. A
bake runs a few milliseconds a frame, and the viewport shows the last pass until the next
lands. ADR-0062.

### 3.3 A drag is simulated live

A baked pass cannot answer what happens when the reader moves the character. While the
viewport's Move gizmo is on, the same step runs live, once a frame's worth of steps at the
simulated frame rate, under where the gizmo stands the unit and how it faces it. The pose
reads the live joints in place of the pass, whatever time is asked. Turning the gizmo off
returns to the pass.

The live simulation steps a rig of its own, since a step moves a rig's state and a bake may run
beside it. It starts settled: its first frame takes one second of steps, at the simulated frame
rate, on the pose it starts on. Before those, it puts every event of the pass in the state the
pass has it in at the time it starts at, so an event that began earlier in the clip is in force
with its blend as far along as the pass has run it, as a conform's mask is on a run clip. An
event that begins and ends inside one step starts and then ends. A seek backwards while the unit
is live puts the events where the pass has them at the new time, and keeps the joints where they
are. A chain that an event turns on again stands back on the pose first, where the game keeps
the state it was turned off with.

What the unit did between two frames is spread over the steps of the later one, so a fast drag
is not one jump. A frame steps for a fifteenth of a second at most, so a stalled frame does not
step for seconds. The simulation steps on real time, so it settles while the clip is paused.
`live.ts`, and `LiveRoot`, which reads the gizmo's group each frame.

### 3.4 The reader moves the unit

The stage's unit stands still, and a chain needs movement. The reader gives it by hand:
they move or turn the character with the Move gizmo and the modifiers react (3.3). The
pass is baked under a unit that stands still, so it shows what the clip's own motion does.

A Motion picker in the transport, with Stand, Run, Run and stop, Turn, Strafe turn and Custom,
was built and removed. The motions were few and tuned to cases, and moving the unit by hand
covers each of them. The bake takes a motion. `motion.ts` holds the standing one, which the
preview bakes under, and the tests of the step build the others in their fixtures.

### 3.5 The step is the game's step, at a chosen frame rate

The stepper ports the game's equations one for one: sync, integrate, attract, collide,
constrain, limit the angle, restore the length, write back. The fixed rate of the bake is
a control, **Simulated frame rate** (30, 60, 144, 240), because the game steps once per
frame and the same data looks different at different rates.

### 3.6 Two stages, in the game's order

```
clip pose - snappedPose - [spring, to world x motion, chain bake] - simulatedPose - socketedPose
```

A spring is a local stage with state, so it is baked into the same pass as the chains. The
chain steps in world space: joint transforms composed as position, rotation and scale, as
the game composes them, times the motion's root transform, in the skin's scale. The
write-back converts to locals of the parent joint, blended by the weight, the chain's
envelope and the joint's own. The weight follows `DefaultOn` and the blend events of the
clip, which are functions of clip time and bake with the rest.

### 3.6.1 A conform is stepped before a spring

`ConformToPathRigPoseModifierData` is the modifier a shipped skin uses for a tail. It turns
each joint of a chain about the up axis, from where the animation points it toward an aim
that trails the joint: the aim starts where the joint's child stood last step, is carried
by a part of the unit's velocity that falls off along the chain, and is pulled to the joint
by a damped spring. The turn is cut to `mMaxBoneAngle`, weighed per joint by an animation
mask, and with `OnlyActivateInTurns` by how near the joint is to a bend of the unit's path.

The game keeps its modifiers sorted by kind, so the bake steps every conform, then every
spring, then the chains. A conform's default mask can weigh every joint at zero, as Ahri's
do: the chain then conforms only while a clip's `ConformToPathEventData` blends a mask in,
which the bake takes as a cue. A conform under a unit that stands still, or one whose path
has no bend while `OnlyActivateInTurns` is set, leaves the animation as it is.

### 3.6.2 The other five kinds

| Kind                  | What the game does                                                                                                                                                                                                  | The preview                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Lock root orientation | While a `LockRootOrientationEventData` runs, its joint is turned back by how far the unit has turned since the event started, and the turn eases out in a line over `BlendOutTime` after it ends                    | Simulated from the clip's events, with no entry in the skin, as the game does it. It shows while the reader turns the unit with the Move gizmo |
| Joint snap            | While a `JointSnapEventData` runs, a joint stands on another                                                                                                                                                        | `snappedPose`, from the clip's events, before the bake                                                                                         |
| Joint orientation     | Each joint of `Joints` is turned to the direction a driver gives, or toward the place it gives, whatever the clip turned the joint to. `DefaultOn` and a `JointOrientationEventData` with blend data set its weight | Simulated, with a stand-in for the driver                                                                                                      |
| Synced animation      | The units of a paired animation move to one place and one clip time                                                                                                                                                 | Nothing: the preview holds one unit                                                                                                            |
| Vertex animation      | A spring on the unit's movement, whose change each frame the pose carries beside its joints. It moves no joint, and what reads it was not found. No shipped skin lists one                                          | Nothing                                                                                                                                        |

A joint orientation turns in a plane (`PlaneConstraint`). It first tilts the plane about a
tilt axis until the plane holds the direction, then turns an aim axis of the joint about the
plane's normal toward the direction, by no more than a limit. The two axes, their signs and
the limit are five fields no table names, which the pane calls Tilt Axis, Aim Axis, Negate
Aim Axis, Flip and Max Angle. The result is absolute: at full weight the joint's rotation in
the unit's space is the aim, and the clip's rotation of that joint is gone.

The driver is an `ILogicVector3Driver`, which the game evaluates against the live unit: on
Viktor it is the place of his E missile. The preview cannot evaluate one, so it aims at
`AIM_STAND_IN`, a place on the ground 500 units ahead of where the unit starts the pass, read
as a direction or as a place by `orientationType`. An orientation with no driver turns
nothing, as in the game. An event that names a source of its own is not followed.

### 3.6.3 A clip that plays other clips fires its own events

Viktor's joint orientation event is not on an atomic clip. It is on the parametric clip
`Spell3`, which plays one of nine atomic clips by the angle of the cast. The game fires the
events of a parametric clip's own `mEventDataMap` only where the clip sets a flag no table
names (`0x69de8fca`, 53 clips in the game), and those of a sequencer clip always. The typed
read carries that as `own_events` on a clip, and `timedSteps` adds such a clip to the steps
of its own playlist, over the whole pass, a frame of it lasting the pass over the frames its
clips hold. Every event kind the preview plays follows: a particle, a submesh switch, a
joint snap, a lock and the blend events.

### 3.7 A socket is a slot past the last joint

`socketedPose(base, sockets)` wraps the final pose. `jointNamed` tries the joints, then the
sockets in list order, and answers a slot past the joint count, which `worldInto` resolves.
The rules are the game's: a joint with the same name wins, the first socket with a name
wins, and a socket whose parent joint is missing answers no slot and does not fall through.
The skeleton model is not rebuilt, so anything that walks the joints sees no socket.
ADR-0063.

### 3.8 Every edit is the document's one command

No new edit command (ADR-0051). An action of the Skeleton pane is one `editProperty` staged
under `skinMeshProperties`, which adds each field the file leaves at its default on the way
to the leaf it sets. A field of an item of the Physics pane is the document's own row, read
at the hash path the typed read hands out for the item, and is edited as a row of the
inspector is: a held field by the row's own patch, and a field the file leaves out by the
`editProperty` that adds it. So an item's edit is undone, marked and declared as any edit of
the document. The bake reads the document, so a value shows in the preview once its field is
left.

A declared document writes the whole value of the property an `editProperty` names
(ADR-0042), so an action staged under `skinMeshProperties` would declare every mesh property
of the skin. There `utils/dynamicsCalls.ts` cuts the action into the narrowest calls that say
it: a removal, an addition to a list of the game's, and one `editProperty` per property the
action fills. A value a row adds is staged from the deepest struct the file holds. The calls
are sent one after another, so in a declared document one action can be more than one undo
step. What a declared document cannot say is refused: an edit of a field no table names,
which the collider file's path and two group flags are, and the removal of an item the layer
itself added, which the document writes as the whole list.

## 4. The module

`src/modules/viewport/dynamics/`, free of React and three:

| File              | Holds                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| `model.ts`        | The chain, spring and solver model the stepper reads                      |
| `curve.ts`        | `CurveFloat` sampling in its three modes, `CurveScaledFloat`, rod scales  |
| `world.ts`        | Joint transforms composed down the hierarchy, the bind pose               |
| `build.ts`        | The tree walk, arc lengths, parameters, rod constraints and lateral links |
| `solver.ts`       | Collision and the three constraint solves                                 |
| `chain.ts`        | Sync, integrate, limit, settle rotations, write-back                      |
| `spring.ts`       | The spring step                                                           |
| `conform.ts`      | The conform's chain, its step and its mask blend                          |
| `lock.ts`         | The lock root orientation: its start, its end and the turn it takes back  |
| `orientation.ts`  | The joint orientation: the plane constraint and the turn toward the aim   |
| `math.ts`         | The vector and quaternion helpers the steps share                         |
| `motion.ts`       | The standing motion a pass is baked under                                 |
| `crossing.ts`     | What a step crossed of an event, and in which order                       |
| `events.ts`       | The events of a pass and the state they leave each modifier in            |
| `live.ts`         | The simulation stepped live under a unit the reader moves                 |
| `take.ts`         | The bake, the pass, its sampling                                          |
| `sockets.ts`      | The two resolvers and the Euler conversion                                |
| `colliderFile.ts` | The collider file as it is read, and its placement on a skeleton          |

The pose wrappers are `animation/evaluation/simulatedPose.ts` and `socketedPose.ts`. The
skin shell's side is `src/modules/workshop/bin/skin/`: `utils/dynamicsModel.ts` turns the
typed read into the model, `utils/dynamicsEdits.ts` writes the staged edits,
`utils/dynamicsDiagnostics.ts` names what the game takes silently,
`hooks/useSimulatedPose.ts` runs the bake, and `hooks/useColliders.ts` reads and saves the
collider files.

### 4.1 The colliders

A chain's colliders are not rows of the document. They are a file the chain names by path,
so an edit of one is a save of the file, by the `save_skin_colliders` command, into the layer
and the archive folder of the skin. A declared document holds the game's skin, and its file
goes to the layer its declarations are written to.
`crates/ltk-manager-game/src/skin/colliders.rs` writes the layout the viewport reads. The
first collider of a chain that names no file saves one beside the skeleton, under the
skeleton's name with the extension `.colliders`, and writes that path on the chain as one
edit. The game opens the file by its whole path, so the extension is this app's choice.

A radius or an offset is written when its field is left: the changed shapes go into the query
the viewport reads, so the pass bakes with them, and the file is saved. The file is outside
the document's undo.

## 5. The shell

- **Skeleton pane.** The joint outline of the `.skl` with a mark per joint for what it is to
  the dynamics: tree root, simulated, excluded, spring joint, a joint an orientation turns, a
  joint a conform turns, socket parent. A filter in the pane's header narrows the joints by
  name. A joint's menu holds `Simulate from here`, `Exclude from simulation`,
  `Add socket here`, `Add spring here`, `Add joint orientation here`,
  `Add collision sphere here` and `Add collision capsule to` its parent or to the selected
  joint, which for the selected joint is the one selected before it. The selected joint is
  marked in the viewport with the bones of every joint under it, and the mark is hidden with
  the viewport's controls. A second click on the selected joint's row clears the selection.
  The header's armature switch draws the joints, and a click on a joint's dot selects it.
- **Physics pane.** A tab behind the inspector. A row of actions switches between
  `Pose modifiers` and `Sockets` and adds to the one shown: a modifier of any of the eight
  classes at its defaults, or a socket on the selected joint. Under it is the picked item, and
  under that the list or the picked item's fields, never both: opening an item folds the list
  so its fields take the whole body, and the picked row steps to the next item and removes its
  own. An item of a kind the preview shows nothing for says why. A joint orientation lists its
  joints by name, adds the selected joint, and picks its source among the classes the field
  takes. The pane shows a notice while the skin loads and for a skin that names no skeleton,
  as the Skeleton pane does.
  An item's fields are `StructFields`, the rows the VFX inspector draws a primitive with:
  every field the class declares at the installed build, the held ones as the file holds
  them and the rest dimmed at their defaults, each with its field card. A chain's groups are
  sections under the chain's fields. A chain parameter is one row: its value, the curve's
  shape from the root to the tip and the Constant and Curve control, and it unfolds to the
  curve's keys. Pointing at a row tints the simulated joints by the parameter's value along
  the tree. A simulated item has a preview eye, which leaves the modifier out of the bake and
  writes nothing. A chain lists its colliders, each with its radius and, for a sphere, its
  offset off the joint.
- **Viewport.** The Physics switch in the action row draws a dot on every joint a modifier
  writes, a chain's collision radii, the colliders, the lateral links, the ground the chains
  rest on, and each socket's axes with a line to the joint it rides. The socket picked in the
  Physics pane carries a gizmo that moves it or turns it. A release writes the offset the drag
  left, and a press that moves nothing writes nothing. The handle follows the unit while the
  unit is dragged. The switch's menu ticks the simulated joints, the colliders and the sockets
  apart, and holds the simulated frame rate. The four switches are display preferences kept
  with the armature's. The overlays draw in the transparent pass with a late render order,
  since a character with a blended material draws after every opaque object.
- **Transport.** It holds nothing of the simulation.

## 6. Diagnostics

The game fails silently in each of these, and the item states them over its fields:

| Condition                                              | The item states                                  |
| ------------------------------------------------------ | ------------------------------------------------ |
| A tree's root is no joint                              | The game skips the tree                          |
| A tree's root stands under another tree's root         | What the game does with the overlap is not known |
| A tree with no length                                  | No parameter is applied                          |
| A curve key above 1 or below 0                         | The game clamps the curve                        |
| A rod parameter set with rod physics off               | Not read                                         |
| `Stretch` set with rod physics on                      | Not read                                         |
| Lateral links in a group of one tree                   | Nothing is linked                                |
| A socket named like a joint, or like an earlier socket | The joint wins, the first socket wins            |
| A socket's parent joint is missing                     | Lookups of the socket fail                       |
| A spring's joint is missing                            | The skeleton has no such joint                   |

Not built: `DefaultOn` off with no blend event in any clip, a socket name used by a chain,
and the game build a class needs.

## 7. What stays out

- Units on the map backdrop, the VFX host and the ability scene are not simulated. The
  wrappers are opt-in per scene, and only the skin shell opts in.
- External forces are not simulated. The game has a slot for them and no traced writer.
- A capsule's ends stand on its two joints and are not moved off them, and no gizmo drags a
  collider.
- No presets for hair, cloth and tails are offered until E0 shows which values look right in
  game.
- A joint orientation's driver is not evaluated, no control moves the stand-in, and the
  source a joint orientation event names is not followed.
- Nothing is drawn for a vertex animation or a synced animation.
- The unit state that stops a conform in game was not found and is not modelled, and the
  unit's path and its turns are not drawn.

## 8. Stages

| Stage | Deliverable                                                                        | State                                                                                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E0    | A test mod puts a chain and a socket on a shipped skin, with recordings to compare | Run for the chain: the game crashes on spawn, so there is nothing to record. Not run for a socket                                                                                                       |
| D0    | The typed read, both blend events, the bindings                                    | Built                                                                                                                                                                                                   |
| S1    | `socketedPose`, the two resolvers, the socket overlay                              | Built. The bone pickers of the effect tables do not list sockets yet                                                                                                                                    |
| S2    | The Sockets section, add and remove, fields, freeze flags, diagnostics             | Built, with a gizmo in the viewport that moves and turns the picked socket                                                                                                                              |
| D1    | The stepper, the bake, `simulatedPose` and the frame rate control                  | Built. No budget is enforced on a bake                                                                                                                                                                  |
| D2    | The Skeleton pane, the Physics pane, the add and tune flows, the overlay           | Built, with joints picked in the viewport. No limit cone or animated ghost is drawn                                                                                                                     |
| D3    | `CurveScaledFloat` in the curve dock                                               | The toggle, the flat starting curve and the sparkline are built. The curve's keys are edited under the unfolded row, since the dock does not take the holder                                            |
| D4    | The ground plane and the colliders                                                 | Built: colliders are added from a joint, edited in the chain's fields, saved as the chain's file and drawn                                                                                              |
| D5    | Rod physics and lateral links                                                      | Built. The rod solves are XPBD in the form of the position and orientation based rod paper, fitted to the traced compliances, and not golden tested                                                     |
| D6    | The live drag: the Move gizmo simulates the pose live                              | Built. It holds while the gizmo is on, and returns to the pass when it is turned off                                                                                                                    |
| D7    | The other five kinds of pose modifier, and adding and removing any kind            | Built. A lock and a joint orientation are simulated, a joint snap was already, and a synced animation and a vertex animation are listed with their fields and not simulated. Not compared with the game |

## 9. Risks

- **The input pose is simplified.** The preview plays one playlist with no track blending,
  masks or transitions, and the chain's output differs from the game wherever its input does.
- **Nothing is checked in game.** Until E0, a porting error and a tracing error look the
  same. The tests pin the port to the trace, not to the game.
- **Rod physics cost.** Fifty substeps per step can make a bake of a long pass take several
  frames. The viewport keeps the last pass meanwhile.
- **The feature is still changing.** Its classes changed in six of the twelve patches since
  it appeared. The typed read tolerates fields it does not know.
