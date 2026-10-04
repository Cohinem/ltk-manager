# ADR-0063: A socket is a slot past the last joint

- **Status:** Accepted (2026-10-03)
- **Date:** 2026-10-03
- **Related:** [ADR-0035](0035-a-skinned-preview-is-a-skinned-mesh-posed-by-a-baked-clip.md),
  whose pose answers a joint by name. Decision 3.7 of `docs/plans/pose-dynamics-preview.md`.

## Context and problem statement

A skin's `SocketDefinitions` declare named points that are not joints of its skeleton. In
the game, anything that looks a bone up by name finds a socket when no joint has the name:
an effect's attach point, a missile's start bone, a joint snap event. The preview's
consumers reach a joint through `Pose.jointNamed` and `Pose.worldInto`, by slot.

The question is how a socket reaches those consumers without each of them learning what a
socket is.

## Considered options

1. **Add each socket to the skeleton as a joint.** Every consumer would find it with no
   wrapper. It would also be skinned to, weighed by masks and drawn as a bone, and a socket
   edit would rebuild the skeleton and everything keyed on it.
2. **A second lookup beside the pose.** Each consumer would have to ask both, and the game's
   rule that a joint wins would be written once per consumer.
3. **A pose wrapper that answers a socket as a slot past the joint count.**

## Decision

Option 3.

**`socketedPose` wraps the final pose and answers a socket as a slot past the joint count.**
`jointNamed` tries the joints, then the sockets in list order. `worldInto` on such a slot
runs the socket's resolver over the pose it wraps, so a socket on a simulated joint follows
the simulation.

**The lookup rules are the game's.** A joint with the name wins. The first socket with a
name wins. A single joint socket whose parent joint is missing answers no slot, and the
lookup does not fall through to a later socket of the name.

**The skeleton is the wrapped pose's own.** A socket adds no joint to it, so the mask
weights, the armature and the skinning see the joints alone, and a socket edit rebuilds
none of them.

## Consequences

- An idle effect or a clip effect that names a socket draws on it with no change to the
  effect code.
- A consumer that indexes joints by slot must stay under the skeleton's joint count. The
  ones that walk the skeleton already do.
- A lookup by hash, which a clip event carries, has to ask the pose for its sockets after
  its joints. `jointSlot` does.
