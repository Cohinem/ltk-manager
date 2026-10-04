import type { SkeletonModel } from "../assets/parsing/skeletonBuffer";
import { multiplyInto, rotateInto } from "./math";

/** The floats one joint's local transform takes, as a pose writes one. */
export const LOCAL_FLOATS = 10;

/** Every joint of a skeleton in world space, as positions, rotations and scales by slot. */
export interface WorldPose {
  readonly positions: Float64Array;
  readonly rotations: Float64Array;
  readonly scales: Float64Array;
}

/** Where the unit stands and how it is turned and scaled, which a motion moves. */
export interface RootTransform {
  readonly position: Float64Array;
  readonly rotation: Float64Array;
  scale: number;
}

export function createWorldPose(joints: number): WorldPose {
  return {
    positions: new Float64Array(joints * 3),
    rotations: new Float64Array(joints * 4),
    scales: new Float64Array(joints * 3),
  };
}

export function createRoot(scale = 1): RootTransform {
  return {
    position: new Float64Array(3),
    rotation: Float64Array.of(0, 0, 0, 1),
    scale,
  };
}

/**
 * `locals` composed down the hierarchy under `root`, into `out`.
 *
 * A transform is a position, a rotation and a scale, composed the way the game composes
 * them, so a scale that is not uniform shears nothing. `order` reaches every parent first.
 */
export function composeWorldInto(
  out: WorldPose,
  locals: ArrayLike<number>,
  parents: Int32Array,
  order: Int32Array,
  root: RootTransform,
): WorldPose {
  const { positions, rotations, scales } = out;
  for (const slot of order) {
    const at = slot * LOCAL_FLOATS;
    const above = parents[slot];
    for (let axis = 0; axis < 3; axis += 1) {
      const scale = above < 0 ? root.scale : scales[above * 3 + axis];
      SCALED[axis] = locals[at + axis] * scale;
      scales[slot * 3 + axis] = locals[at + 7 + axis] * scale;
    }

    const parentRotation = above < 0 ? root.rotation : rotations;
    const parentPosition = above < 0 ? root.position : positions;
    const from = above < 0 ? 0 : above;
    rotateInto(positions, slot * 3, parentRotation, from * 4, SCALED, 0);
    for (let axis = 0; axis < 3; axis += 1) {
      positions[slot * 3 + axis] += parentPosition[from * 3 + axis];
    }

    QUAT[0] = locals[at + 3];
    QUAT[1] = locals[at + 4];
    QUAT[2] = locals[at + 5];
    QUAT[3] = locals[at + 6];
    multiplyInto(rotations, slot * 4, parentRotation, from * 4, QUAT, 0);
  }
  return out;
}

/** Each joint's children by slot, in slot order. */
export function childLists(parents: Int32Array): number[][] {
  const children: number[][] = Array.from({ length: parents.length }, () => []);
  parents.forEach((parent, slot) => {
    if (parent >= 0) children[parent].push(slot);
  });
  return children;
}

/** The joints in an order that reaches every parent before its children. */
export function parentsFirst(parents: Int32Array): Int32Array {
  const children = childLists(parents);
  const order: number[] = [];
  const stack: number[] = [];
  for (let slot = parents.length - 1; slot >= 0; slot -= 1) {
    if (parents[slot] < 0) stack.push(slot);
  }

  while (stack.length > 0) {
    const slot = stack.pop() as number;
    order.push(slot);
    for (let at = children[slot].length - 1; at >= 0; at -= 1) stack.push(children[slot][at]);
  }
  return Int32Array.from(order);
}

/** The bind pose of `skeleton` as local transforms, `LOCAL_FLOATS` per joint. */
export function bindLocals(skeleton: SkeletonModel): Float32Array {
  const locals = new Float32Array(skeleton.joints.length * LOCAL_FLOATS);
  skeleton.joints.forEach((joint, slot) => {
    locals.set(joint.translation, slot * LOCAL_FLOATS);
    locals.set(joint.rotation, slot * LOCAL_FLOATS + 3);
    locals.set(joint.scale, slot * LOCAL_FLOATS + 7);
  });
  return locals;
}

/** Where every joint stands in the bind pose, in the skeleton's own space. */
export function bindWorld(skeleton: SkeletonModel, parents: Int32Array): WorldPose {
  return composeWorldInto(
    createWorldPose(skeleton.joints.length),
    bindLocals(skeleton),
    parents,
    parentsFirst(parents),
    createRoot(),
  );
}

const SCALED = new Float64Array(3);
const QUAT = new Float64Array(4);
