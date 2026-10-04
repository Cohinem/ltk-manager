# ADR-0062: A simulated pose is a pass baked from the clip

- **Status:** Accepted (2026-10-04)
- **Date:** 2026-10-04
- **Related:** [ADR-0035](0035-a-skinned-preview-is-a-skinned-mesh-posed-by-a-baked-clip.md),
  whose pose is a pure function of time. Decisions 3.2 to 3.4 of
  `docs/plans/pose-dynamics-preview.md`.

## Context and problem statement

A skin's pose modifiers simulate joints: a spring lags one joint behind the unit, and a
dynamics chain swings trees of joints under gravity and the unit's movement. A simulation has
state, and its pose at a time depends on every step before it. ADR-0035 makes the pose a pure
function of time, and a seek, a scrub, a cue rig and a particle that poses by age all rely on
that.

The question is how a pose with state stays a function of time.

## Considered options

1. **Step the simulation in the render loop.** It is what the game does. A seek would then
   show whatever the state held, two consumers asking for two times would disagree, and a
   particle posed by age could not be replayed.
2. **Replay the simulation from zero on every seek.** It keeps the pose a function of time
   at the cost of a replay per seek, and the pose a scrub shows would depend on how far the
   clock had run rather than on the frame.
3. **Bake the simulation into one pass of the clip, and sample the pass.**

## Decision

Option 3.

**The simulation is baked into one pass and the pose samples it.** A bake takes the clip
pose, a function of time, steps the simulation at a fixed rate over the warm-up passes of
the loop, and records one pass: the local transform of every simulated joint, per frame.
`simulatedPose` wraps the clip pose and reads those joints from the pass.

**The unit stands still in the pass.** A bake moves the simulation's root transform by a
motion, also a function of time, and the preview gives it a unit that stands. The pass shows
what the clip's own movement does to the simulated joints.

**The rate is the reader's.** The game steps a chain once per frame and takes its damping
off per frame, so a bake has a simulated frame rate rather than a hidden constant.

**A change bakes again under the same pose.** A bake is a function of the modifiers, the
clip, the rate and the clip's events, and a change of any of them starts a new bake. The
wrapper keeps its identity and swaps its pass, so the clock does not restart and nothing that
rides the pose is rebuilt. A bake runs a few milliseconds a frame, and the viewport shows the
last pass until the next lands.

**A unit the reader moves is simulated live.** A drag of the character cannot be a pass.
While the Move gizmo is on, the same stepper runs each frame under where the gizmo stands the
unit, and the pose answers the last step whatever time is asked. Turning the gizmo off
returns to the pass.

## Consequences

- Every consumer of a pose reads a simulated one without knowing it is simulated.
- The loop seam is continuous only once the warm-up reaches the steady state. A chain that
  never settles shows a jump at the seam.
- What a reader sees is the steady state of the loop, not the first seconds after a unit
  spawns.
- The live simulation is the one pose that is not a function of time. It holds for as long
  as the gizmo is on and not for the drag alone, so the reader sees the joints settle after
  a release.
