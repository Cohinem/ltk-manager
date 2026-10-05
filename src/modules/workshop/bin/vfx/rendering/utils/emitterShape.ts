/**
 * An emitter's marks and spawn shape as line segments, in its own space and then placed.
 *
 * The gizmo draws them every frame and a frame of the camera measures them once, so the
 * writer is shared and knows nothing of either.
 */

import { AXIS_SIGN } from "@/modules/viewport";

import type { EmitterModel, SpawnShape } from "../../engine/model/model";
import type { Point } from "../../engine/model/rig";
import type { World } from "../../engine/simulation/integrate";
import { FRAME_SLOTS } from "../../engine/simulation/pool";
import { multiplyInto, standingInto, turnInto } from "../../engine/utils/basis";
import { sampleCurve } from "../../engine/utils/sampleCurve";

/** How many segments one ring of a shape is drawn on. */
const RING = 24;

/** The most segments one emitter draws: a sphere's three rings, the two marks and their span. */
export const SEGMENTS = 3 * RING + 10;

/** How long each arm of the cross marking a place is, in engine units. */
const TICK = 8;

/** A place in the emitter's own space, before the spawn frame turns it. */
type Place = readonly [number, number, number];

/** The same before the system's turn, which is `rotationOverride` stood at and scaled. */
const OVERRIDE = new Float32Array(FRAME_SLOTS);

/** Scratch the euler of `rotationOverride` is read out of. */
const STOOD = new Float32Array(3);

/**
 * The basis a point of `emitter`'s own frame is turned by on its way to the world, into `out`.
 *
 * The definition's `transform` acts first, as the last factor of a particle's own matrix,
 * then the emitter's override, its scale before its rotation, then the system's
 * orientation, which `isLocalOrientation` switches in.
 */
export function spawnFrameInto(
  emitter: EmitterModel,
  transform: Float32Array,
  orientation: Float32Array,
  out: Float32Array,
): void {
  overrideInto(emitter, OVERRIDE);
  multiplyInto(OVERRIDE, transform, out);
  if (emitter.localOrientation) multiplyInto(orientation, out, out);
}

/**
 * Where the origin of `emitter`'s own frame stands for a system at `origin`, into `out`.
 *
 * `translationOverride` is turned by the system's orientation alone, never by the
 * emitter's own scale or rotation, and the `transform`'s translation rides the frame.
 */
export function spawnOriginInto(
  emitter: EmitterModel,
  world: World,
  orientation: Float32Array,
  origin: Point,
  out: Float32Array,
): void {
  out.set(emitter.translationOverride);
  SHIFT.set(world.hud ? NOWHERE : world.offset);
  turnInto(overrideInto(emitter, OVERRIDE), SHIFT, 0);
  if (emitter.localOrientation) {
    turnInto(orientation, out, 0);
    turnInto(orientation, SHIFT, 0);
  }
  for (let axis = 0; axis < 3; axis += 1) out[axis] += origin[axis] + SHIFT[axis];
}

const SHIFT = new Float32Array(3);
const NOWHERE: Point = [0, 0, 0];

/** `rotationOverride` stood at and scaled by `scaleOverride`, into `out`. */
function overrideInto(emitter: EmitterModel, out: Float32Array): Float32Array {
  STOOD.set(emitter.rotationOverride);
  standingInto(STOOD, 0, 0, out);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      out[row * 3 + column] *= emitter.scaleOverride[column];
    }
  }
  return out;
}

/** The point at `at` turned by `frame`, stood off `origin`, and mirrored into the viewport. */
export function placeInto(
  points: Float32Array,
  at: number,
  frame: Float32Array,
  origin: Point,
): void {
  turnInto(frame, points, at);
  for (let axis = 0; axis < 3; axis += 1) {
    points[at + axis] = (points[at + axis] + origin[axis]) * AXIS_SIGN[axis];
  }
}

/**
 * The emitter's marks and its spawn shape written into `out`, in the emitter's own space.
 *
 * The origin is the frame's own, where `translationOverride` has put it, the offset is
 * where `EmitterPosition` stands off it, and the shape is drawn about the offset, which
 * is the order a birth adds them in. Returns the vertices written.
 */
export function wireframeInto(
  emitter: EmitterModel,
  stands: Float32Array,
  t01: number,
  out: Float32Array,
): number {
  const origin: Place = [0, 0, 0];
  const offset: Place = [stands[0], stands[1], stands[2]];

  let at = crossInto(out, 0, origin);
  at = segmentInto(out, at, origin, offset);
  at = crossInto(out, at, offset);
  return shapeInto(out, at, emitter.shape, offset, t01);
}

/** Three arms crossing at `place`, and the vertex the next mark starts at. */
function crossInto(out: Float32Array, at: number, place: Place): number {
  let vertex = at;
  for (let axis = 0; axis < 3; axis += 1) {
    const arm: Place = [axis === 0 ? TICK : 0, axis === 1 ? TICK : 0, axis === 2 ? TICK : 0];
    vertex = segmentInto(out, vertex, offsetBy(place, negated(arm)), offsetBy(place, arm));
  }
  return vertex;
}

/** One segment from `from` to `to`, and the vertex the next one starts at. */
function segmentInto(out: Float32Array, at: number, from: Place, to: Place): number {
  if ((at + 2) * 3 > out.length) return at;
  out.set(from, at * 3);
  out.set(to, (at + 1) * 3);
  return at + 2;
}

/**
 * The shape's own wireframe about `middle`, and the vertex after it.
 *
 * A size is a half-extent, except a cylinder's height, which runs up from the emitter. A
 * legacy shape draws the place its curves sample to, its spread being a draw made per
 * particle rather than a body.
 */
export function shapeInto(
  out: Float32Array,
  at: number,
  shape: SpawnShape,
  middle: Place,
  t01: number,
): number {
  switch (shape.kind) {
    case "point":
      return crossInto(out, at, offsetBy(middle, shape.offset));

    case "legacy": {
      const sampled = sampleCurve(shape.offset, t01);
      const moved = sampleCurve(shape.translation, t01);
      const drawn: Place = [
        (sampled[0] ?? 0) + (moved[0] ?? 0),
        (sampled[1] ?? 0) + (moved[1] ?? 0),
        (sampled[2] ?? 0) + (moved[2] ?? 0),
      ];
      return crossInto(out, at, offsetBy(middle, drawn));
    }

    case "box":
      return boxInto(out, at, middle, shape.size);

    case "cylinder": {
      const roof = offsetBy(middle, [0, shape.height, 0]);
      let vertex = ringInto(out, at, middle, shape.radius, UP);
      vertex = ringInto(out, vertex, roof, shape.radius, UP);
      for (let corner = 0; corner < 4; corner += 1) {
        const radians = (corner / 4) * Math.PI * 2;
        vertex = segmentInto(
          out,
          vertex,
          ringPoint(middle, shape.radius, UP, radians),
          ringPoint(roof, shape.radius, UP, radians),
        );
      }
      return vertex;
    }

    case "sphere": {
      let vertex = ringInto(out, at, middle, shape.radius, 0);
      vertex = ringInto(out, vertex, middle, shape.radius, UP);
      return ringInto(out, vertex, middle, shape.radius, 2);
    }
  }
}

/** The axis a ring lies flat about, which is the world's own up. */
const UP = 1;

/** `place` moved by `by`. */
function offsetBy(place: Place, by: Place): Place {
  return [place[0] + by[0], place[1] + by[1], place[2] + by[2]];
}

/** `place` the other way about the origin. */
function negated(place: Place): Place {
  return [-place[0], -place[1], -place[2]];
}

/** A ring of `radius` about `middle`, in the plane across `normal`, and the vertex after it. */
function ringInto(
  out: Float32Array,
  at: number,
  middle: Place,
  radius: number,
  normal: number,
): number {
  let vertex = at;
  for (let step = 0; step < RING; step += 1) {
    vertex = segmentInto(
      out,
      vertex,
      ringPoint(middle, radius, normal, (step / RING) * Math.PI * 2),
      ringPoint(middle, radius, normal, ((step + 1) / RING) * Math.PI * 2),
    );
  }
  return vertex;
}

/** One point of a ring, `radians` around the plane across `normal`. */
function ringPoint(middle: Place, radius: number, normal: number, radians: number): Place {
  const point: [number, number, number] = [middle[0], middle[1], middle[2]];
  point[(normal + 1) % 3] += Math.cos(radians) * radius;
  point[(normal + 2) % 3] += Math.sin(radians) * radius;
  return point;
}

/** The twelve edges of a box of half-extents `size` about `middle`, and the vertex after it. */
function boxInto(out: Float32Array, at: number, middle: Place, size: Place): number {
  let vertex = at;
  for (let axis = 0; axis < 3; axis += 1) {
    const across = (axis + 1) % 3;
    const along = (axis + 2) % 3;
    for (const first of [-1, 1]) {
      for (const second of [-1, 1]) {
        const corner: [number, number, number] = [middle[0], middle[1], middle[2]];
        corner[across] += first * size[across];
        corner[along] += second * size[along];
        const to: [number, number, number] = [corner[0], corner[1], corner[2]];
        corner[axis] -= size[axis];
        to[axis] += size[axis];
        vertex = segmentInto(out, vertex, corner, to);
      }
    }
  }
  return vertex;
}
