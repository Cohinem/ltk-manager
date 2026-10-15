/**
 * The height solvers of a missile, which replace the height its movement gives each tick.
 *
 * Section 2.56 of docs/plans/vfx-particle-renderer.md.
 */

import type { MissileHeight } from "./missile";
import { clamp, flat, sub, type Vec } from "./missileVectors";

/** The ground's height, which the preview keeps flat. */
export const GROUND = 0;

/** `BlendedLinearHeightSolver`'s exponent on the travel fraction. */
const BLEND_EXPONENT = 0.75;

/** How far above the ground `BlendedLinearHeightSolver` lifts a missile that would go below it. */
const GROUND_CLEARANCE = 4;

/** The share of the horizontal distance to the target that `next` has covered. */
export function travelFraction(start: Vec, next: Vec, target: Vec, arrived: boolean): number {
  const whole = flat(sub(target, start));
  if (arrived || whole === 0) return 1;
  return clamp(flat(sub(next, start)) / whole, 0, 1);
}

/** Returns the height `height` gives the missile stepping from `position` to `next`. */
export function solveHeight(
  height: MissileHeight,
  start: Vec,
  target: Vec,
  position: Vec,
  next: Vec,
  velocity: Vec,
  t: number,
): number {
  switch (height.kind) {
    case "blendedLinear": {
      const y = start[1] + (target[1] - start[1]) * t ** BLEND_EXPONENT;
      return y < GROUND ? GROUND + GROUND_CLEARANCE : y;
    }
    case "gravity": {
      const across = flat(sub(target, start));
      if (across === 0) return next[1];
      const total = across / (flat(velocity) + 1e-5);
      const time = total * t;
      const rise = (target[1] - start[1]) / total + 0.5 * height.gravity * total;
      return start[1] + rise * time - 0.5 * height.gravity * time * time;
    }
    case "followTerrain": {
      const most = flat(sub(next, position)) * height.maxSlope;
      return position[1] + clamp(GROUND + height.heightOffset - position[1], -most, most);
    }
    case "sinusoidal": {
      const periods = height.periods !== 0 ? height.periods : 1;
      const wave = Math.sin((periods * t + height.phase) * Math.PI * 2) * height.amplitude;
      return wave + height.verticalOffset + (1 - t) * start[1] + t * target[1];
    }
    case "curveTheDifference": {
      const lifted = height.initialTargetHeightOffset;
      return (1 - t) * (t * lifted + (1 - t) * start[1]) + t * (t * target[1] + (1 - t) * start[1]);
    }
  }
}
