# ADR-0065: A missile rig flies the spell's own movement

- **Status:** Accepted (2026-10-15)
- **Date:** 2026-10-15
- **Related:** Amends
  [ADR-0057](0057-the-preview-rig-is-a-carrier-and-a-playback-chosen-from-context.md), whose carriers
  were Ground, Bone, Flight and Orbit and whose system rule put a system with a trail on Orbit.
  Decision 2.56 of `docs/plans/vfx-particle-renderer.md` holds the formulas.

## Context and problem statement

The Flight carrier flew a straight level line at one speed, and the Orbit carrier flew a circle.
Neither is how the game moves a missile. A spell's `MissileSpecification` names a movement class,
a height solver and a vertical facing, and the client moves the missile by them. Most systems with
a trail are missiles, so the rule that put a trailed system on Orbit showed most missiles circling.

## Decision

**The carriers are Ground, Missile and Bone.** A Missile rig holds a `MissileFlight`: one of the
movement classes that the preview can simulate, an optional height solver, the vertical facing,
whether the target stands at the launch height, and a target height offset. The classes are
`FixedSpeedMovement`, `FixedTimeMovement`, `AcceleratingMovement`, `DecelToLocationMovement`, the
two spline movements, `PhysicsMovement`, `CircleMovement` and `SyncCircleMovement`.
`WallFollowMovement` and `TrackMouseMovement` depend on the map and the cursor, so they are not
simulated.

**A flight is simulated once into a track.** The movement, the height solver and the facing are
stepped at a fixed step of 1/120 s until the movement completes or 30 s pass. The origin and the
facing are read from the track, so a seek reaches what a play reaches. The system's frame takes
local `Y` along the 3D travel and local `Z` up, as the 16.17 client orients a missile's system.

**A system flies the missile of the spell that fires it.** The backend finds the resolver keys that
map to the system in its skin's bin and in the open bin, then the spells of its character whose
`mMissileEffectKey`, `mMissileEffectPlayerKey` or `mMissileEffectEnemyKey` is one of them. The auto
rig flies the first of their missiles that the preview can simulate, replayed, and the pill names
the spell. Without such a spell, a system with a trail flies a straight fixed-speed missile, and
any other system follows the rules of ADR-0057.

**A template keeps its carrier names.** A Flight template flies a fixed-speed missile at its speed,
and an Orbit template a circle.

## Consequences

- **Positive:** a missile opens on its spell's speed, curve and arc, and an author can try any
  movement class without the spell.
- **Positive:** the ability preview's projectile flies the same simulated movement.
- **Negative:** a spell whose missile key is set from script, or that lives in an unnamed bin, is
  not found, and its system falls back to the trail rule.
- **Negative:** the preview ground is flat, so `FollowTerrainHeightSolver` holds a constant height.
