# VFX starter templates and the automatic rig

> Status: **phases 0 to 5 built** (2026-09-29), with the departures in section 4. The decisions
> in section 2 were settled with the maintainer over four rounds of questions. Section 1 is
> evidence gathered the same day against `bc6426f4` and the installed game's
> `Global.wad.client` of patch 2026-09-23.

A new effect starts today as an empty emitter that draws nothing. This plan adds templates an
author starts from, and replaces the preview rig an author picks by hand with one that picks
itself.

## 1. Current state

### The rig

The rig is decision 2.9 of `docs/plans/vfx-particle-renderer.md`: a `Motion` (`still`, `path`,
`orbit`, `bone`) and a `RigLife` (`once`, `loop`), offered as the presets Still, Burst, Missile and
Trail (`RIG_PRESETS` in `src/modules/workshop/bin/vfx/engine/model/rig.ts`).

| Problem                                                        | Where                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Every preset stands at `STAND_HEIGHT`, 100 units               | `rig.ts`. The skin, ability, spell flight and map previews all build their rigs at height 0   |
| A ground-layer emitter ignores that lift                       | `GROUND_LAYER` in `rendering/shaders/quad.ts` and `meshPrelude.ts` sets `y` to `GROUND_LEVEL` |
| Picking a preset discards the height and the stop              | `RigControl.tsx` sets `RIG_PRESETS[preset]` whole                                             |
| Still and Burst differ only in `life`, which Loop also changes | `rig.ts`, `playback/state/run.tsx`                                                            |
| Every system opens on Burst                                    | `OPENING_RIG` in `rig.ts`, read by `VfxRunProvider`                                           |
| The lift and the path turn with the system's own `transform`   | `place` in `engine/simulation/driver.ts`, `placed` in `rendering/utils/systemBounds.ts`       |

The last row is not settled. Decision 2.9 says the game keeps the attachment on the system
instance, which suggests the attachment applies outside the definition's transform, where the
driver applies it inside. It is tracked apart from this plan, as #739, until a rotated system is
compared against the game.

### Templates

Nothing exists. The nearest feature is New emitter (`newEmitterEdits` in
`vfx/drivers/components/QuickAdd.tsx`). The pieces a template needs are in place:

- `pasteItem` lands a whole struct from `ltk-manager/bin-value` clipboard text, one `editProperty`
  call is one undo step, and a call takes up to 64 edits (`bin_document/property_edit.rs`)
- only a declared document creates an object, through `NewObject::Clone` or `NewObject::Class`
  (ADR-0049). The declarations format already expresses a whole object as `class` and `set`.
- the preview draws nothing for an emitter with no texture, and no planar projection at all

The hash list holds 31,296 paths under `assets/shared/particles/`, and 1,619 of them ship in
`Global.wad.client`. A template references only those.

### Where a system's context comes from

The skin preview builds Bone rigs for idle effects and clip cues (`idleRig`, `cueRig` in
`skin/utils/skinScene.ts`), and the spell preview builds a Flight rig from a missile spec
(`compileFlight` in `spells/utils/flight.ts`). Both go forward from a skin or a spell. Find all
references walks the whole game in about 1.4 s warm, but only once the object index is built,
which is off by default, and a system is mostly reached through a `ResourceResolver` key that
every skin and spell asking for it shares.

## 2. Decisions

### 2.1 A rig is a carrier and a playback

| Part     | Values                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------- |
| Carrier  | Ground (still, height 0), Bone (a joint of a character), Flight (a path at a speed), Orbit      |
| Playback | Once, Replay (starts over after its run), Continuous (never restarts, Stop at shows the linger) |
| Source   | Automatic, from a template, from a context such as a skin or a spell, or Custom                 |

The presets go. "Carrier" is a word for the code and the docs, and the pill shows the kind names
alone. Height is a field of Flight and of a custom offset, and Ground stands at 0, as every other
preview in the app does. The two rules of decision 2.9 stay: the phase is read off the clock, and
changing the motion restarts where tuning it does not.

### 2.2 The rig picks itself

In order, the first that answers:

1. **The context the system was opened from.** "Open effect" on a skin idle effect, a clip cue or
   a spell's missile or hit effect opens the system with the rig that view already builds. A
   spell passes its exact Flight, cast bone to target at its speed, stopping at landing. A Bone
   rig draws the skin's posed character, the clip's clock rules, and a cue's system starts at the
   cue's time in each loop of the clip. An idle effect runs Continuous under the looping idle
   clip.
2. **A template's rig**, for a system a template made.
3. **The system alone.** Continuous if any emitter has no `lifetime`, else Replay. Orbit if any
   emitter draws a trail, else Ground.

A reverse lookup through Find all references is not part of this plan.

### 2.3 What is remembered

A Custom rig and a rig passed from a context last for the session, per ADR-0037, and the pill
names their source, such as "From Ahri idle: R_Hand". Reset to auto returns to the automatic
rig. An automatic rig is not remembered, so it follows an edit of the system, at the run's next
restart rather than under the author.

The timeline's Loop switch is a shortcut between Replay and Once, and is disabled under
Continuous.

### 2.4 A template is a stored value

A template is `ltk-manager/bin-value` clipboard text, kept in a catalog in `ltk-manager-core`
beside its id, its rig (the kinds and the parameters it was tuned on) and the patch it was
checked on in game. A system template stores its emitters whole rather than as emitter templates
with overrides.

| Landing                               | Edit                                                                                 | Documents       |
| ------------------------------------- | ------------------------------------------------------------------------------------ | --------------- |
| An emitter template into a system     | `pasteItem`, then `setLeaf` of `emitterName` to `Sparks`, `Sparks2` and on, one call | Plain, declared |
| A system template into an open system | The same pair per emitter, one call                                                  | Plain, declared |
| A new system from a template          | `NewObject::Template { id }`, declared as `class` and `set`                          | Declared only   |

The name written is the template's fixed English name, never the translated title. Templates
are offered in the quick add, in an Add emitter submenu of the Graph menus and the inspector's
emitter actions, and as a step of the new object line once `VfxSystemDefinitionData` is picked.

### 2.5 Assets and checks

A template references game paths and copies nothing. It is added even where an asset is missing,
and the picker marks it where the game index can tell. A Rust test checks every template's
shape: it parses as its class, every emitter names a texture, it sets no `importance` or
`colorblindVisibility`, it draws no planar projection, and it holds at most 32 emitters. An
opt-in check on each patch confirms every path is in `Global.wad.client`.

A template ships once it is checked in game through a test mod, recorded as the patch in its
catalog entry.

### 2.6 First batch

- Emitter templates: Glow, Sparks, Smoke puff, Shockwave ring, Trail, Distortion
- System templates: Explosion (Ground, Replay), Missile (Flight, Replay), Aura (Ground, Continuous)

The starting values come from a generator and are then tuned in the app, checked in game and saved
back through Copy emitter. The generator goes once the files are saved from the app.

### 2.7 Records

An ADR for the rig model, and one for the template origin of a new object, which extends
ADR-0049. `CONTEXT.md` gains VFX template, rig, carrier and playback.

## 3. Phases

| Phase | Scope                                                                                           | Issue |
| ----- | ----------------------------------------------------------------------------------------------- | ----- |
| 0     | Rig fixes: height 0 by default, the height and the stop kept across a preset switch             | #732  |
| 1     | The carrier and the playback, the rules from the system alone, the pill's source, Loop          | #733  |
| 2     | Emitter templates: catalog, command, the six templates, checks, quick add and menus             | #734  |
| 3     | System templates into an open system, and the template's rig                                    | #735  |
| 4     | A new VFX system from a template in a declared document                                         | #736  |
| 5     | Context entry points: spell Flight first, then skin Bone with the character drawn               | #737  |
| 6     | Later: the other thirteen templates, live thumbnails, copying assets, an author's own templates | #738  |

Each phase ships on its own.

## 4. As built

Where the build departs from section 2, and what is still open:

- **No template is checked in game yet.** Every catalog entry's `checked` is empty, and the test
  that requires it is ignored until a person checks each template through a test mod. The
  values are the generator's first draft (`crates/ltk-manager-core/examples/vfx_template_values.rs`).
- **A distortion's texture is white.** The game's `DISTORTION_PS` multiplies the frame by the
  emitter's texture and takes its coverage from the normal map's alpha, so the Distortion
  template and the Heat emitters of Explosion and Missile use `white.tex` and the BC3
  `base_circle_normal.tex`. The first draft's `glow-soft.tex` drew a black square.
- **A Continuous run spans the minute a seek reaches**, `CONTINUOUS_RUN`, rather than a window
  that follows the playhead.
- **The skin's entry point is a menu in the skin preview**, beside the effects switch, which
  lists the idle effects and the particle events of the clip playing. The rows of the idle
  effect table have no pose to build a rig from, and a clip row has none for a clip that is not
  playing.
- **A skin's effect draws its character only where the skin and the system share a file**,
  since the particle preview picks its character among the skins of the system's own file. A
  system a linked file declares opens on the joint with no character.
- **A bone rig may carry the clip's length** as `period`, which a particle event's run replays
  on, so each replay fires on the event's frame.
