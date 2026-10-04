import type { Color } from "three";

/** The channels one joint's colour takes in the buffers. */
const CHANNELS = 3;

/** The joints that hang from a parent, each as `[child, parent]`, in slot order. */
export function boneSegments(parents: ArrayLike<number>): readonly (readonly [number, number])[] {
  const bones: (readonly [number, number])[] = [];
  for (let slot = 0; slot < parents.length; slot += 1) {
    const parent = parents[slot];
    if (parent >= 0) bones.push([slot, parent]);
  }
  return bones;
}

/** Whether each joint hangs under `slot`, which counts as under itself. */
export function subtreeOf(parents: ArrayLike<number>, slot: number): boolean[] {
  return Array.from({ length: parents.length }, (_, joint) => {
    for (let at = joint; at >= 0; at = parents[at]) {
      if (at === slot) return true;
    }
    return false;
  });
}

/** The floats `nearestJoint` reads per joint: where it draws on the screen, and its depth. */
export const SCREEN_FLOATS = 3;

/**
 * The joint drawn nearest the screen point `(x, y)` and within `reach` of it, and -1 for
 * none. Of two joints equally near, the one nearer the camera is picked.
 *
 * `screen` holds each joint's x and y in pixels and its depth in clip space, where a depth
 * past 1 is behind the camera or the far plane.
 */
export function nearestJoint(
  screen: ArrayLike<number>,
  x: number,
  y: number,
  reach: number,
): number {
  let picked = -1;
  let nearest = reach;
  let depth = Infinity;
  for (let at = 0; at * SCREEN_FLOATS < screen.length; at += 1) {
    const z = screen[at * SCREEN_FLOATS + 2];
    if (z > 1) continue;

    const away = Math.hypot(screen[at * SCREEN_FLOATS] - x, screen[at * SCREEN_FLOATS + 1] - y);
    if (away < nearest || (away === nearest && z < depth)) {
      picked = at;
      nearest = away;
      depth = z;
    }
  }
  return picked;
}

/** What the armature paints a joint in: alike with no mask, and by weight under one. */
export interface ArmaturePalette {
  /** Every joint where no mask is weighed. */
  readonly plain: Color;
  /** A joint the mask weighs. */
  readonly weighed: Color;
  /** A joint the mask leaves out. */
  readonly unweighed: Color;
}

/**
 * Whether each of `count` joints is weighed by `jointWeights`, and null for no mask.
 *
 * A joint past the list's end is not weighed, and a weight the file holds no number in
 * weighs none.
 */
export function weighedJoints(
  count: number,
  jointWeights: ArrayLike<number> | null,
): readonly boolean[] | null {
  if (jointWeights === null) return null;
  return Array.from({ length: count }, (_, slot) => (jointWeights[slot] ?? 0) > 0);
}

/** One colour per joint, `CHANNELS` each, into `out`. */
export function jointColors(
  weighed: readonly boolean[] | null,
  count: number,
  palette: ArmaturePalette,
  out: Float32Array,
): Float32Array {
  for (let slot = 0; slot < count; slot += 1) {
    const color =
      weighed === null ? palette.plain : weighed[slot] ? palette.weighed : palette.unweighed;
    out[slot * CHANNELS] = color.r;
    out[slot * CHANNELS + 1] = color.g;
    out[slot * CHANNELS + 2] = color.b;
  }
  return out;
}

/** The floats `jointColors` writes for `count` joints. */
export function colorFloats(count: number): number {
  return count * CHANNELS;
}
