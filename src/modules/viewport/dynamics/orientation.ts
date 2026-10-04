import {
  axisAngleInto,
  dot,
  EPSILON,
  length,
  multiplyInto,
  relativeInto,
  rotateInto,
  slerpInto,
  unrotateInto,
} from "./math";
import type { OrientationModel, Vec3 } from "./model";
import { LOCAL_FLOATS, type RootTransform, type WorldPose } from "./world";

const AXES: readonly Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** One joint orientation and what a step reads of it: its three axes and its limit. */
export interface OrientationRig {
  readonly model: OrientationModel;
  /** The axis every turn is about, which is the normal of the plane the joint turns in. */
  readonly normal: Float64Array;
  /** The axis the plane tilts about to hold the direction, and null for no tilt. */
  readonly tilt: Float64Array | null;
  /** The axis of the joint that is pointed along the direction, and null for no turn. */
  readonly aim: Float64Array | null;
  /** The most the joint turns in its plane, in radians. */
  readonly limit: number;
}

/**
 * `PlaneConstraint` numbers the normal z, y, x. An axis field numbers none, x, y, z, and an
 * axis that is the normal reads as none.
 */
export function buildOrientation(model: OrientationModel): OrientationRig {
  const normalAxis = [2, 1, 0][model.planeConstraint] ?? 1;
  const axis = (choice: number, negated: boolean): Float64Array | null => {
    const at = choice - 1;
    if (at < 0 || at > 2 || at === normalAxis) return null;
    return Float64Array.from(AXES[at], (value) => (negated ? -value : value));
  };

  return {
    model,
    normal: Float64Array.from(AXES[normalAxis]),
    tilt: axis(model.tiltAxis, model.flipped),
    aim: axis(model.aimAxis, model.aimNegated),
    limit: (model.maxAngle * Math.PI) / 180,
  };
}

/**
 * The rotation that points the rig's aim axis along `direction`, in the space `direction`
 * is in, into `out`.
 *
 * The plane first tilts about the tilt axis until it holds the direction, then the aim
 * axis turns about the normal toward it by no more than the limit. The turn is measured
 * as the whole angle between the two, signed by the normal.
 */
export function aimInto(out: Float64Array, rig: OrientationRig, direction: ArrayLike<number>) {
  const size = length(direction);
  for (let axis = 0; axis < 3; axis += 1) AIMED[axis] = direction[axis] / size;

  out.set(IDENTITY);
  if (rig.model.flipped) {
    axisAngleInto(TURN, 0, rig.normal, 0, Math.PI);
    multiplyInto(out, 0, out, 0, TURN, 0);
  }

  if (rig.tilt !== null) {
    crossInto(ACROSS, rig.tilt, AIMED);
    const span = length(ACROSS);
    if (span * span > EPSILON) {
      for (let axis = 0; axis < 3; axis += 1) ACROSS[axis] /= span;
    }

    const angle = signedAngle(rig.normal, ACROSS, rig.tilt);
    axisAngleInto(TURN, 0, rig.tilt, 0, rig.model.flipped ? -angle : angle);
    multiplyInto(out, 0, out, 0, TURN, 0);
  }

  if (rig.aim !== null) {
    unrotateInto(ACROSS, 0, out, 0, AIMED, 0);
    const angle = signedAngle(rig.aim, ACROSS, rig.normal);
    axisAngleInto(TURN, 0, rig.normal, 0, Math.max(-rig.limit, Math.min(rig.limit, angle)));
    multiplyInto(out, 0, out, 0, TURN, 0);
  }
  return out;
}

/**
 * One step of `rig`: each of its joints in `locals` turns toward the model's source by
 * `weight`, whatever the clip turned it to.
 *
 * `world` holds the pose as composed before the step and `compose` composes it again,
 * which the step asks for after each joint since a joint of the list may hang under an
 * earlier one. A direction of no length turns nothing, where the game does not guard one.
 */
export function applyOrientationInto(
  rig: OrientationRig,
  world: WorldPose,
  parents: Int32Array,
  root: RootTransform,
  weight: number,
  locals: Float32Array,
  compose: () => void,
): void {
  const { source } = rig.model;
  if (source === null || weight <= 0) return;

  SOURCE.set(source.vector);
  if (source.rides) {
    rotateInto(SOURCE, 0, root.rotation, 0, SOURCE, 0);
    if (source.position) {
      for (let axis = 0; axis < 3; axis += 1) SOURCE[axis] += root.position[axis];
    }
  }

  for (const slot of rig.model.joints) {
    for (let axis = 0; axis < 3; axis += 1) {
      TOWARD[axis] = SOURCE[axis] - (source.position ? world.positions[slot * 3 + axis] : 0);
    }
    if (length(TOWARD) < EPSILON) continue;

    const above = parents[slot];
    const parentRotation = above < 0 ? root.rotation : world.rotations;
    const from = above < 0 ? 0 : above * 4;
    const at = slot * LOCAL_FLOATS + 3;

    aimInto(TARGET, rig, TOWARD);
    relativeInto(TARGET, 0, parentRotation, from, TARGET, 0);
    for (let axis = 0; axis < 4; axis += 1) LOCAL[axis] = locals[at + axis];
    slerpInto(LOCAL, 0, LOCAL, 0, TARGET, 0, Math.min(weight, 1));
    for (let axis = 0; axis < 4; axis += 1) locals[at + axis] = LOCAL[axis];
    compose();
  }
}

/** The angle from `a` to `b`, negative where the turn runs against `axis`. */
function signedAngle(a: ArrayLike<number>, b: ArrayLike<number>, axis: ArrayLike<number>): number {
  const sizes = Math.sqrt(dot(a, 0, a, 0) * dot(b, 0, b, 0));
  if (sizes < EPSILON) return 0;

  const cosine = Math.max(-1, Math.min(1, dot(a, 0, b, 0) / sizes));
  crossInto(NORMAL, a, b);
  return Math.acos(cosine) * (dot(NORMAL, 0, axis, 0) > 0 ? 1 : -1);
}

function crossInto(out: Float64Array, a: ArrayLike<number>, b: ArrayLike<number>): void {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  out[2] = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
}

const IDENTITY = Float64Array.of(0, 0, 0, 1);
const AIMED = new Float64Array(3);
const ACROSS = new Float64Array(3);
const NORMAL = new Float64Array(3);
const TOWARD = new Float64Array(3);
const SOURCE = new Float64Array(3);
const TURN = new Float64Array(4);
const TARGET = new Float64Array(4);
const LOCAL = new Float64Array(4);
