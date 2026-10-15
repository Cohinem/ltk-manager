/**
 * The box a system's definition fills at its rig, which Fit frames.
 *
 * Read off the definition and the rig rather than the pools, so the same system frames the
 * same way on open, on F and at any moment of its run. "The viewer" in docs/ux/BIN_EDITOR.md.
 */

import { AXIS_SIGN, type Bounds, CHAMPION_HEIGHT } from "@/modules/viewport";

import { LONGEST_FLIGHT } from "../../engine/model/missile";
import type { SystemModel } from "../../engine/model/model";
import { flightTime, originAt, type Point, type RigModel } from "../../engine/model/rig";
import { type World, worldOf } from "../../engine/simulation/integrate";
import { FRAME_SLOTS } from "../../engine/simulation/pool";
import { identityInto } from "../../engine/utils/basis";
import { sampleCurveInto } from "../../engine/utils/sampleCurve";
import type { DrawnEmitter } from "./definitions";
import {
  placeInto,
  SEGMENTS,
  spawnFrameInto,
  spawnOriginInto,
  wireframeInto,
} from "./emitterShape";

/** How far a frame reaches about the rig, so a system of one point still fills a champion. */
export const STANDING_REACH = CHAMPION_HEIGHT / 2;

/** Scratch the emitters' shapes are written into, one per module rather than one per read. */
const POSITIONS = new Float32Array(SEGMENTS * 6);
const FRAME = new Float32Array(FRAME_SLOTS);
const STANDS = new Float32Array(3);
const TURNED = new Float32Array(3);

/** Where the rig stands the system's ground point as the run opens, in the viewport's space. */
export function rigGround(system: SystemModel, rig: RigModel): Point {
  return mirrored(stood(worldOf(system), originAt(rig.motion, 0)));
}

/**
 * The box the system fills at its rig: a champion about every stop the rig makes, and
 * each emitter's spawn origin, offset and shape as the run opens.
 *
 * An emitter of a child set is left out, since it rides a particle of its parent and
 * stands nowhere until one is born. A disabled emitter draws nothing and is left out too.
 */
export function definitionBounds(
  system: SystemModel,
  drawn: readonly DrawnEmitter[],
  rig: RigModel,
): Bounds {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const grow = (point: Point) => {
    for (let axis = 0; axis < 3; axis += 1) {
      if (point[axis] < min[axis]) min[axis] = point[axis];
      if (point[axis] > max[axis]) max[axis] = point[axis];
    }
  };

  const world = worldOf(system);
  for (const stop of stopsOf(rig)) {
    const [x, y, z] = mirrored(stood(world, stop));
    grow([x - STANDING_REACH, y - STANDING_REACH, z - STANDING_REACH]);
    grow([x + STANDING_REACH, y + STANDING_REACH, z + STANDING_REACH]);
  }

  const stands = stood(world, originAt(rig.motion, 0, rig.height));
  for (const { emitter, path } of drawn) {
    if (path !== "" || emitter.disabled) continue;
    spawnFrameInto(emitter, world.basis, UPRIGHT, FRAME);
    spawnOriginInto(emitter, world, UPRIGHT, stands, TURNED);
    const origin: Point = [TURNED[0], TURNED[1], TURNED[2]];
    STANDS.fill(0);
    sampleCurveInto(emitter.emitterPosition, 0, STANDS, 0);
    const vertices = wireframeInto(emitter, STANDS, 0, POSITIONS);
    for (let vertex = 0; vertex < vertices; vertex += 1) {
      placeInto(POSITIONS, vertex * 3, FRAME, origin);
      grow([POSITIONS[vertex * 3], POSITIONS[vertex * 3 + 1], POSITIONS[vertex * 3 + 2]]);
    }
  }

  return { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
}

/** How many points along a missile's flight its box takes. */
const FLIGHT_STOPS = 16;

/** Where `rig` takes the origin over a run, in the engine's space: enough points to box it. */
function stopsOf(rig: RigModel): readonly Point[] {
  const { motion, height } = rig;
  switch (motion.kind) {
    case "still":
      return [lifted([0, 0, 0], height)];
    case "missile": {
      const flight = flightTime(motion, height) || LONGEST_FLIGHT;
      return Array.from({ length: FLIGHT_STOPS + 1 }, (_, at) =>
        originAt(motion, (flight * at) / FLIGHT_STOPS, height),
      );
    }
    case "bone":
      return [lifted(motion.anchor.originAt(0), height)];
  }
}

/** `point` stood `height` off the ground. */
function lifted(point: Point, height: number): Point {
  return [point[0], point[1] + height, point[2]];
}

/**
 * Where a system the rig has at `point` stands, as the driver stands it: the point itself,
 * and for a HUD-layer system the point moved by its `transform`'s translation.
 */
function stood(world: World, point: Point): Point {
  if (!world.hud) return point;
  return [point[0] + world.offset[0], point[1] + world.offset[1], point[2] + world.offset[2]];
}

/** The orientation of a system no rig has turned, which a box of its opening frame reads. */
const UPRIGHT = identityInto(new Float32Array(FRAME_SLOTS));

/** `point` in the viewport's space. A mirrored zero would be a negative zero, so it is not. */
function mirrored(point: Point): Point {
  return [point[0] * AXIS_SIGN[0] || 0, point[1] * AXIS_SIGN[1] || 0, point[2] * AXIS_SIGN[2] || 0];
}
