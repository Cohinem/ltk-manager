import { describe, expect, it } from "vitest";

import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
import { createPool } from "../../../engine/simulation/pool";
import { pathInto, SWATCH_POINTS, swatchInto, swatchMeasure, swatchWarmth } from "../trailSwatch";

const TRAIL = emitterOf(2, { particleLifetime: flat(0.5), scale0: flat(10, 10, 10) });

describe("trailSwatch", () => {
  it("sizes the path by the ribbon's widest half-width", () => {
    const measure = swatchMeasure(TRAIL);

    expect(measure.life).toBe(0.5);
    expect(measure.reach).toBe(10);
    expect(measure.halfWidth).toBe(measure.across + 10);
  });

  it("walks a closed path at an even speed", () => {
    const last = new Float32Array(3);
    const next = new Float32Array(3);
    pathInto(0, last, 0);

    expect(last[0]).toBeCloseTo(0);
    expect(last[1]).toBeCloseTo(0);
    for (let walked = 0.01; walked < 20; walked += 0.01) {
      pathInto(walked, next, 0);
      expect(Math.hypot(next[0] - last[0], next[1] - last[1])).toBeCloseTo(0.01, 2);
      expect(Math.max(Math.abs(next[0]), Math.abs(next[1]))).toBeLessThanOrEqual(1);
      last.set(next);
    }
  });

  it("strings the live points inside the frame, oldest first by serial", () => {
    const measure = swatchMeasure(TRAIL);
    const pool = createPool(SWATCH_POINTS);
    swatchInto(pool, TRAIL, measure, swatchWarmth(measure), null);

    expect(pool.count).toBeGreaterThan(40);
    for (let at = 0; at < pool.count; at += 1) {
      expect(pool.emitter[at]).toBe(2);
      expect(Math.abs(pool.position[at * 3])).toBeLessThanOrEqual(measure.halfWidth);
      expect(Math.abs(pool.position[at * 3 + 1])).toBeLessThanOrEqual(measure.halfHeight);
      expect(pool.position[at * 3 + 2]).toBe(0);
      if (at > 0) expect(pool.serial[at]).toBeLessThan(pool.serial[at - 1]);
    }
  });

  it("gives every point its own chance unless one is pinned", () => {
    const measure = swatchMeasure(TRAIL);
    const pool = createPool(SWATCH_POINTS);
    swatchInto(pool, TRAIL, measure, swatchWarmth(measure), 0.25);

    for (let at = 0; at < pool.count; at += 1) expect(pool.lifetime[at]).toBe(0.5);
    expect(new Set(pool.roll.subarray(0, pool.count)).size).toBe(pool.count);
  });
});
