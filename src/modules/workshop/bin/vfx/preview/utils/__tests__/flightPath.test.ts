import { describe, expect, it } from "vitest";

import type { SystemModel } from "../../../engine/model/model";
import { emptySystem } from "../../../engine/model/systemModel";
import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
import { flightPath } from "../flightPath";

function systemOf(...emitters: SystemModel["emitters"]): SystemModel {
  return { ...emptySystem(null), emitters };
}

describe("flightPath", () => {
  it("flies a constant velocity straight for the particle's life", () => {
    const emitter = emitterOf(0, {
      rate: flat(1),
      particleLifetime: flat(2),
      birthVelocity: flat(0, 50, 0),
    });
    const path = flightPath(systemOf(emitter), emitter, 0.5);
    const last = path.count - 1;

    expect(path.life).toBeCloseTo(2);
    expect(path.points[0]).toBe(0);
    /* The last point is the last step the particle lives through, a step short of its death. */
    expect(path.points[last * 3 + 1]).toBeGreaterThan(98);
    expect(path.points[last * 3 + 1]).toBeLessThanOrEqual(100);
    expect(path.points[last * 3]).toBeCloseTo(0);
  });

  it("bends the flight under acceleration", () => {
    const emitter = emitterOf(0, {
      rate: flat(1),
      particleLifetime: flat(1),
      birthVelocity: flat(100, 0, 0),
      acceleration: flat(0, -200, 0),
    });
    const path = flightPath(systemOf(emitter), emitter, 0.5);
    const last = path.count - 1;

    expect(path.points[last * 3]).toBeGreaterThan(98);
    expect(path.points[last * 3 + 1]).toBeLessThan(-50);
  });
});
