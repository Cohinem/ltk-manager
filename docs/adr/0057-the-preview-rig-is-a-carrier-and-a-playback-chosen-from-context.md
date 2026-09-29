# ADR-0057: The preview rig is a carrier and a playback, chosen from context

- **Status:** Accepted (2026-09-29)
- **Date:** 2026-09-29
- **Related:** Replaces the presets of decision 2.9 in `docs/plans/vfx-particle-renderer.md`.
  `docs/plans/vfx-templates.md` sections 2.1 to 2.3. ADR-0037 (the run is the shell's).

## Context and problem statement

A `VfxSystemDefinitionData` does not say where an effect goes. The engine keeps that on the system
instance, so a preview supplies it. Decision 2.9 offered four presets, Still, Burst, Missile and
Trail, each a motion and a lifecycle, all standing 100 units off the ground, and every system
opened on Burst.

Every other preview in the app stands a system on the ground, so one system read at two heights,
and a ground-layer emitter drew on the floor under the rest of its own system. Still and Burst
were one motion, and the Loop switch changed which of them the pill should have named. A missile
opened standing still, and a looping aura restarted at an arbitrary span.

## Decision

**A rig is a carrier and a playback.** The carrier is Ground, Bone, Flight or Orbit, and says where
the origin is and how it moves. The playback is Once, Replay or Continuous, and says whether and
when the run starts over. A Continuous run never restarts, so a stop shows the linger. Ground
stands at height 0.

**The rig picks itself, and says where it came from.** A context the system was opened from
comes first, such as a skin's idle effect or a spell's missile, then a template's rig, then rules
read off the system: Continuous where an emitter has no `lifetime`, and Orbit where one draws a
trail. The pill names the source. Any change makes the rig Custom, and Reset to auto returns.

**Only a rig the author or a context chose is remembered.** An automatic rig is read again from
the system, so it follows an edit at the run's next restart.

## Consequences

- **Positive:** a system reads at the same height in its own tab as on the champion and the map,
  and a new effect opens on a rig that fits it without a choice.
- **Positive:** the Loop switch has one meaning, a shortcut between Replay and Once.
- **Negative:** an effect authored about a floating origin now opens on the ground, and the author
  lifts it with a custom offset.
- **Neutral:** whether the attachment applies inside or outside the system's own `transform` is
  not decided here.
