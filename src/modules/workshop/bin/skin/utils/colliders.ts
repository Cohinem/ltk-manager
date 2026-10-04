import type { ColliderShapes, SkinModel } from "@/lib/tauri";
import {
  bindWorld,
  type ColliderFile,
  type FileCapsule,
  type FileSphere,
  type Pose,
} from "@/modules/viewport";

type Point = readonly [number, number, number];

/** A chain with no collider file collides with these. */
export const NO_SHAPES: ColliderFile = { spheres: [], capsules: [] };

/** The radius a new sphere starts at, and each end of a new capsule, in world units. */
const NEW_SPHERE_RADIUS = 10;
const NEW_CAPSULE_RADIUS = 6;

/** The extension a collider file is saved under. The game opens the file by its whole path. */
const EXTENSION = ".colliders";

/**
 * The game path a chain's shapes are saved at where the chain names no file: beside the
 * skeleton, under the skeleton's name. Null for a skin whose skeleton has no path.
 */
export function colliderPathOf(skin: SkinModel): string | null {
  const skeleton = skin.skeleton?.path ?? "";
  if (!skeleton.includes("/")) return null;
  return skeleton.replace(/\.[^./]*$/, "") + EXTENSION;
}

/** Where every joint of a skeleton stands in the bind pose, kept per skeleton. */
const BIND = new WeakMap<object, Float64Array>();

/** Where the joint `slot` stands in the bind pose, in the model's space. */
export function bindPoint(pose: Pose, slot: number): Point {
  let positions = BIND.get(pose.skeleton);
  if (positions === undefined) {
    positions = bindWorld(pose.skeleton, pose.parents).positions;
    BIND.set(pose.skeleton, positions);
  }
  return [positions[slot * 3], positions[slot * 3 + 1], positions[slot * 3 + 2]];
}

/** `file` with a sphere on the joint `slot`, centred where the joint stands. */
export function withSphere(file: ColliderFile, pose: Pose, slot: number): ColliderFile {
  const sphere: FileSphere = {
    joint: pose.skeleton.joints[slot].name,
    centre: bindPoint(pose, slot),
    radius: NEW_SPHERE_RADIUS,
  };
  return { ...file, spheres: [...file.spheres, sphere] };
}

/** `file` with a capsule from the joint `a` to the joint `b`, each end where its joint stands. */
export function withCapsule(file: ColliderFile, pose: Pose, a: number, b: number): ColliderFile {
  const capsule: FileCapsule = {
    jointA: pose.skeleton.joints[a].name,
    endA: bindPoint(pose, a),
    radiusA: NEW_CAPSULE_RADIUS,
    jointB: pose.skeleton.joints[b].name,
    endB: bindPoint(pose, b),
    radiusB: NEW_CAPSULE_RADIUS,
  };
  return { ...file, capsules: [...file.capsules, capsule] };
}

/**
 * The joint a capsule from the joint `slot` ends on besides the joint's parent: the selected
 * joint, and for the selected joint itself the one selected before it. -1 where there is none.
 */
export function capsuleMate(pose: Pose, slot: number, selected: number, before: number): number {
  const mate = selected === slot ? before : selected;
  return mate === slot || mate === pose.parents[slot] ? -1 : mate;
}

/** `file` with the sphere at `index` changed by `change`. */
export function withSphereAt(
  file: ColliderFile,
  index: number,
  change: Partial<FileSphere>,
): ColliderFile {
  return {
    ...file,
    spheres: file.spheres.map((sphere, at) => (at === index ? { ...sphere, ...change } : sphere)),
  };
}

/** `file` with the capsule at `index` changed by `change`. */
export function withCapsuleAt(
  file: ColliderFile,
  index: number,
  change: Partial<FileCapsule>,
): ColliderFile {
  return {
    ...file,
    capsules: file.capsules.map((capsule, at) =>
      at === index ? { ...capsule, ...change } : capsule,
    ),
  };
}

/** `file` without the sphere at `index`. */
export function withoutSphere(file: ColliderFile, index: number): ColliderFile {
  return { ...file, spheres: file.spheres.filter((_, at) => at !== index) };
}

/** `file` without the capsule at `index`. */
export function withoutCapsule(file: ColliderFile, index: number): ColliderFile {
  return { ...file, capsules: file.capsules.filter((_, at) => at !== index) };
}

/**
 * How far `point` stands off the joint named `joint` in the bind pose, along the model's
 * axes. A joint the skeleton lacks is measured from the origin.
 */
export function offsetFrom(pose: Pose, joint: string, point: Point): Point {
  const base = basePoint(pose, joint);
  return [point[0] - base[0], point[1] - base[1], point[2] - base[2]];
}

/** The point `offset` off the joint named `joint` in the bind pose. */
export function pointAt(pose: Pose, joint: string, offset: Point): Point {
  const base = basePoint(pose, joint);
  return [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]];
}

function basePoint(pose: Pose, joint: string): Point {
  const slot = pose.jointNamed(joint);
  return slot < 0 ? [0, 0, 0] : bindPoint(pose, slot);
}

/** `file` as the save command takes it. */
export function shapesOf(file: ColliderFile): ColliderShapes {
  return {
    spheres: file.spheres.map((sphere) => ({
      ...sphere,
      centre: [...sphere.centre],
    })),
    capsules: file.capsules.map((capsule) => ({
      ...capsule,
      endA: [...capsule.endA],
      endB: [...capsule.endB],
    })),
  };
}
