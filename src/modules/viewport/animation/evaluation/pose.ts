import { Matrix4, Quaternion, Vector3 } from "three";

import { clipDuration, type ClipModel, POSE_FLOATS } from "../../assets/parsing/clipBuffer";
import type { SkeletonModel } from "../../assets/parsing/skeletonBuffer";

/** The floats one joint's local transform takes: translation, rotation, scale. */
export const LOCAL_FLOATS = 10;

/** The floats one joint's transform in the skeleton's space takes, a column-major 4x4. */
const WORLD_FLOATS = 16;

/**
 * A skeleton posed by a clip, as a function of time.
 *
 * Every read samples the baked table, so the pose at a time is the same whoever asks and
 * in whatever order. That is what lets a particle system riding a joint seek, per
 * decision 2.6 of docs/plans/vfx-particle-renderer.md.
 */
export interface Pose {
  readonly skeleton: SkeletonModel;
  /** Seconds one pass of the clip lasts, and zero for a skeleton in its bind pose. */
  readonly duration: number;
  /**
   * Each joint's parent slot with any cycle broken at a root, and -1 for a root.
   *
   * Every pose of one skeleton shares the array, so a rig built on it outlives a clip.
   */
  readonly parents: Int32Array;
  /** The slot of the joint `name` names, without regard to case, and -1 where none does. */
  jointNamed(name: string): number;
  /** Every joint's local transform at `time`, `LOCAL_FLOATS` each, into `out`. */
  localsInto(time: number, out: Float32Array): Float32Array;
  /** Joint `slot`'s transform in the skeleton's space at `time`, column-major, into `out`. */
  worldInto(slot: number, time: number, out: Float32Array): Float32Array;
}

/**
 * `skeleton` posed by `clip`, looping, and in its bind pose for no clip.
 *
 * A joint the clip holds no track for stands in its bind pose under whatever its parent
 * does. The track is found by the hash the skeleton buffer carries, which is the one an
 * `.anm` writes.
 */
export function createPose(skeleton: SkeletonModel, clip: ClipModel | null): Pose {
  const duration = clip === null ? 0 : clipDuration(clip);
  const tracks = trackSlots(skeleton, clip);
  const rotation = new Quaternion();
  const turnTo = new Quaternion();

  function localsInto(time: number, out: Float32Array): Float32Array {
    const frame = clip === null ? null : frameAt(clip, duration, time);
    skeleton.joints.forEach((joint, slot) => {
      const at = slot * LOCAL_FLOATS;
      const track = tracks[slot];
      if (clip === null || frame === null || track < 0) {
        out.set(joint.translation, at);
        out.set(joint.rotation, at + 3);
        out.set(joint.scale, at + 7);
        return;
      }
      const from = (frame.from * clip.joints.length + track) * POSE_FLOATS;
      const to = (frame.to * clip.joints.length + track) * POSE_FLOATS;
      for (const offset of [0, 1, 2, 7, 8, 9]) {
        const a = clip.poses[from + offset];
        out[at + offset] = a + (clip.poses[to + offset] - a) * frame.mix;
      }
      rotation.fromArray(clip.poses, from + 3);
      rotation.slerp(turnTo.fromArray(clip.poses, to + 3), frame.mix);
      out[at + 3] = rotation.x;
      out[at + 4] = rotation.y;
      out[at + 5] = rotation.z;
      out[at + 6] = rotation.w;
    });
    return out;
  }

  return poseOf(skeleton, duration, localsInto);
}

/**
 * A pose over `localsInto`, its worlds composed down the hierarchy and kept for the last
 * time asked, since every joint of one frame is asked in turn.
 */
function poseOf(
  skeleton: SkeletonModel,
  duration: number,
  localsInto: (time: number, out: Float32Array) => Float32Array,
): Pose {
  const count = skeleton.joints.length;
  const { order, parents } = hierarchyOf(skeleton);
  const names = new Map<string, number>();
  skeleton.joints.forEach((joint, slot) => {
    const name = joint.name.toLowerCase();
    if (!names.has(name)) names.set(name, slot);
  });

  const locals = new Float32Array(count * LOCAL_FLOATS);
  const worlds = new Float32Array(count * WORLD_FLOATS);
  let worldsAt = Number.NaN;
  const local = new Matrix4();
  const parent = new Matrix4();
  const translation = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();

  function worldsFor(time: number): void {
    if (time === worldsAt) return;
    localsInto(time, locals);
    for (const slot of order) {
      const at = slot * LOCAL_FLOATS;
      translation.fromArray(locals, at);
      rotation.fromArray(locals, at + 3);
      scale.fromArray(locals, at + 7);
      local.compose(translation, rotation, scale);
      const above = parents[slot];
      if (above >= 0) local.premultiply(parent.fromArray(worlds, above * WORLD_FLOATS));
      local.toArray(worlds, slot * WORLD_FLOATS);
    }
    worldsAt = time;
  }

  return {
    skeleton,
    duration,
    parents,
    jointNamed: (name) => names.get(name.toLowerCase()) ?? -1,
    localsInto,
    worldInto(slot, time, out) {
      worldsFor(time);
      out.set(worlds.subarray(slot * WORLD_FLOATS, (slot + 1) * WORLD_FLOATS));
      return out;
    },
  };
}

/** One joint stood on another for a span of the pass, which a joint snap event asks. */
export interface JointSnap {
  /** The joint moved. */
  readonly joint: number;
  /** The joint it stands on. */
  readonly snapTo: number;
  /** How far off the joint stood on it stands, in that joint's own frame. */
  readonly offset: readonly [number, number, number];
  /** Seconds into the pass the snap starts. */
  readonly at: number;
  /** Seconds into the pass the snap ends, and null to hold to the pass's end. */
  readonly until: number | null;
}

/**
 * `base` with each of `snaps` applied over its span: the joint's local is rewritten so it
 * stands where the other joint does, and its children follow it as they always do.
 *
 * The joint's parent is read off `base`, so a snap whose parent is itself snapped stands
 * on the parent's own pose. A snap naming a joint the skeleton lacks is passed over.
 */
export function snappedPose(base: Pose, snaps: readonly JointSnap[]): Pose {
  const held = snaps.filter((snap) => snap.joint >= 0 && snap.snapTo >= 0);
  if (held.length === 0) return base;
  const { parents, duration } = base;
  const parentWorld = new Matrix4();
  const snapWorld = new Matrix4();
  const stood = new Float32Array(WORLD_FLOATS);
  const translation = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();

  function localsInto(time: number, out: Float32Array): Float32Array {
    base.localsInto(time, out);
    const folded = foldedInto(time, duration);
    for (const snap of held) {
      if (folded < snap.at || (snap.until !== null && folded >= snap.until)) continue;
      snapWorld.fromArray(base.worldInto(snap.snapTo, time, stood));
      translation.set(snap.offset[0], snap.offset[1], snap.offset[2]);
      snapWorld.multiply(OFFSET.makeTranslation(translation));
      const above = parents[snap.joint];
      if (above >= 0) {
        parentWorld.fromArray(base.worldInto(above, time, stood)).invert();
        snapWorld.premultiply(parentWorld);
      }
      snapWorld.decompose(translation, rotation, scale);
      const at = snap.joint * LOCAL_FLOATS;
      translation.toArray(out, at);
      rotation.toArray(out, at + 3);
      scale.toArray(out, at + 7);
    }
    return out;
  }

  return poseOf(base.skeleton, duration, localsInto);
}

const OFFSET = new Matrix4();

/**
 * `steps` played one after another as one looping pose, and the bind pose for none.
 *
 * Every step stands on `skeleton`, so the parent table and the joint names are the
 * first's. A step of no duration is passed over, and a sequence of nothing but those
 * stands in the bind pose.
 */
export function sequencePose(skeleton: SkeletonModel, steps: readonly Pose[]): Pose {
  const [first] = steps;
  if (first === undefined) return createPose(skeleton, null);
  if (steps.length === 1) return first;

  const durations = steps.map((step) => step.duration);
  const duration = durations.reduce((sum, each) => sum + each, 0);
  const starts = durations.map((_, at) => durations.slice(0, at).reduce((sum, d) => sum + d, 0));
  const local = (time: number, at: number) => foldedInto(time, duration) - starts[at];

  return {
    skeleton: first.skeleton,
    duration,
    parents: first.parents,
    jointNamed: first.jointNamed,
    localsInto(time, out) {
      const at = sequenceStep(durations, time);
      return steps[at].localsInto(local(time, at), out);
    },
    worldInto(slot, time, out) {
      const at = sequenceStep(durations, time);
      return steps[at].worldInto(slot, local(time, at), out);
    },
  };
}

/**
 * Which of the steps lasting `durations` plays at `time`, looping over their sum.
 *
 * The last step whose start `time` has reached, so a step of no duration is passed over
 * for the one after it. A sequence of no duration answers its last step.
 */
export function sequenceStep(durations: readonly number[], time: number): number {
  const total = durations.reduce((sum, each) => sum + each, 0);
  const looped = foldedInto(time, total);
  let start = 0;
  let at = 0;
  for (let step = 0; step < durations.length; step += 1) {
    if (start > looped) break;
    at = step;
    start += durations[step];
  }
  return at;
}

/** `time` folded into one pass of `duration`, and zero for no duration. */
function foldedInto(time: number, duration: number): number {
  return duration > 0 ? ((time % duration) + duration) % duration : 0;
}

/** The clip's track for each joint of `skeleton`, and -1 for a joint it holds none for. */
function trackSlots(skeleton: SkeletonModel, clip: ClipModel | null): Int32Array {
  const tracks = new Int32Array(skeleton.joints.length).fill(-1);
  if (clip === null) return tracks;

  const byHash = new Map<number, number>();
  clip.joints.forEach((hash, track) => byHash.set(hash, track));
  skeleton.joints.forEach((joint, slot) => {
    tracks[slot] = byHash.get(joint.hash) ?? -1;
  });
  return tracks;
}

/** The two frames `time` falls between and how far it is along, looping the clip. */
function frameAt(
  clip: ClipModel,
  duration: number,
  time: number,
): { from: number; to: number; mix: number } {
  const looped = duration > 0 ? ((time % duration) + duration) % duration : 0;
  const at = Math.min(looped * clip.fps, clip.frames - 1);
  const from = Math.floor(at);
  return { from, to: Math.min(from + 1, clip.frames - 1), mix: at - from };
}

interface Hierarchy {
  readonly order: Int32Array;
  readonly parents: Int32Array;
}

/* Built on first use, so the barrel holds no top-level allocation. */
let hierarchies: WeakMap<SkeletonModel, Hierarchy> | undefined;

/** `parentsFirst` of `skeleton`, walked once for every pose of it. */
function hierarchyOf(skeleton: SkeletonModel): Hierarchy {
  hierarchies ??= new WeakMap();
  let held = hierarchies.get(skeleton);
  if (held === undefined) {
    held = parentsFirst(skeleton);
    hierarchies.set(skeleton, held);
  }
  return held;
}

/**
 * The joints in an order that reaches every parent before its children.
 *
 * A joint on a cycle has no parent reached before it, so it stands as a root and the
 * cycle is broken there rather than walked forever.
 */
function parentsFirst(skeleton: SkeletonModel): { order: Int32Array; parents: Int32Array } {
  const count = skeleton.joints.length;
  const parents = Int32Array.from(skeleton.joints, (joint) => joint.parent);
  const children: number[][] = Array.from({ length: count }, () => []);
  parents.forEach((parent, slot) => {
    if (parent >= 0) children[parent].push(slot);
  });

  const order: number[] = [];
  const placed = new Uint8Array(count);
  const walk = (root: number) => {
    const stack = [root];
    while (stack.length > 0) {
      const slot = stack.pop() as number;
      if (placed[slot] === 1) continue;
      placed[slot] = 1;
      order.push(slot);
      for (const child of children[slot]) if (placed[child] === 0) stack.push(child);
    }
  };

  parents.forEach((parent, slot) => {
    if (parent < 0) walk(slot);
  });
  for (let slot = 0; slot < count; slot += 1) {
    if (placed[slot] === 0) {
      parents[slot] = -1;
      walk(slot);
    }
  }

  return { order: Int32Array.from(order), parents };
}
