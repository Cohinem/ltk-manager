import {
  axisAngleInto,
  EPSILON,
  multiplyInto,
  normalizeQuat,
  relativeInto,
  shortestTurn,
  unrotateInto,
  UP,
  yawOf,
} from "./math";
import type { SpringModel } from "./model";
import { LOCAL_FLOATS, type RootTransform, type WorldPose } from "./world";

/** The steps a spring lets pass before it moves, as the game lets two frames pass. */
const WARM_UP_STEPS = 2;

/** How far inside its limit a spring is put back once it passes it. */
const LIMIT_SLACK = 0.99;

/** One spring and the state a step moves: an offset and a yaw, each with its velocity. */
export interface SpringRig {
  readonly model: SpringModel;
  /** How far the joint trails the unit, in world space. */
  readonly offset: Float64Array;
  readonly velocity: Float64Array;
  /** How far the joint trails the unit's turning, in radians about the up axis. */
  angle: number;
  spin: number;
  readonly lastPosition: Float64Array;
  lastYaw: number;
  /** The steps taken since the last reset, up to the warm-up. */
  warmed: number;
}

export function buildSpring(model: SpringModel): SpringRig {
  return {
    model,
    offset: new Float64Array(3),
    velocity: new Float64Array(3),
    angle: 0,
    spin: 0,
    lastPosition: new Float64Array(3),
    lastYaw: 0,
    warmed: 0,
  };
}

/** Stand `rig` back where a unit starts: at rest, with its warm-up ahead of it. */
export function resetSpring(rig: SpringRig): void {
  rig.offset.fill(0);
  rig.velocity.fill(0);
  rig.angle = 0;
  rig.spin = 0;
  rig.warmed = 0;
}

/** Whether `rig` trails the unit by nothing, so it lays nothing over its joint. */
export function springRests(rig: SpringRig): boolean {
  return rig.angle === 0 && rig.offset[0] === 0 && rig.offset[1] === 0 && rig.offset[2] === 0;
}

/**
 * One step of `rig` over `dt` seconds: the unit's movement and turning since the last
 * step push the joint off, and a damped spring pulls it back.
 *
 * Only the unit's root moves a spring, so a unit that stands still leaves it at rest. A
 * value past its limit is put back just inside it with its velocity taken away, and a
 * spring that runs away to no number starts over.
 */
export function stepSpring(rig: SpringRig, root: RootTransform, dt: number): void {
  if (dt < EPSILON) return;

  const { model, offset, velocity, lastPosition } = rig;
  const yaw = yawOf(root.rotation);
  if (rig.warmed >= WARM_UP_STEPS && model.mass > EPSILON) {
    const pull = model.stiffness / model.mass;
    const drag = model.damping / model.mass;

    if (model.doTranslation) {
      for (let axis = 0; axis < 3; axis += 1) {
        offset[axis] += lastPosition[axis] - root.position[axis];
        velocity[axis] += (-pull * offset[axis] - drag * velocity[axis]) * dt;
        offset[axis] += velocity[axis] * dt;
      }

      const reach = Math.hypot(offset[0], offset[1], offset[2]);
      if (model.maxDistance > 0 && reach > model.maxDistance) {
        const cut = (model.maxDistance * LIMIT_SLACK) / reach;
        for (let axis = 0; axis < 3; axis += 1) offset[axis] *= cut;
        velocity.fill(0);
      }
    }

    if (model.doRotation) {
      rig.angle += shortestTurn(yaw - rig.lastYaw);
      rig.spin += (-pull * rig.angle - drag * rig.spin) * dt;
      rig.angle = shortestTurn(rig.angle + rig.spin * dt);

      const limit = (model.maxAngle * Math.PI) / 180;
      if (limit > 0 && Math.abs(rig.angle) > limit) {
        rig.angle = Math.sign(rig.angle) * limit * LIMIT_SLACK;
        rig.spin = 0;
      }
    }

    if (!finite(rig)) resetSpring(rig);
  }

  rig.warmed = Math.min(rig.warmed + 1, WARM_UP_STEPS);
  rig.lastPosition.set(root.position);
  rig.lastYaw = yaw;
}

/**
 * The spring's offset and yaw laid over its joint's local transform in `locals`, by `weight`.
 *
 * The offset is turned into the frame of the joint's parent and the yaw is about the up
 * axis. `world` holds the pose down to the joint's parent, which is why a spring is
 * applied as the pose is composed.
 */
export function applySpringInto(
  rig: SpringRig,
  world: WorldPose,
  parents: Int32Array,
  root: RootTransform,
  weight: number,
  locals: Float32Array,
): void {
  const { model } = rig;
  const slot = model.joint;
  if (slot < 0 || weight === 0) return;

  const sign = (model.invert ? -1 : 1) * weight;
  const at = slot * LOCAL_FLOATS;
  const above = parents[slot];
  const parentRotation = above < 0 ? root.rotation : world.rotations;
  const from = above < 0 ? 0 : above * 4;

  if (model.doTranslation) {
    unrotateInto(MOVED, 0, parentRotation, from, rig.offset, 0);
    for (let axis = 0; axis < 3; axis += 1) locals[at + axis] += MOVED[axis] * sign;
  }

  if (model.doRotation) {
    axisAngleInto(YAW, 0, UP, 0, rig.angle * sign);
    for (let axis = 0; axis < 4; axis += 1) TURN[axis] = locals[at + 3 + axis];
    for (let axis = 0; axis < 4; axis += 1) PARENT[axis] = parentRotation[from + axis];

    multiplyInto(YAW, 0, YAW, 0, PARENT, 0);
    relativeInto(YAW, 0, PARENT, 0, YAW, 0);
    multiplyInto(TURN, 0, YAW, 0, TURN, 0);
    normalizeQuat(TURN, 0);
    for (let axis = 0; axis < 4; axis += 1) locals[at + 3 + axis] = TURN[axis];
  }
}

/** Whether every value a step moves is a number. */
function finite(rig: SpringRig): boolean {
  const { offset, velocity } = rig;
  return (
    Number.isFinite(offset[0] + offset[1] + offset[2]) &&
    Number.isFinite(velocity[0] + velocity[1] + velocity[2]) &&
    Number.isFinite(rig.angle + rig.spin)
  );
}

const MOVED = new Float64Array(3);
const YAW = new Float64Array(4);
const TURN = new Float64Array(4);
const PARENT = new Float64Array(4);
