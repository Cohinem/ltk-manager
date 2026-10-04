import { CAPSULE_FLOATS, type ChainRig, SPHERE_FLOATS } from "./build";
import { bendCompliance } from "./curve";
import {
  axisAngleInto,
  dot,
  EPSILON,
  length,
  multiplyInto,
  normalizeQuat,
  relativeInto,
  rotateInto,
  shortestArcInto,
  slerpInto,
  unrotateInto,
  UP,
} from "./math";
import { solve } from "./solver";
import { LOCAL_FLOATS, type RootTransform, type WorldPose } from "./world";

/**
 * One step of `rig` over `dt` seconds on the animated pose `world`, as the game steps a
 * dynamics chain once per frame: sync, integrate and attract, solve, limit and restore.
 *
 * "The step is the game's step, at a chosen frame rate" in
 * docs/plans/pose-dynamics-preview.md. A step of no time moves nothing, as a paused unit
 * steps nothing.
 */
export function stepChain(rig: ChainRig, world: WorldPose, root: RootTransform, dt: number): void {
  if (dt < EPSILON) return;

  sync(rig, world, root);
  integrate(rig, dt);
  solve(rig, dt);
  limit(rig);
  settleRotations(rig);
  rig.previousDt = dt;
}

/** The animated pose read onto the nodes, the roots moved to it, and the shapes placed on it. */
function sync(rig: ChainRig, world: WorldPose, root: RootTransform): void {
  const { animPosition, animRotation, position, previous, orientation } = rig;
  for (let node = 0; node < rig.count; node += 1) {
    const slot = rig.joint[node];
    for (let axis = 0; axis < 3; axis += 1) {
      animPosition[node * 3 + axis] = world.positions[slot * 3 + axis];
    }
    for (let axis = 0; axis < 4; axis += 1) {
      animRotation[node * 4 + axis] = world.rotations[slot * 4 + axis];
    }
  }

  for (let node = 0; node < rig.count; node += 1) {
    const reset = rig.resetPending;
    if (rig.pinned[node] === 0 && !reset) continue;

    for (let axis = 0; axis < 3; axis += 1) {
      previous[node * 3 + axis] = reset ? animPosition[node * 3 + axis] : position[node * 3 + axis];
      position[node * 3 + axis] = animPosition[node * 3 + axis];
    }
    for (let axis = 0; axis < 4; axis += 1) {
      orientation[node * 4 + axis] = animRotation[node * 4 + axis];
    }
  }
  rig.resetPending = false;

  for (let node = 0; node < rig.count; node += 1) {
    const above = rig.parent[node];
    if (above < 0) continue;

    for (let axis = 0; axis < 3; axis += 1) {
      BONE[axis] = animPosition[node * 3 + axis] - animPosition[above * 3 + axis];
    }
    if (rig.trees[rig.tree[node]].restFromPose) rig.restLength[node] = length(BONE);

    relativeInto(rig.restTurn, node * 4, animRotation, above * 4, animRotation, node * 4);
    if (rig.oriented[above] === 1 && rig.child[above] === node) {
      unrotateInto(rig.restDirection, above * 3, animRotation, above * 4, BONE, 0);
      const norm = length(rig.restDirection, above * 3) || 1;
      for (let axis = 0; axis < 3; axis += 1) rig.restDirection[above * 3 + axis] /= norm;
    }
  }

  for (const turn of rig.bendTwist) {
    const rest = rig.restLength[turn.node];
    turn.bend = bendCompliance(turn.bendStiffness, rest);
    turn.twist = bendCompliance(turn.twistStiffness, rest);
  }

  placeShapes(rig, world, root);
}

function placeShapes(rig: ChainRig, world: WorldPose, root: RootTransform): void {
  const spheres = rig.model.colliders?.spheres ?? NO_SHAPES;
  const capsules = rig.model.colliders?.capsules ?? NO_SHAPES;

  for (let at = 0; at < spheres.length; at += 1) {
    const sphere = spheres[at];
    placeInto(rig.spheres, at * SPHERE_FLOATS, world, sphere.joint, sphere.centre);
    rig.spheres[at * SPHERE_FLOATS + 3] = sphere.radius;
  }

  for (let at = 0; at < capsules.length; at += 1) {
    const capsule = capsules[at];
    placeInto(rig.capsules, at * CAPSULE_FLOATS, world, capsule.jointA, capsule.endA);
    rig.capsules[at * CAPSULE_FLOATS + 3] = capsule.radiusA;
    placeInto(rig.capsules, at * CAPSULE_FLOATS + 4, world, capsule.jointB, capsule.endB);
    rig.capsules[at * CAPSULE_FLOATS + 7] = capsule.radiusB;
  }

  SCALED[0] = 0;
  SCALED[1] = rig.groundY * root.scale;
  SCALED[2] = 0;
  rotateInto(rig.plane, 0, root.rotation, 0, SCALED, 0);
  for (let axis = 0; axis < 3; axis += 1) rig.plane[axis] += root.position[axis];
  rotateInto(rig.plane, 3, root.rotation, 0, UP, 0);
}

/** `point` of the frame of `joint` as a place of `world`, into `out[at]`. */
function placeInto(
  out: Float64Array,
  at: number,
  world: WorldPose,
  joint: number,
  point: readonly number[],
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    SCALED[axis] = point[axis] * world.scales[joint * 3 + axis];
  }
  rotateInto(out, at, world.rotations, joint * 4, SCALED, 0);
  for (let axis = 0; axis < 3; axis += 1) out[at + axis] += world.positions[joint * 3 + axis];
}

/**
 * Each free particle carried on by what it moved last step, pulled down by gravity, and
 * pulled toward where the animation holds it under its own parent.
 *
 * Parents come first, so a particle is pulled toward its parent's place of this step.
 * `Damping` is what a step takes off the carried motion, whatever the step lasts.
 */
function integrate(rig: ChainRig, dt: number): void {
  const { position, previous, animPosition, animRotation, orientation, gravity } = rig;
  for (let node = 0; node < rig.count; node += 1) {
    if (rig.simulated[node] === 0 || rig.pinned[node] === 1) continue;

    const at = node * 3;
    const above = rig.parent[node];
    const tree = rig.trees[rig.tree[node]];
    const kept = 1 - rig.damping[node];
    const pull = 1 - (1 - rig.attraction[node]) ** (dt * tree.timeScale);

    for (let axis = 0; axis < 3; axis += 1) {
      const here = position[at + axis];
      const velocity =
        rig.previousDt >= EPSILON ? (here - previous[at + axis]) / rig.previousDt : 0;
      const moved = here + kept * velocity * dt + gravity[axis] * dt * dt;
      const held =
        position[above * 3 + axis] + (animPosition[at + axis] - animPosition[above * 3 + axis]);

      previous[at + axis] = here;
      position[at + axis] = moved + (held - moved) * pull;
    }

    if (rig.oriented[node] === 0) continue;
    if (rig.oriented[above] === 1) {
      multiplyInto(QUAT, 0, orientation, above * 4, rig.restTurn, node * 4);
      normalizeQuat(QUAT, 0);
    } else {
      for (let axis = 0; axis < 4; axis += 1) QUAT[axis] = animRotation[node * 4 + axis];
    }
    slerpInto(orientation, node * 4, orientation, node * 4, QUAT, 0, pull);
  }
}

/**
 * Each free particle held inside its cone about the animated bone, then put back at its
 * rest length from its parent.
 *
 * A tree with rod physics keeps its lengths by its constraints, so its cone turns the
 * parent's orientation and nothing restores a length.
 */
function limit(rig: ChainRig): void {
  const { position, animPosition } = rig;
  for (let node = 0; node < rig.count; node += 1) {
    if (rig.simulated[node] === 0 || rig.pinned[node] === 1) continue;

    const at = node * 3;
    const above = rig.parent[node];
    const rods = rig.trees[rig.tree[node]].rods;
    for (let axis = 0; axis < 3; axis += 1) {
      BONE[axis] = animPosition[at + axis] - animPosition[above * 3 + axis];
      SWING[axis] = position[at + axis] - position[above * 3 + axis];
    }

    const cone = rig.limitAngle[node];
    const boneLength = length(BONE);
    const swingLength = length(SWING);
    if (cone < 180 && boneLength > EPSILON && swingLength > EPSILON) {
      const cosine = Math.min(Math.max(dot(BONE, 0, SWING, 0) / (boneLength * swingLength), -1), 1);
      const over = Math.acos(cosine) - (cone * Math.PI) / 180;
      if (over > 0) {
        AXIS[0] = BONE[1] * SWING[2] - BONE[2] * SWING[1];
        AXIS[1] = BONE[2] * SWING[0] - BONE[0] * SWING[2];
        AXIS[2] = BONE[0] * SWING[1] - BONE[1] * SWING[0];
        const norm = length(AXIS);
        if (norm > EPSILON) {
          for (let axis = 0; axis < 3; axis += 1) AXIS[axis] /= norm;
          axisAngleInto(QUAT, 0, AXIS, 0, -over);
          rotateInto(SWING, 0, QUAT, 0, SWING, 0);
          if (rods && rig.oriented[above] === 1 && rig.pinned[above] === 0) {
            multiplyInto(rig.orientation, above * 4, QUAT, 0, rig.orientation, above * 4);
            normalizeQuat(rig.orientation, above * 4);
          }
        }
      }
    }

    let reach = 1;
    if (!rods && swingLength > EPSILON) {
      const stretch = rig.stretch[node];
      reach = ((1 - stretch) * rig.restLength[node] + stretch * swingLength) / swingLength;
    }
    for (let axis = 0; axis < 3; axis += 1) {
      position[at + axis] = position[above * 3 + axis] + SWING[axis] * reach;
    }
  }
}

/**
 * The rotation each node leaves the step with.
 *
 * A root keeps the animation's. A rod keeps its orientation. A joint with one simulated
 * child is aimed at it by the shortest turn from the animated bone, so its twist stays
 * the animation's. A tip, a branch point and an unsimulated joint ride their parent.
 */
function settleRotations(rig: ChainRig): void {
  const { simRotation, animRotation, animPosition, position } = rig;
  for (let node = 0; node < rig.count; node += 1) {
    const at = node * 4;
    const above = rig.parent[node];
    const child = rig.child[node];

    if (above < 0) {
      for (let axis = 0; axis < 4; axis += 1) simRotation[at + axis] = animRotation[at + axis];
    } else if (rig.simulated[node] === 1 && rig.oriented[node] === 1) {
      for (let axis = 0; axis < 4; axis += 1) simRotation[at + axis] = rig.orientation[at + axis];
    } else if (rig.simulated[node] === 1 && child >= 0) {
      for (let axis = 0; axis < 3; axis += 1) {
        BONE[axis] = animPosition[child * 3 + axis] - animPosition[node * 3 + axis];
        SWING[axis] = position[child * 3 + axis] - position[node * 3 + axis];
      }
      shortestArcInto(QUAT, 0, BONE, 0, SWING, 0);
      multiplyInto(simRotation, at, QUAT, 0, animRotation, at);
    } else {
      multiplyInto(simRotation, at, simRotation, above * 4, rig.restTurn, at);
    }
    normalizeQuat(simRotation, at);
  }
}

/**
 * The step's result written over `locals` for every free joint, blended by `weight`.
 *
 * Each joint is written relative to its parent node's simulated transform, its position
 * mixed and its rotation turned toward the simulated one by `weight` times the chain's
 * envelope times the joint's own. The scale is left as the animation set it, and a root
 * is never written. `world` is the animated pose the step ran on.
 */
export function writeChainInto(
  rig: ChainRig,
  world: WorldPose,
  weight: number,
  locals: Float32Array,
): void {
  const { position, simRotation } = rig;
  for (let node = 0; node < rig.count; node += 1) {
    if (rig.simulated[node] === 0 || rig.pinned[node] === 1) continue;

    const above = rig.parent[node];
    const blend = weight * rig.model.globalEnvelope * rig.envelope[node];
    const at = rig.joint[node] * LOCAL_FLOATS;
    const parentSlot = rig.joint[above];

    for (let axis = 0; axis < 3; axis += 1) {
      SWING[axis] = position[node * 3 + axis] - position[above * 3 + axis];
    }
    unrotateInto(BONE, 0, simRotation, above * 4, SWING, 0);
    for (let axis = 0; axis < 3; axis += 1) {
      const scale = world.scales[parentSlot * 3 + axis];
      const simulated = scale === 0 ? 0 : BONE[axis] / scale;
      locals[at + axis] += (simulated - locals[at + axis]) * blend;
    }

    relativeInto(QUAT, 0, simRotation, above * 4, simRotation, node * 4);
    for (let axis = 0; axis < 4; axis += 1) AXIS[axis] = locals[at + 3 + axis];
    slerpInto(AXIS, 0, AXIS, 0, QUAT, 0, blend);
    for (let axis = 0; axis < 4; axis += 1) locals[at + 3 + axis] = AXIS[axis];
  }
}

const NO_SHAPES: readonly never[] = [];
const SCALED = new Float64Array(3);
const BONE = new Float64Array(3);
const SWING = new Float64Array(3);
const AXIS = new Float64Array(4);
const QUAT = new Float64Array(4);
