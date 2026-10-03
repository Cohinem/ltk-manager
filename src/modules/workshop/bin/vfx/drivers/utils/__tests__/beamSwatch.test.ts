import { describe, expect, it } from "vitest";

import type { Point } from "../../../engine/model/rig";
import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
import type { Source } from "../../../engine/simulation/particleRead";
import { createPool, spawn } from "../../../engine/simulation/pool";
import { beamFrame, heldSource, LONGEST, reachOf } from "../beamSwatch";
import { widestScale } from "../trailSwatch";

const UPRIGHT = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

function sourceOf(emitters: readonly number[], origin: Point = [0, 0, 0], target = origin): Source {
  const pool = createPool(emitters.length);
  for (const emitter of emitters) spawn(pool, emitter, 0, 1, 0.5);
  return { pool, time: 0, elapsed: 0, origin, target, orientation: UPRIGHT };
}

describe("beamSwatch", () => {
  it("shows the first system holding a particle of the emitter", () => {
    const empty = sourceOf([1, 3]);
    const held = sourceOf([3, 2]);
    const later = sourceOf([2]);

    expect(heldSource([empty, held, later], 2)).toBe(held);
    expect(heldSource([empty, held], 4)).toBeNull();
  });

  it("reaches from the system's origin to its target", () => {
    expect(reachOf(sourceOf([], [1, 2, 3], [4, 6, 3]))).toBe(5);
  });

  it("keeps a short beam's own shape", () => {
    const frame = beamFrame(20, 60);

    expect(frame).toEqual({ length: 60, stretch: 1, halfWidth: 30, halfHeight: 10 });
  });

  it("stands a long beam up rather than shortening it", () => {
    const frame = beamFrame(10, 800);

    expect(frame.length).toBe(800);
    expect(frame.stretch).toBe(800 / LONGEST / 10);
    expect(frame.halfWidth / frame.halfHeight).toBe(LONGEST);
  });

  it("draws a beam of no length at the longest it shows", () => {
    expect(beamFrame(10, 0).length).toBe(10 * LONGEST);
    expect(beamFrame(10, Number.NaN).length).toBe(10 * LONGEST);
  });

  it("measures a beam's whole width off its widest scale", () => {
    expect(widestScale(emitterOf(0, { particleLifetime: flat(1), scale0: flat(-24, 0, 0) }))).toBe(
      24,
    );
    expect(widestScale(emitterOf(0, { scale0: flat(0, 0, 0) }))).toBe(1);
  });
});
