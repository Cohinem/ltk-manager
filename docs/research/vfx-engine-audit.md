# VFX engine audit

Research note. The evidence is the tree at `6d8ab9a6`, read on 2026-09-24. Nothing was changed
or run, apart from a Node check of the RNG's first draws.

The scope is `src/modules/workshop/bin/vfx/` and the Rust resolver in
`crates/ltk-manager-core/src/vfx/`. It covers three things:

- bugs that change how an effect looks
- divergences from the engine as the reversing notes describe it
- performance

Each finding cites a file and line, says what the viewer sees, and names a fix. Paths are
relative to `src/modules/workshop/bin/vfx/` unless they start with `src/`, `crates/` or `docs/`.

## Sources

- The reversing notes in `X:/lol/dev/league_structs/docs/reversing/`:
  - `VfxEmitter_Evaluation.md`
  - `VfxEmitter_RenderStateAndUv.md`
  - `VfxDrawPaths_QuadsMeshesAndState.md`
  - `VfxDrawPaths_Round7.md`
  - `VfxRibbon_ShapesAndPrimitives.md`
  - `VfxForceFields_AndRibbonColour.md`
  - `VfxPalette_ErosionAndProbability.md`
  - `VfxChildParticleSets.md`
  - `VfxMesh_EmittersAndSurfaces.md`
  - `VfxSystemDefinitionData.md`
  - `TmeshGmesh_ParticleEmitterMesh.md`
  - `ResourceResolvers_VfxEffectKeys.md`
- `docs/plans/vfx-particle-renderer.md`. A divergence the plan records as a decision is left
  out, unless the notes contradict the plan's own reasoning.
- Five read-only sweeps, one for each of these areas:
  - the simulation core
  - child sets and force fields
  - the quad draw path
  - ribbons and meshes
  - parsing with the frame loop

Each finding carries one of three confidence levels:

- **Checked**: re-read against the code and the notes during review.
- **Traced**: one sweep traced the code path end to end.
- **Plausible**: the code is as described, but the engine side rests on inference or needs a
  game capture.

## Summary

Five fix groups, in order:

1. **Edit pipeline, section 1.** An edit rebuilds the model. Every texture, mesh and emission
   surface then reloads, the run restarts during the first pass, and surface or joint loads
   replay the whole run. This single root causes most of the flashing, blinking and edit cost.
   A refcounted asset cache plus a restart guard remove most of it.
2. **Small fixes with a large visible effect:**
   - the spawn-shape turn order (3.1)
   - the erosion fallback (2.5)
   - distortion at strength 0 (2.4)
   - `activeTexture` before the frame copy (2.1)
   - the beam offset turn (5.1)
   - the hidden wireframe (2.6)
   - the RNG seed mix (3.2)
   - the upright threshold (3.3)
   - the pass flags over child emitters (2.3)
   - `marks.clear()` in the surface and joint setters (1.3)
3. **Orthographic depth**, in the soft fade and DepthPushPull (2.2).
4. **Instantiation gates**, `importance` and `colorblindVisibility` (section 6). A doubled LOD
   pair is the most visible gap left in the parser.
5. **Performance**, section 7. Skinned particle meshes and the depth prepass come first.

## 1. Edit pipeline

Four of the five sweeps traced the same root. An edit, or a force mute or solo, gives the
viewport a new `SystemModel`, and everything keyed on that object's identity starts over.

### 1.1 Asset reload on every edit

Checked.

- `preview/components/VfxViewport.tsx:80`
- `rendering/hooks/useVfxTextures.ts:77-175`
- `rendering/hooks/useVfxMeshes.ts:41-78`
- `rendering/hooks/useEmissionSurfaces.ts:15-63`

The chain on each edit:

- `src/modules/workshop/bin/tree/hooks/useBinEdit.ts:74` invalidates `["vfx-system"]`, so
  `useVfxSystem` returns a new `SystemModel`.
- `playback/state/run.tsx:178` builds a new model on every force projection as well.
- `drawn` is a `useMemo` over `system`, and all three loader hooks key their effect on `drawn`.
- Each cleanup disposes every texture, mesh and pose texture and publishes an empty map. The
  effect then fetches, decodes and uploads everything again.

While a texture is missing, `samplersOf` returns `NO_SAMPLERS`. The quad compiles without
`HAS_MAP` and draws the `FALLOFF` placeholder. That placeholder lowers only alpha, and ADD
ignores alpha, so it draws a hard square (see 2.7). A mesh emitter draws nothing from
`VfxSystem` until its buffers land. `rendering/components/Quads.tsx:96-115` memoises the
material on `samplers`, so every slot that lands builds a new material.

**Effect.** Every edit, and every tick of a slider drag, does four things:

- flashes additive emitters as squares
- drops the mult, erosion and palette layers
- blinks mesh emitters out
- refetches every asset and uploads it to the GPU again

**Fix.** A refcounted cache of textures, meshes and surfaces keyed by asset path and width,
shared by the three hooks. The effects key on a string of asset paths rather than on the
identity of `drawn`. An emitter keeps its old bundle until the replacement lands. The same
cache removes the duplicate loads in 7.4.

### 1.2 Restart on every texture change in the first pass

Checked. `preview/components/VfxViewport.tsx:129-133`.

```ts
useEffect(() => {
  if (!resumed && driver.time <= reach.current) restart();
}, [driver, resumed, restart, textures]);
```

The effect exists so that a one-shot effect plays again once its textures land. Because of 1.1,
`textures` changes identity on every edit, and again as each texture lands. The effect also
runs after `run.tsx` has already swapped the definition and sought.

**Effect.**

- Paused at 1.2 s in the first pass, a colour edit jumps the run back to t = 0, several times
  over as the textures land.
- While playing, a one-shot effect restarts on each edit.

Decision 2.5 says an edit keeps the pool, and this breaks it.

**Fix.** Restart only when an asset path lands for the first time in this run.

### 1.3 Surface and joint loads replay the run

Checked. `engine/simulation/driver.ts:485-504`, `rendering/components/VfxSystem.tsx:57-74`,
`engine/simulation/emit.ts:90`.

`setSurfaces` and `setMeshJoints` compare by identity. They then `rewind()` and replay
`floor(stepper.now / SEEK_STEP)` fixed steps, capped at 3,600.

- **Replay per mesh.** `joints` is a new `Map` whenever `meshes` changes, and `useVfxMeshes`
  publishes a new map as each mesh lands. A system with static meshes and no bone set replays
  once for each mesh that arrives.
- **Stale checkpoints.** Neither setter calls `marks.clear()`, and `keep`
  (`driver.ts:336-342`) fills only empty marks. Checkpoints taken before the surfaces or joints
  landed survive the replay. A later scrub then restores particles born from the fallback
  shape, without their bone children.
- **Missed surfaces.** The surfaces map is keyed by `EmitterModel` identity. `swap` installs
  new emitter objects on each edit, so `step.surfaces?.get(emitter)` misses until the reload
  lands. New particles spawn from the fallback shape in the meantime.
- **Wrong replay target.** The replay targets `stepper.now`, which keeps growing on a looping
  rig. Past 60 s the replay stops at 60 s and the timeline jumps.

**Fix.**

- Key surfaces by drawn key or emitter index.
- Keep one stable empty `joints` map when no mesh has a pose, and compare by content.
- Clear the marks in both setters, and replay through `seek(phase)`.

### 1.4 Paused edits and gizmo drags replay from zero

Traced. `driver.ts:524`, `playback/state/run.tsx:233-237`, `forces/ForceGizmo.tsx:154-168`.

`swap` calls `marks.clear()` on every path, including the path where the addresses match. A
paused edit then calls `seek(time)`. With no checkpoint left, the seek replays from zero, which
is 600 steps plus children at a 10 s playhead. A force gizmo drag calls `swap` and `seek` on
every pointer move.

**Effect.**

- Heavy systems are slow to edit while paused, although a colour, `scale0`, blend or texture
  edit changes nothing the pool holds.
- Gizmo drags stutter, and more so the later the playhead is.

**Fix.** Keep the marks when only fields read at appearance time change. Coalesce gizmo changes
to one swap per animation frame.

### 1.5 Structural swap restarts the emitters but keeps the clock

Traced. `driver.ts:531-535`, `engine/model/systemModel.ts:22-34`.

When `addressTheSame` fails, `swap` resets the pool and the emitter ages, then calls
`buildUp(stepper.now, phase)`. A rename is enough to fail the check, because it compares
`name`. The phase stays mid-run, and `run.tsx` seeks only when paused.

**Effect.** After a rename, add or remove while playing, the effect replays from its start.
Meanwhile the playhead, the lanes and the emitter-phase curves (`worldAcceleration`, palette
scroll, uv scroll) all read mid-run.

**Fix.** Call `rewind()` in that branch, or `seek(phase)`.

### 1.6 Playback loop restarts on every edit

Traced. `playback/state/run.tsx:265-282`.

The rAF effect depends on `system`. A new system cancels the loop, and the next tick starts
with `last = null`, so its `dt` is 0. The `pace` ref exists to avoid exactly this for speed and
span.

**Effect.** Each edit loses one frame of time. A drag that sends 20-30 edits per second slows
playback by a third to a half.

**Fix.** Depend on `system !== null`.

## 2. Rendering correctness

### 2.1 `grabFrame` copies into whichever texture unit is active

Checked. `rendering/utils/frame.ts:77`.

`gl.copyFramebufferToTexture(FRAME)` runs without
`gl.state.activeTexture(gl.getContext().TEXTURE0)` first. three r185 skips the bind when its
cache says unit 0 already holds the texture, so the copy lands in the active unit.
`src/modules/viewport/scene/components/PostEffectsPass.tsx:117` already selects unit 0 first.

**Effect.** A distorting emitter can sample a stale frame. A copy into an incompatible texture
fails with `INVALID_OPERATION`.

**Fix.** Select `TEXTURE0` before the copy.

### 2.2 Orthographic presets break the soft fade and DepthPushPull

Checked.

- `rendering/utils/frame.ts:92`
- `rendering/shaders/quad.ts:358-359`
- `rendering/shaders/quad.ts:67-70`
- `src/modules/viewport/camera/utils/cameraPresets.ts:99-101`

Top, Front and Side are orthographic. `grabDepth` sets `DEPTH_RANGE` only for a
`PerspectiveCamera`, and `softened` converts both depths with `perspectiveDepthToViewZ`. An
orthographic depth buffer is linear, so the fade reads the wrong gap:

- a 30-unit gap at 500 units reads as about 0.003
- with the initial range of (1, 1), every gap reads as exactly 0

`pushed` moves each vertex along `normalize(view.xyz)`. That ray diverges from the eye, and an
orthographic view has no such ray.

**Effect.** Every soft-fading emitter disappears in the three flat presets. Quads with a large
negative DepthPushPull shrink toward the centre of the screen.

**Fix.**

- Branch on `isOrthographic` and use `orthographicDepthToViewZ`.
- Set the depth range for both camera kinds.
- Push along view -Z under an orthographic camera.

### 2.3 Pass flags ignore child-set emitters

Traced. The consumer is `rendering/components/Passes.tsx:61-66`. The flags are computed in:

- `preview/components/VfxViewport.tsx:115`
- `src/modules/workshop/bin/skin/components/SkinViewport.tsx:402-403`
- `src/modules/workshop/bin/map/components/MapViewport.tsx:120-121`
- `src/modules/workshop/bin/spells/components/MissileViewport.tsx:152`

`warps` reads `system.emitters` only, and the skin and map viewports compute both flags over
root emitters only. The two child cases fail differently:

- **A soft child emitter** still binds `SCENE_DEPTH`, but `grabDepth` never runs. The emitter
  reads a depth that was never written and fades to 0.
- **A distorting child** sits on `DISTORTION_LAYER`, which the colour pass leaves out, and no
  warp pass runs.

**Effect.** Soft child emitters vanish, or fade at random, in the skin, map and missile
viewports. Distorting children never draw in any viewport.

**Fix.** Compute both flags over `drawnEmitters(...)`, as `softens` already does in
`VfxViewport`.

### 2.4 Distortion strength 0 draws the emitter's colour

Checked. `rendering/shaders/quad.ts:477`, `rendering/utils/uniforms.ts:288`,
`engine/parsing/readSurface.ts:305`.

`gl_FragColor = warp != 0.0 ? warped(placed, lit.a) : lit`. In the warp pass, a strength of 0
outputs the texel multiplied by the colour.

**Effect.** A distortion block that leaves `distortion` unset, or an edit to 0, draws a white
sheet. Plan section 2.25 says the game draws no such sheet. A strength of 0.0001 is invisible,
while 0 is a sheet.

**Fix.** Always output `warped(...)`.

### 2.5 Named but unshipped erosion map binds white

Checked. `rendering/utils/uniforms.ts:325`.

The code has `erosionDefault: erosion?.map?.asset == null ? WHITE : NOTHING`. `ErosionModel.map`
carries a null asset for a name the install does not ship. Plan section 2.17 and
`VfxDrawPaths_QuadsMeshesAndState.md` section 8.3 bind a 1x1 transparent black in that case.

**Effect.** Such emitters draw un-eroded, where the game erodes them away.

**Fix.** `erosion?.map == null ? WHITE : NOTHING`.

### 2.6 Hidden trail or beam keeps its wireframe

Checked. `rendering/components/Trails.tsx:110-113`, `rendering/components/Beams.tsx:128-131`,
`rendering/components/drawPair.tsx:58-66`.

The early-out resets `buffers.geometry.setDrawRange(0, 0)` only. `edgeGeometry` keeps its last
range.

**Effect.** With edges drawn over the effect or alone, a ribbon that is muted, left out of a
solo or disabled leaves a frozen wire strip on screen.

**Fix.** Reset `buffers.edgeGeometry` as well.

### 2.7 Untextured falloff draws a square under non-alpha blends

Traced. `rendering/shaders/quad.ts:454-455`, `rendering/utils/materials.ts:102`,
`rendering/utils/blend.ts:115-124`.

The falloff lowers alpha only. ADD and SUBTRACT force alpha to 1 on the CPU, and their blend
factors never read it. The premultiplied, MIN and MAX modes use the whole rgb as well.

**Effect.** A flat square appears for every named texture that is still loading (see 1.1) or
that the install does not ship.

**Fix.** For those modes, scale rgb by the falloff too.

### 2.8 Ribbon without its texture draws a solid band

Traced. `rendering/utils/materials.ts:247`, `rendering/shaders/ribbon.ts:65-71`.

With no base sampler, the ribbon's texel is `vec4(1.0)` and there is no falloff.

**Effect.** A white strip on ADD while the texture loads, or permanently when the install does
not ship it.

**Fix.** A falloff across `v`, or no draw until the texture lands.

### 2.9 Particles draw one frame behind their owner

Traced for the ordering. Plausible for how visible it is.

- `rendering/components/Quads.tsx:139`
- owners in `src/modules/workshop/bin/`:
  - `skin/components/IdleEffect.tsx:50`
  - `skin/components/ClipEffect.tsx:57`
  - `map/components/MapParticles.tsx:122`
  - `spells/components/MissileViewport.tsx:235`

All of these run `useFrame` at priority 0. R3F 9.7 subscribes in a layout effect, which runs
child first, and its sort is stable. So `Quads` writes its instances before the owner calls
`advance`.

**Effect.** A system on a moving joint or missile lags one frame.

**Fix.** Advance at priority -1, as `spells/components/AbilityScene.tsx` already does.

### 2.10 Draw order ignores `pass` across systems

Traced. `rendering/utils/definitions.ts:63-76`, `rendering/utils/drawKind.ts:15-18`.

Child ranks start after every parent rank, and each mounted `VfxSystem` ranks from 0.
`VfxEmitter_RenderStateAndUv.md` sections 1.1 and 1.2 describe the engine's sort:

- one sort per display list, over every system's emitters
- pass is the first key
- key 5 compares system pointers

**Effect.**

- A child emitter at pass -5 draws over its parent's alpha smoke at pass 10.
- With several systems in one scene, the emitters at each rank interleave in mount order.
- Pass-999 overhead elements can draw under other systems.

**Fix.** One order per scene, keyed by pass, blend rank, misc byte, system and index, that hands
out `renderOrder`. The comment in `definitions.ts` and plan section 2.33 need the same
correction.

### 2.11 Trail point cap takes arbitrary particles

Traced. `rendering/components/Trails.tsx:158-163`, `engine/simulation/pool.ts:264`,
`rendering/utils/ribbon.ts:165`.

The code takes the first 1024 particles in pool order and then sorts them, but swap-removal
scrambles the pool order. The 8192 vertices of `TRAIL_VERTICES` are shared by every source.

**Effect.** Above 1024 live points, the ribbon joins particles that are not neighbours. With
many child-set strands, some trails vanish.

**Fix.** Keep the 1024 highest serials, and size the vertex budget from the source count.

### 2.12 Smaller correctness issues

| Issue                                                   | Location                                                                | Effect                                                                      | Fix                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| MIN blend soft fade goes to black                       | `rendering/utils/softParticle.ts:57-61`                                 | A MIN particle is darkest where it should fade out                          | Mix toward white, `mix(1.0, rgb, fade)`                                             |
| Ground layer flattened to y = 0                         | `rendering/shaders/quad.ts:10-19`                                       | On map terrain, ground effects sink under the ground or float above it      | Lay them at the system's ground height, or the terrain's                            |
| Fit bounds leave out the beam target                    | `rendering/utils/systemBounds.ts:55-72`, `engine/model/rig.ts:85,171`   | A beam system opens with most of the beam off screen                        | Grow the bounds by `targetAt(rig.motion, 0)` when an emitter draws as a beam        |
| No mipmaps on particle textures (plausible)             | `rendering/hooks/useVfxTextures.ts:113`                                 | Minified sprites, noise and erosion maps shimmer in wide views              | Load the file's own mips through `?as=mips`, then use `textureGrad` for the uv fold |
| Distortion unit is screen heights, the doc says widths  | `rendering/shaders/quad.ts:275` against `quad.ts:253-255` and plan 2.25 | Warps are 0.56 times the documented strength at 16:9                        | Correct the doc, or scale by width over height                                      |
| Single-sided custom material culls a ribbon (plausible) | `rendering/utils/customMaterial.ts:72` against `useVfxMeshes.ts:137`    | Under a single-sided override, a ribbon shows the culled face or disappears | Swap two indices in `writeTrail` and `writeBeam` when the state is single-sided     |

## 3. Simulation against the engine

### 3.1 Spawn-shape turns compose in reverse

Checked. `engine/simulation/spawnShape.ts:110`, with the calls at `:66-69` (legacy), `:79-80`
(box) and `:97-98` (sphere).

`spin` computes `turn = turn * spun`, and `turnInto` applies `turn * v`. So the last turn
composed is the first applied. The sphere composes Y and then Z, which means the code applies Z
first.

`VfxRibbon_ShapesAndPrimitives.md` sections 4.6 and 4.7 apply +Y first, on row vectors. The
two orders put the shell's poles on different axes:

| Order            | Point on the shell                         | Poles |
| ---------------- | ------------------------------------------ | ----- |
| Engine, +Y first | `(R cos a cos b, R cos a sin b, -R sin a)` | ±Z    |
| Code, +Z first   | `(R cos a cos b, R sin b, -R sin a cos b)` | ±Y    |

Plan section 2.12 ("Shape angles") records the attested order as built.

**Effect.**

- Every shipped sphere is a shell (plan section 2.12), and every one clusters up and down
  instead of front and back.
- A surface box reaches only its ±X and ±Z faces instead of all six. This case is rare, because
  shipped data sets `flags & 1` on nearly every box, and that flag skips the turn. The test at
  `engine/simulation/__tests__/spawnShape.test.ts:136` and the plan's T3 text (line 2322) both
  assert four faces.
- A legacy shape with two or more turn axes applies them in reverse order (plausible).

**Fix.** Use `multiplyInto(SPUN, out.turn, out.turn)`, then correct the box test and the T3
text.

### 3.2 RNG seed is not mixed

Checked, with a Node run of the same xorshift. `engine/utils/Rng.ts:18-20`,
`playback/state/run.tsx:35,341`.

The generator's state is the raw seed. The first seed is 1337, and a reroll adds 1.

| Seed | First draw | Second draw |
| ---- | ---------- | ----------- |
| 1337 | 0.0792     | 0.8031      |
| 1338 | 0.0793     | 0.7561      |
| 1339 | 0.0793     | 0.7719      |
| 1340 | 0.0795     | 0.8499      |

**Effect.**

- A reroll barely changes the first particle of the first emitter.
- A reroll barely changes the shared value of a `ParticlesShareRandomValue` emitter.
- The first draw of every run sits near a table's minimum.

**Fix.** Mix the seed in the constructor, with splitmix32 or the murmur `fmix32` finaliser.

### 3.3 Upright snap at 0.99

Checked. `engine/simulation/particleRead.ts:213,240`.

`UPRIGHT = 0.99` decides when the reference axis switches. `VfxDrawPaths_QuadsMeshesAndState.md`
section 3.3 and `VfxSystemDefinitionData.md` section 9 give `abs(dir.y) > 0.99999`, and
`alongInto` in `engine/utils/basis.ts` already uses 1e-5.

**Effect.** A direction-oriented particle within about 8 degrees of vertical, such as a rising
ember, flips its side axis as it crosses that cone.

**Fix.** Use 0.99999.

### 3.4 Legacy shape tables share one chance

Plausible. `engine/simulation/spawnShape.ts:60-68`, called from `engine/simulation/emit.ts:89`.

Every channel and angle of a legacy shape draws at the particle's one shared chance. Two notes
disagree with that:

- `VfxRibbon_ShapesAndPrimitives.md` section 4.2 places the shape sample before the chance is
  drawn.
- `VfxPalette_ErosionAndProbability.md` section 5.4 does not list the rotate call among the
  sites that receive the chance.

Plan section 3.4 lists the legacy shape among the readers of the chance.

**Effect.** A random `emitOffset` of -1..1 on x and z collapses onto the line x = z, instead of
filling a square.

**Fix.** One independent draw from the stream for each table.

### 3.5 A step's spawns share one origin

Traced for the missing interpolation. Plausible for the engine's per-particle spread.
`engine/simulation/emit.ts:100`.

The code sets `pool.position = step.origin + BORN.offset` for the whole batch. The engine
interpolates the spawn position across the step, per `VfxEmitter_Evaluation.md` sections 1 and
5 and `VfxSystemDefinitionData.md` section 9 step 4. Plan section 2.3 assigns that work to
`fixedRateStepper`, which is unused and does not interpolate either.

**Effect.** On the missile rig at 60 fps, quads on a fast rig bead about 27 units apart. A
hitch of 0.1-0.2 s piles its whole backlog at one point.

**Fix.** Place batch member i at `origin - moved * (1 - (i + 1) / count)`.

### 3.6 Angular acceleration at end-of-step age

Traced. `engine/simulation/integrate.ts:543-544`.

The code steps `(angularVelocity + angularAcceleration * age) * dt`, which sums to
`ωT + αT(T + dt)/2`. Plan section 3.4 and `VfxEmitter_Evaluation.md` section 8.2 give the
closed form `(ω + α · 0.5 · age) · age`.

**Effect.** Spin depends on frame rate. At 30 fps with α = 360°/s², the angle is about 6
degrees off after 1 s, and a seek disagrees with a play.

**Fix.** Store the birth angle and write the closed form.

### 3.7 Last partial step emits nothing

Traced. `engine/simulation/emit.ts:52`.

The guard `if (emitter.lifetime !== null && state.age > emitter.lifetime) return` runs after
`age += dt`. Separately, `systemSpan` counts the lifetime from `timeBeforeFirstEmission`, while
`emit` counts it from age 0.

**Effect.** The particles owed inside the step that crosses the lifetime are dropped. A burst
emitter shorter than one frame emits at 144 fps and not at 30 fps.

**Fix.** Count the crossing step once, against `min(age, lifetime)`.

### 3.8 Span ignores lifetime probability tables

Traced. `engine/model/systemModel.ts:106-110`.

`peak()` reads the constant and the keys only, but the tables multiply the lifetime at birth.

**Effect.** A looping rig wraps and clears the pool while table-extended particles are still
alive, and the scrub span is too short.

**Fix.** Multiply by the largest value of each table.

### 3.9 Seek starts from the first pass of a loop

Traced. `playback/state/run.tsx:233-237,311-317`, `engine/simulation/driver.ts:419,468-476`.

`seek` takes a time counted from zero, but `replay()` keeps one RNG stream across loops.

**Effect.** Paused in the third loop, a frame step or a value tweak swaps every particle for the
first pass's draws.

**Fix.** Seek to the absolute `driver.time`, clamped, or reseed the generator at each pass.

### 3.10 Definition transform moves the rig origin

Plausible. `engine/simulation/driver.ts:295,578-582`, `engine/simulation/integrate.ts:183-188`.

`origin: place(world, now)` rotates and offsets the attachment point itself, and the spawn frame
is `world · yaw · override`. `VfxSystemDefinitionData.md` section 9 step 5 composes the
transform inside the spawn frame, without touching the system position. Plan section 2.13 reads
the note's word "outermost", but the note's own chain of matrices contradicts that reading.

**Effect.** On about 110 systems whose transform rotates, the effect sits off its attachment
point.

**Fix.** Keep the origin unplaced and compose `yaw · override · Tdef`. Settle it against a game
capture first.

### 3.11 Travel axis of a direction-oriented arbitrary quad

Plausible. `engine/simulation/particleRead.ts:248`.

The basis columns are `(r, u, r×u)`. `VfxEmitter_Evaluation.md` section 8.2 item 7 and the
draw-path note set row 2 to the direction. Plan section 2.19 says the arbitrary quad takes rows
0 and 1, which would make the quad face its travel. Plan section 2.51 records the current look
as judged by eye.

**Fix.** Settle it against a game capture before changing anything.

## 4. Child sets, force fields and emission surfaces

### 4.1 Noise ignores the seed and repeats across siblings

Traced. `engine/simulation/forceFields.ts:228-237,311-325`,
`engine/simulation/childPool.ts:33-34`.

The direction hash mixes the serial, the slot and the impulse only. Two resets make siblings
match:

- `takePool` resets `born`, so every child pool numbers its particles from 0.
- Every child's noise clock starts at 0.

Plan section 2.45 chose hashing so that a seek replays the same noise, not this correlation.
The engine draws each direction live from its per-thread stream
(`VfxForceFields_AndRibbonColour.md` section 2.1).

**Effect.** Sibling spark clouds of one definition wander in the same pattern, and a reroll
never changes the noise.

**Fix.** Mix a per-system salt into `directionInto`: the child's `seedOf(...)` value, or the
lineage seed at the root.

### 4.2 Joint children ignore the parent particle's scale

Traced. `engine/simulation/childBearing.ts:101-109`, `engine/simulation/children.ts:246-265`.

The joint origin is turned by `bearing.yaw`, with the scale removed, and added unscaled. Two
sources scale it:

- `rendering/components/Meshes.tsx:170` draws the mesh at `scale0 · birthScale · stood`.
- `VfxChildParticleSets.md` section 5 step 3 re-roots the pose at the particle matrix, scaled by
  the particle's scale.

Plan section 2.33 finds that 26% of parent scales are not 1.

**Effect.** On a scaled or growing mesh particle, bone children sit away from the drawn joints.

**Fix.** Scale the joint origin by the drawn scale before turning it.

### 4.3 Surface-normal velocity takes the shape's random turn

Plausible. `engine/simulation/emit.ts:89-114`.

The code has two steps:

1. The velocity becomes `normal * speed`, and `BORN.turn` then turns it.
2. The shape offset is added on top of the surface point.

`VfxMesh_EmittersAndSurfaces.md` section 9 says the normal fully replaces the shape's direction.

**Effect.** A surface emitter with a sphere, cylinder or box shape launches particles in random
directions, from points off the surface.

**Fix.** Skip the turn when `useSurfaceNormalForBirthPhysics` is set. Skip the shape offset when
the surface sample succeeds.

### 4.4 Smaller issues

| Issue                                                   | Location                                                                                                               | Effect                                                                                | Fix                                                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Newborns gated against the start-of-step field origin   | `engine/simulation/integrate.ts:240-263,273-293`                                                                       | On a moving rig, the orbital and radius gates for newborns are one step of travel off | Offset the centres by `step.moved` in `kickNewborns`                                                     |
| Flat face normal on mesh surfaces                       | `rendering/utils/emissionSurface.ts:83-87`                                                                             | Births on a smooth mesh fan out in facet directions                                   | Blend the skinned vertex normals by the barycentric weights (`VfxMesh_EmittersAndSurfaces.md` section 9) |
| Skeleton surface spreads births along bones (plausible) | `rendering/utils/emissionSurface.ts:108-139`                                                                           | Births fill lines along the bones, weighted by posed length                           | Weight by bind local translation and emit at the joints (`TmeshGmesh_ParticleEmitterMesh.md`)            |
| `maxJointWeights` of 0 skins to the bind pose           | `rendering/utils/emissionSurface.ts:30-52`, `engine/parsing/readEmissionSurface.ts:29`                                 | A weight count of 0 gives the bind position                                           | Clamp to [1, 4], as the engine does                                                                      |
| Gizmo turns local-space directions by the full frame    | `forces/forceGeometry.ts:56-72` against `engine/simulation/integrate.ts:260`                                           | On a rotated system, the arrow points away from the force actually applied            | Build the gizmo frame from the rig yaw alone                                                             |
| Bone child sets never spawn on a host character         | `preview/components/VfxViewport.tsx:80`, `rendering/utils/definitions.ts:67`, `preview/components/VfxHost.tsx:163-188` | Attached meshes draw on the host, but `boneToSpawnAt` sets do not                     | Pass `posed = true` and a joint lookup off `host.pose` once the host is ready                            |

## 5. Draw paths against the engine

### 5.1 Beam offsets are not turned

Checked. `rendering/components/Beams.tsx:149-152`.

The code adds the offset directly: `SOURCE = origin + beam.sourceOffset`.
`VfxRibbon_ShapesAndPrimitives.md` section 3.2 turns it first:
`source = sys[264] + Mtx44Transform(sys+472, mLocalSpaceSourceOffset)`, and the same for the
target.

**Effect.** On a bone, missile or orbit rig, or on a rotated system, the offset ends stay fixed
in world axes. Joint-to-joint beams land off the joints.

**Fix.** Turn each offset by the source orientation before adding it.

### 5.2 Ribbon LOCK_ALPHA uses the wrong alpha uv

Traced in the code. The engine side comes from the notes. `rendering/utils/ribbon.ts:319-338`,
`rendering/utils/materials.ts:249`, `rendering/shaders/ribbon.ts:68-70`.

`alphaUv` is the uv, turned and scaled. The notes put every drawn ribbon on
`QUAD_VS_FixedAlphaUV`, which picks a corner of `{0,0},{1,0},{1,1},{0,1}` by `vertex_id & 3`.
The sources are `VfxForceFields_AndRibbonColour.md` sections 5.5 and 5.7 and
`VfxEmitter_RenderStateAndUv.md` section 5.3. Plan section 2.34 says neither primitive is
attested, and the notes contradict it.

**Effect.** A beam's locked alpha repeats along the length, instead of covering the quad once.
A trail's alpha tiles along the length, where the engine alternates between corner pairs from
one point to the next.

**Fix.** Set `alphaUv` from the corner table by vertex parity.

### 5.3 Segment beam (kind 9)

Plausible. `rendering/components/Beams.tsx:156`.

The builder applies `beam.mode` to kind 9 as well. `VfxRibbon_ShapesAndPrimitives.md` section
3.4 gives kind 9 an eye-facing cross product with no mode branch, and ARBITRARY is the only
authored mode (86 objects). The plan records kind 9 as drawing like the plain beam, which
produces one full-length quad per rib.

**Effect.**

- The `Xerath_Base_Q_beam` BeamBlast draws flat in the world-up plane.
- With `mSegments` of 200 or 500, the beam draws many times over-bright.
- `mSegments = 1` draws a beam where the engine draws nothing.

**Fix.** Force the eye path for kind 9, and draw one quad per source until ribs are built.

### 5.4 A beam with a mesh draws nothing

Plausible. `rendering/utils/drawKind.ts:135-148`.

Plan section 2.12 marks "nothing draws" as inferred. `VfxDrawPaths_Round7.md` sections 1.1, 3.1
and 5 show kind 6 reaching a beam mesh block. There the mesh is stretched between source and
target, and its z is scaled by the beam length over the mesh's z extent.

**Fix.** Add the kind-6 mesh path, or correct plan section 2.12.

### 5.5 Skinned particle mesh shaded as `mesh_ps`

Traced. `rendering/components/Meshes.tsx:69,93-107`, `rendering/utils/materials.ts:154`,
`rendering/utils/softParticle.ts:18-23`.

Meshes always use `DRAWS {fade: true}` and `SHEEN.drawn`. A `.skn` resolves to
`SkinnedMesh/PARTICLE_PS`, which has no soft particles and scales the rim and reflection by the
texel's alpha (plan sections 2.42 and 2.43). `attachedMaterial` already follows that shader.

**Effect.** `.skn` emitters soft-fade where the game does not, and their rim follows the
particle's alpha.

**Fix.** For a skinned mesh, drop `soft` and use `SHEEN.texel`.

### 5.6 UV folded per cell

Traced. `rendering/shaders/quad.ts:189-205`, `rendering/utils/uvTransform.ts:113-117`.

`VfxDrawPaths_QuadsMeshesAndState.md` section 2.6 runs `(col + u, row + v) * TEXTURE_INFO.yz`
across the whole atlas, with no fold, and the sampler's address mode covers the whole texture.
The shader samples two coordinates differently:

- `eroding` (`quad.ts:457`) samples the unfolded coordinate, as plan section 2.50 requires.
- The base texel is folded per cell.

**Effect.**

- A flipbook with uv scroll, scale or rotation tiles one frame, where the game shows the
  neighbouring cells.
- Erosion drifts away from the texel once the uv leaves [0, 1].
- On a clamped sampler, the fold loses bilinear filtering across the seam.

**Fix.** Drop the per-cell fold, and set the sampler's wrap from the address mode.

### 5.7 Smaller issues

| Issue                                                   | Location                                                                  | Effect                                                                 | Fix                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Orbit applied outside the camera alignment              | `rendering/components/Meshes.tsx:171-174,247-251`                         | An aligned mesh with `birthOrbitalVelocity` turns away from the camera | `TURN = LookAt · ORBIT · ROLL` (`VfxDrawPaths_QuadsMeshesAndState.md` section 4.4) |
| Camera quad roll may be reversed (plausible)            | `rendering/components/Quads.tsx:246`, `rendering/shaders/quad.ts:133-137` | Spinning swirls turn the wrong way                                     | Check one asymmetric spinning sprite against the game, then pass +spin             |
| First point of a camera trail at full width (plausible) | `rendering/utils/ribbon.ts:201-207`                                       | The head does not narrow by sin θ when it moves toward the eye         | Scale the first pair by the length of the cross product                            |

## 6. Fields the parser does not read

Checked. None of these names occurs under `engine/` or `rendering/`. The inspector reads some of
them for display only.

| Field                                                   | Engine behaviour                                                       | Effect                                                                                | Source                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `importance`                                            | Very High culls importance 4, the low-spec stand-in                    | A cheap and a rich LOD emitter draw on top of each other                              | `VfxEmitter_Evaluation.md` section 9.1       |
| `colorblindVisibility`                                  | 1 draws on the default palette only, 2 on the colourblind palette only | Colourblind variants draw over the default ones                                       | `VfxEmitter_Evaluation.md` section 3.2       |
| `ChanceToNotExist`                                      | Rolled once per spawn                                                  | Optional emitters always appear. Plan section 2.6 lists the roll, but it is not built | `VfxEmitter_Evaluation.md` section 3.2       |
| `rateByVelocityFunction`, `MaximumRateByVelocity`       | `speed * fn.x + fn.y`, capped at 300 when unset, wins when authored    | A velocity-driven trail emits only its first particle on the missile rig              | `VfxEmitter_Evaluation.md` section 7, step A |
| `period`, `timeActiveDuringPeriod`                      | No spawns outside the active window                                    | A pulsing emitter emits continuously                                                  | `VfxEmitter_Evaluation.md` section 6         |
| `HasVariableStartTime`                                  | Suppresses the forced first particle                                   | One extra first particle                                                              | `VfxEmitter_Evaluation.md` section 7, step F |
| `hasPostRotateOrientation`, `postRotateOrientationAxis` | Premultiplies the particle basis                                       | Authored post-rotations on rays, meshes and arbitrary quads are missing               | `VfxEmitter_Evaluation.md` section 8.2       |
| `shape: Embed<VfxShape>`, pre-14.5                      | The legacy spawn shape                                                 | Older bins and mod bins lose their spawn offset and emit rotation                     | Plan, T3                                     |

Two related parser gaps:

- **Null first probability table.** A table set whose slot 0 is null still multiplies the other
  channels (`engine/parsing/readValue.ts:112-139`). `VfxPalette_ErosionAndProbability.md`
  section 5.1 skips the whole block in that case.
- **Dependency bins not searched.** `crates/ltk-manager-core/src/vfx/resolve.rs:334-351` inlines
  only `document.object_at`, so a child system linked from a dependency bin never resolves. The
  engine resolves `effect` and `effectKey` across loaded bins
  (`ResourceResolvers_VfxEffectKeys.md` section 4.3). The child set draws nothing and gives no
  notice.

## 7. Performance

### 7.1 Skinned particle meshes pose per particle and upload the whole palette

Traced. `rendering/utils/meshPose.ts:29-42`, `rendering/components/Meshes.tsx:143,186`,
`src/modules/viewport/animation/evaluation/pose.ts:72,116,139`.

`write(instance, age)` evaluates the pose at each particle's own age, so the `worldsAt` cache
always misses. Per particle, this costs:

- a full recomposition of the skeleton
- one `subarray` per influence
- one array literal per joint

On top of that, `texture.needsUpdate = true` re-uploads the whole `influences * 4 x 512` RGBA32F
texture. At 100 influences that is about 3.3 MB per frame per emitter, even with one live
particle.

**Fix.** Round each age to the clip's frame step and reuse that frame's palette. Upload rows
`0..instance` only.

### 7.2 Soft-fade depth prepass draws full materials

Traced. `rendering/utils/frame.ts:85-101`, `rendering/components/Passes.tsx:61`,
`src/modules/viewport/scene/components/PostEffectsPass.tsx:120-128`.

`SCENE_LAYER` renders with full materials into an RGBA target whose colour is never read. Two
passes draw the scene again:

- `MapViewport` turns the prepass on whenever any map system fades.
- PostEffectsPass runs its own depth pass.

With post effects on, the map draws three times.

**Fix.** One shared depth prepass. Make it depth-only, keeping the alpha test for cutouts, or
turn colour writes off.

### 7.3 Hidden and culled emitters still bind their program

Traced. `rendering/components/Quads.tsx:139-143`, `rendering/components/drawPair.tsx:41-48`.

A hidden emitter only sets `instanceCount = 0`. In three 0.185, `renderBufferDirect` calls
`setProgram` first, which uploads uniforms and binds textures, and only then returns on zero
instances. `MapParticles` hides systems out of view through `hiddenOf` alone.

**Effect.** On Summoner's Rift, hundreds of emitters out of view are sorted and bound every
frame.

**Fix.** Set `mesh.visible = false` when the emitter is not drawn or holds nothing.

### 7.4 Texture loads are not shared

Traced. `rendering/hooks/useVfxTextures.ts:78-88,121,135-136`,
`src/modules/workshop/bin/map/components/MapParticles.tsx:70`.

There is one `TextureLoader.load` per emitter and slot, and `THREE.Cache` is off. `MapParticles`
passes no `minWidth`, so concurrency is unlimited and every texture loads at full size.

**Fix.** The cache from 1.1, keyed by asset and width, plus a `minWidth` from `MapParticles`.

### 7.5 Every draw path scans the whole pool

Traced.

- `rendering/components/Quads.tsx:149-158`
- `rendering/components/Trails.tsx:159`
- `rendering/components/Beams.tsx:167`
- `rendering/components/Meshes.tsx:138`
- `rendering/components/AttachedMeshes.tsx:144`
- `src/modules/viewport/scene/components/Viewport.tsx:217`

Each emitter walks the shared pool and skips the other emitters' particles. With 40 emitters
and 10,000 particles, that is 400,000 iterations per frame. The frame loop is `always`, and
every draw path rebuilds and uploads its instance data even while paused.

**Fix.** Bucket the pool indices by emitter once per step, in the driver. Skip `write` when the
source time and the camera have not changed.

### 7.6 Shared frame targets across viewports

Plausible. `rendering/utils/frame.ts:31-40,49,64-101`.

`FRAME`, `SCENE_TARGET`, `VIEWPORT` and `DEPTH_RANGE` are module-level. Two visible viewports of
different sizes each fail the size check every frame, so each reallocates the targets. When one
of them unmounts, `releaseFrame` frees the targets under the other.

**Fix.** One set of targets per renderer, in a `WeakMap` keyed by `gl`, as PostEffectsPass
already does.

### 7.7 Smaller costs

| Cost                                                           | Location                                                                                                                                                                                                                                                                  | Fix                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Allocations in the simulation's hot loops                      | `engine/utils/sampleCurve.ts:79-98` (`drawCurve` spreads about 20-25 arrays per particle), `engine/simulation/forceFields.ts:126-173`, `engine/simulation/particleRead.ts:66,240,248`, `engine/simulation/driver.ts:457-461`, `engine/simulation/children.ts:329,351-356` | Scratch buffers on `EmitterState` and `Children`, and sampling in place with `drawCurveInto`                                                    |
| Allocations in the draw loops                                  | `rendering/components/Quads.tsx:145,160-171,193-200,260-273`, `rendering/utils/uvTransform.ts:59,62`, `rendering/components/Trails.tsx:127-133,174`, `rendering/components/Beams.tsx:184`, `rendering/components/Meshes.tsx:129-130,187`                                  | Hoist the objects, use `sampleCurveInto`, copy floats by index, and reuse the placed positions from the sort                                    |
| Particle basis built for quads that never read it              | `rendering/components/Quads.tsx:248`, `rendering/components/Trails.tsx:178-182`                                                                                                                                                                                           | Build it only for `ray`, arbitrary and direction-oriented draws                                                                                 |
| On-death emitters place every live particle every step         | `engine/simulation/children.ts:392-407`                                                                                                                                                                                                                                   | Capture the placement at retire time                                                                                                            |
| Sibling children thrash the emission pose cache                | `rendering/utils/emissionSurface.ts:58-66`                                                                                                                                                                                                                                | Cache several recent times, or key the cache per child                                                                                          |
| One WebGL context per VFX tab, kept while hidden (plausible)   | `preview/components/VfxViewport.tsx:146`, `src/modules/viewport/scene/components/Viewport.tsx:212-228`, `src/modules/editor/layout/PortalHosts.tsx`                                                                                                                       | `renderer="shared"`, as the skin and map viewports use. Past about 16 contexts an old tab returns black, and nothing handles `webglcontextlost` |
| Timeline re-renders at 10 Hz while children spawn              | `timeline/components/Lanes.tsx:171`                                                                                                                                                                                                                                       | Set `spawned` only while a child lane is open                                                                                                   |
| Inline `combine` rebuilds poses on every render                | `preview/components/VfxHost.tsx:55-71`                                                                                                                                                                                                                                    | Hoist `combine` to module scope                                                                                                                 |
| SUBTRACT is sorted, though its result does not depend on order | `rendering/utils/blend.ts:92-99`                                                                                                                                                                                                                                          | Remove it from `sortsBackToFront`                                                                                                               |

## 8. Checked and found correct

- **Curve sampling and probability tables.** Flat reads past both ends and the duplicate-time
  case are right. The table scan is strictly greater than, two keys interpolate linearly, and
  mismatched lists are worth 0. Tables multiply rather than replace, and each particle draws one
  chance (`VfxPalette_ErosionAndProbability.md` sections 5.1-5.3).
- **Spawn count.** The burst cap is `trunc(rate * 0.33) + 1`, and the first particle is forced.
  A single-particle rate is read as a `u16`, the trail cap holds, and the fractional backlog
  carries over.
- **Integrator.** The order is right: acceleration, drift, drag with the no-crossing clamp,
  fields keeping their delta, then position. Newborns take dt = 0. Analytic drag and linger
  match plan sections 2.39 and 2.51.
- **Pool and checkpoints.** The retire sweep runs backward with swap-from-last, and `spawn`
  resets every column. A checkpoint copies every column, `born`, the emitter states, the noise
  clocks and a clone of the RNG.
- **Bases.** `standingInto`, `yawInto`, `flightInto` and `alongInto` match the engine's
  conventions, and `worldOf` transposes the file's row-vector block correctly.
- **Force fields.** The order of operations, the attraction floor, the drag clamp and the orbital
  guards match the notes. The noise impulse count runs on absolute time and does not depend on
  frame rate.
- **Child sets.** The birth cursor is right. A death spawn replaces the birth spawn. The
  `childrenProbability` index and the depth cap agree between the simulation and the draw.
  Snapshots copy children deeply.
- **Blend and depth state.** All nine blend modes and their alpha lanes match
  `VfxDrawPaths_QuadsMeshesAndState.md` section 8.2. Only ADD and SUBTRACT premultiply, and only
  NONE writes depth. The alpha test divides by 255 and discards on strictly less than.
- **Erosion, palette and colour lookup.** The math matches plan section 2.50 and the palette note.
- **Colour space.** Particle textures use `NoColorSpace` with `flipY` false. There is no tone
  mapping, the canvas is opaque, and the warp copies an RGB8 frame.
- **Draw order within one system.** Ground layer, then pass, then the blend rank table
  `{1,2,1,0,2,2,2,2,3}`, then the misc byte, then the index.
- **Trails and beams.** Topology, walk direction, cutoff, box smoothing, the miter and the uv
  formulas match `VfxRibbon_ShapesAndPrimitives.md`, apart from 5.1-5.3.
- **Mesh transforms.** The mirror, the rewind and the skinned palette `S·(W·IB)·S` match the
  Character convention. Submesh masks are right.
- **Parsing.** All 118 `nameHash` names exist on their meta classes, and the spot-checked field
  defaults match the meta schema. The Rust resolver's asset field hashes, path lowercasing,
  `effectKey` resolution and cycle guard are correct.
- **React.** No React state is set inside `useFrame`. The clock readouts are throttled through
  `useSyncExternalStore`. Resources are disposed on unmount, and an edit does not change a
  program's cache key.

## 9. Open leads

- **Curve bake resolution.** `VfxPalette_ErosionAndProbability.md` section 5.6 describes the
  engine's curve as a uniformly spaced float array, not a keyframe list. If that bake is coarse,
  the preview draws sharp keys, such as a fast fade-in, crisper than the game does.
- **Camera quad aspect.** `VfxDrawPaths_QuadsMeshesAndState.md` section 2.5 mentions a
  texture-driven aspect factor on the camera quad's `scale0.y` at `0x1412D1BA4`. The renderer
  applies none, and the note is too thin to say when it applies.
- **Per-particle depth sort.** No note attests a sort inside an emitter
  (`rendering/utils/blend.ts:92-99`). The engine's fill order needs confirming before the sort
  stays.
- **Game captures.** Findings 3.10, 3.11 and the camera quad roll in 5.7 need a game capture to
  settle.
