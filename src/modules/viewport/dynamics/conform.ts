import {
  axisAngleInto,
  EPSILON,
  multiplyInto,
  normalizeQuat,
  relativeInto,
  rotateInto,
  UP,
} from "./math";
import type { ConformModel } from "./model";
import { LOCAL_FLOATS, type RootTransform, type WorldPose } from "./world";

/** The most points of the unit's path a conform keeps, the newest first. */
const PATH_POINTS = 300;

/** How far the unit moves before its path gains a point. */
const PATH_SPACING = 1;

/** Seconds a conform's mask blend lasts before an event has set one. */
const FIRST_BLEND = 0.2;

/** How far past the last joint the aim of a chain of one joint is put. */
const LONE_REACH = 20;

const RADIANS = Math.PI / 180;

/** One conform and the state a step moves. */
export interface ConformRig {
  readonly model: ConformModel;
  /**
   * Where the child of each joint is aimed, in world space, and one more past the last
   * joint. A step eases the aim of a joint's child, and then stands the joint's own on
   * the joint.
   */
  readonly aims: Float64Array;
  /** The unit's path, the newest point first. */
  readonly path: Float64Array;
  points: number;
  /** Whether each point of the path is a turn. */
  readonly turns: Uint8Array;
  readonly lastRoot: Float64Array;
  /** A step has been taken since the last reset. The first only stands the aims. */
  started: boolean;
  /** The mask's weights by slot, and null for no mask, which weighs every joint whole. */
  mask: readonly number[] | null;
  /** What each joint of the chain is weighed by. */
  readonly weights: Float64Array;
  /** The weights a mask blend started from. */
  readonly previous: Float64Array;
  blending: boolean;
  remaining: number;
  total: number;
}

/**
 * The joints of a conform's chain by slot, the starting joint first: `end`, and every
 * joint above it up to `start`.
 *
 * A joint the skeleton lacks is its first joint, as the game reads one, and a chain whose
 * end is not under its start runs up to the skeleton's root.
 */
export function conformJoints(parents: Int32Array, start: number, end: number): number[] {
  if (parents.length === 0) return [];

  const first = start < 0 ? 0 : start;
  const last = end < 0 ? 0 : end;
  if (last === first) return [last];

  const joints = [last];
  let above = parents[last];
  while (above >= 0 && joints.length <= parents.length) {
    joints.unshift(above);
    if (above === first) break;

    above = parents[above];
  }
  return joints;
}

export function buildConform(model: ConformModel): ConformRig {
  const count = model.joints.length;
  return {
    model,
    aims: new Float64Array((count + 1) * 3),
    path: new Float64Array(PATH_POINTS * 3),
    points: 0,
    turns: new Uint8Array(PATH_POINTS),
    lastRoot: new Float64Array(3),
    started: false,
    mask: model.mask,
    weights: new Float64Array(count),
    previous: new Float64Array(count),
    blending: false,
    remaining: 0,
    total: FIRST_BLEND,
  };
}

/** Stand `rig` back where a unit starts: no path, no aim, its own mask. */
export function resetConform(rig: ConformRig): void {
  rig.points = 0;
  rig.started = false;
  resetConformMask(rig);
}

/** Put `rig` back under its own mask, with no blend under way. */
export function resetConformMask(rig: ConformRig): void {
  rig.mask = rig.model.mask;
  rig.weights.fill(0);
  rig.previous.fill(0);
  rig.blending = false;
  rig.remaining = 0;
  rig.total = FIRST_BLEND;
}

/** Blend `rig` to `mask` over `seconds`, as an event's start and its end do. */
export function blendConformTo(
  rig: ConformRig,
  mask: readonly number[] | null,
  seconds: number,
): void {
  rig.mask = mask;
  rig.total = seconds;
  rig.remaining = seconds;
  rig.blending = true;
  rig.previous.set(rig.weights);
}

/** Move the mask blend of `rig` on by `seconds`. */
export function advanceConformMask(rig: ConformRig, seconds: number): void {
  if (rig.blending) rig.remaining -= seconds;
}

/** Weigh each joint of `rig` by its mask, as far as the mask blend has come. */
export function weighConform(rig: ConformRig): void {
  const { joints } = rig.model;
  const blend = rig.total <= EPSILON ? 1 : 1 - Math.max(rig.remaining, 0) / rig.total;

  for (let at = 0; at < joints.length; at += 1) {
    const held = rig.mask === null ? 1 : (rig.mask[joints[at]] ?? 1);
    rig.weights[at] = (1 - blend) * rig.previous[at] + held * blend;
  }
}

/**
 * One step of `rig` over `dt` seconds, written over the chain's rotations in `locals`.
 *
 * Each joint is turned about the up axis from where the animation points it toward an aim
 * that trails it: the aim starts where the joint's child stood last step, is carried by a
 * part of the unit's velocity that falls off along the chain, and is pulled to the joint by
 * a damped spring. The turn is cut to `maxBoneAngle`, weighed by the mask, and where
 * `onlyInTurns` is set weighed by how near the joint is to a turn of the unit's path.
 *
 * `world` holds the pose of `locals` and is kept current for the chain as its joints turn.
 * Only the unit's root moves a conform, so a unit that stands still leaves the animation
 * as it is. The mask blend is moved on by `advanceConformMask`.
 */
export function stepConformInto(
  rig: ConformRig,
  world: WorldPose,
  parents: Int32Array,
  root: RootTransform,
  dt: number,
  locals: Float32Array,
): void {
  const { model, aims, weights } = rig;
  const { joints } = model;
  const count = joints.length;
  if (count === 0) return;

  if (model.onlyInTurns) {
    trackPath(rig, root.position);
    markTurns(rig);
  }
  if (!rig.started) seedAims(rig, world);

  if (rig.blending && rig.remaining < 0 && rig.mask !== null && rig.started) {
    rig.blending = false;
    rig.remaining = 0;
  }
  if (rig.started) weighConform(rig);

  const moving = dt >= EPSILON;
  const speedX = moving ? (root.position[0] - rig.lastRoot[0]) / dt : 0;
  const speedZ = moving ? (root.position[2] - rig.lastRoot[2]) / dt : 0;
  rig.lastRoot.set(root.position);

  const pull = 36 * model.frequency * model.frequency;
  const eased = (pull / (1 + 9 * model.frequency * model.damping * dt + pull * dt * dt)) * dt;
  const limit = model.maxBoneAngle * RADIANS;

  for (let at = 0; rig.started && at < count; at += 1) {
    const slot = joints[at];
    const x = world.positions[slot * 3];
    const z = world.positions[slot * 3 + 2];

    let alongX = -x;
    let alongZ = -z;
    if (at < count - 1) {
      childInto(NEXT, world, slot, joints[at + 1], locals);
      alongX = NEXT[0] - x;
      alongZ = NEXT[2] - z;
    } else if (count > 1) {
      alongX = aims[(count - 1) * 3] - aims[(count - 2) * 3];
      alongZ = aims[(count - 1) * 3 + 2] - aims[(count - 2) * 3 + 2];
    }

    const aim = (at + 1) * 3;
    const carried = (1 - at / count) * model.velMultiplier;
    aims[aim] += ((x - aims[aim]) * eased + speedX * carried) * dt;
    aims[aim + 2] += ((z - aims[aim + 2]) * eased + speedZ * carried) * dt;
    const toX = aims[aim] - x;
    const toZ = aims[aim + 2] - z;

    const near = model.onlyInTurns ? nearTurn(rig, x, z) : 1;
    let angle = 0;
    if (near !== 0 && (alongX !== 0 || alongZ !== 0) && (toX !== 0 || toZ !== 0)) {
      angle = Math.min(between(alongX, alongZ, toX, toZ), limit);
      if (toX * alongZ - toZ * alongX <= 0) angle = -angle;
    }
    angle *= weights[at] * near;

    aims[at * 3] = x;
    aims[at * 3 + 1] = world.positions[slot * 3 + 1];
    aims[at * 3 + 2] = z;

    axisAngleInto(YAW, 0, UP, 0, angle);
    multiplyInto(world.rotations, slot * 4, YAW, 0, world.rotations, slot * 4);
    const above = parents[slot];
    relativeInto(
      TURN,
      0,
      above < 0 ? root.rotation : world.rotations,
      above < 0 ? 0 : above * 4,
      world.rotations,
      slot * 4,
    );
    normalizeQuat(TURN, 0);
    for (let axis = 0; axis < 4; axis += 1) locals[slot * LOCAL_FLOATS + 3 + axis] = TURN[axis];

    if (at < count - 1) {
      const next = joints[at + 1];
      childInto(NEXT, world, slot, next, locals);
      world.positions.set(NEXT, next * 3);
      for (let axis = 0; axis < 4; axis += 1) TURN[axis] = locals[next * LOCAL_FLOATS + 3 + axis];
      multiplyInto(world.rotations, next * 4, world.rotations, slot * 4, TURN, 0);
    }

    for (const extra of model.extraChains) {
      const length = extra.joints.length;
      if (at >= length) continue;

      const biased = angle - Math.abs(angle) * ((length - at) / length) * extra.rightBias;
      const turned = extra.joints[at] * LOCAL_FLOATS + 3;
      axisAngleInto(YAW, 0, UP, 0, biased);
      for (let axis = 0; axis < 4; axis += 1) TURN[axis] = locals[turned + axis];
      multiplyInto(TURN, 0, YAW, 0, TURN, 0);
      for (let axis = 0; axis < 4; axis += 1) locals[turned + axis] = TURN[axis];
    }
  }

  if (rig.started) extendAims(rig);
  rig.started = true;
}

/** A point of the path where the unit has moved far enough off the newest one. */
function trackPath(rig: ConformRig, position: ArrayLike<number>): void {
  const { path } = rig;
  if (rig.points > 0) {
    if (Math.hypot(path[0] - position[0], path[2] - position[2]) <= PATH_SPACING) return;
    if (rig.points >= PATH_POINTS) rig.points -= 1;
  }

  path.copyWithin(3, 0, rig.points * 3);
  path[0] = position[0];
  path[1] = position[1];
  path[2] = position[2];
  rig.points += 1;
}

/** Every point of the path the unit bent its way at by more than the activation angle. */
function markTurns(rig: ConformRig): void {
  const { path, turns, points } = rig;
  const sharp = Math.cos((180 - rig.model.activationAngle) * RADIANS);

  turns.fill(0, 0, points);
  for (let at = 1; at < points - 1; at += 1) {
    const backX = path[(at - 1) * 3] - path[at * 3];
    const backZ = path[(at - 1) * 3 + 2] - path[at * 3 + 2];
    const onX = path[(at + 1) * 3] - path[at * 3];
    const onZ = path[(at + 1) * 3 + 2] - path[at * 3 + 2];
    if ((backX === 0 && backZ === 0) || (onX === 0 && onZ === 0)) continue;

    const along = backX * onX + backZ * onZ;
    const size = Math.hypot(backX, backZ) * Math.hypot(onX, onZ);
    turns[at] = along > sharp * size ? 1 : 0;
  }
}

/**
 * How near the point `x`, `z` is to a turn of the path: 1 inside the activation distance of
 * one, down to 0 at the blend distance.
 */
function nearTurn(rig: ConformRig, x: number, z: number): number {
  const { activationDistance, blendDistance } = rig.model;
  let near = 0;
  for (let at = 0; at < rig.points; at += 1) {
    if (rig.turns[at] === 0) continue;

    const reach = Math.hypot(rig.path[at * 3] - x, rig.path[at * 3 + 2] - z);
    if (activationDistance > reach) return 1;
    if (blendDistance > reach) {
      near = Math.max(
        1 - (reach - activationDistance) / (blendDistance - activationDistance),
        near,
      );
    }
  }
  return near;
}

/** The angle between two directions on the ground, in radians. */
function between(ax: number, az: number, bx: number, bz: number): number {
  const cosine = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz));
  if (cosine >= 1) return 0;
  if (cosine <= -1) return Math.PI;
  return Math.acos(cosine);
}

/** Where `child` stands under `slot` as `world` now holds `slot`. */
function childInto(
  out: Float64Array,
  world: WorldPose,
  slot: number,
  child: number,
  locals: Float32Array,
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    SCALED[axis] = locals[child * LOCAL_FLOATS + axis] * world.scales[slot * 3 + axis];
  }
  rotateInto(out, 0, world.rotations, slot * 4, SCALED, 0);
  for (let axis = 0; axis < 3; axis += 1) out[axis] += world.positions[slot * 3 + axis];
}

/** The aims on the joints they belong to, which is where a conform starts from. */
function seedAims(rig: ConformRig, world: WorldPose): void {
  rig.model.joints.forEach((slot, at) => {
    for (let axis = 0; axis < 3; axis += 1) {
      rig.aims[at * 3 + axis] = world.positions[slot * 3 + axis];
    }
  });
  extendAims(rig);
}

/** The aim past the last joint: one more step the way the last two aims run. */
function extendAims(rig: ConformRig): void {
  const { aims } = rig;
  const count = rig.model.joints.length;
  const last = (count - 1) * 3;
  for (let axis = 0; axis < 3; axis += 1) {
    aims[count * 3 + axis] =
      count > 1
        ? 2 * aims[last + axis] - aims[last - 3 + axis]
        : aims[axis] + (axis === 0 ? LONE_REACH : 0);
  }
}

const YAW = new Float64Array(4);
const TURN = new Float64Array(4);
const NEXT = new Float64Array(3);
const SCALED = new Float64Array(3);
