import { describe, expect, it } from "vitest";

import type { ValueCurve } from "../../../engine/model/model";
import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
import { shapeBody } from "../shapeBody";
import { cloudReach, spawnCloud } from "../spawnCloud";

/** A three-channel curve running from `from` at the start of the life to `to` at its end. */
function ramp(from: number[], to: number[]): ValueCurve {
  return {
    constant: from,
    keys: [
      { time: 0, values: from },
      { time: 1, values: to },
    ],
    tables: [],
  };
}

describe("spawnCloud", () => {
  it("keeps every birth of a volume sphere inside its radius", () => {
    const emitter = emitterOf(0, { shape: { kind: "sphere", radius: 10, volume: true } });
    const cloud = spawnCloud(emitter, 200);
    const { places } = cloud;

    for (let at = 0; at < 200; at += 1) {
      expect(Math.hypot(...places.subarray(at * 3, at * 3 + 3))).toBeLessThanOrEqual(10 + 1e-4);
    }
    expect(cloudReach(cloud)).toBeGreaterThan(5);
  });

  it("walks a keyed legacy offset across the emitter's life", () => {
    const emitter = emitterOf(0, {
      shape: {
        kind: "legacy",
        offset: ramp([0, 0, 0], [0, 100, 0]),
        translation: flat(0, 0, 0),
        angles: [],
        axes: [],
      },
    });
    const cloud = spawnCloud(emitter, 100);
    const { places } = cloud;

    expect(Math.abs(places[1]!)).toBeLessThan(1);
    expect(Math.abs(places[99 * 3 + 1]!)).toBeGreaterThan(99);
    expect(cloud.localHigh[1] - cloud.localLow[1]).toBeGreaterThan(98);
    expect(shapeBody(emitter.shape, cloud)).not.toBeNull();
  });

  it("marks every birth of a point on one place, framed with room around it", () => {
    const emitter = emitterOf(0, { shape: { kind: "point", offset: [0, 20, 0] } });
    const cloud = spawnCloud(emitter, 50);

    expect(shapeBody(emitter.shape, cloud)).toBeNull();
    expect(Math.abs(cloud.low[1])).toBeCloseTo(20);
    expect(cloudReach(cloud)).toBeGreaterThanOrEqual(25);
  });
});
