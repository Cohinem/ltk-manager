import { describe, expect, it } from "vitest";

import {
  carryInto,
  type DrawnRig,
  drawnJoints,
  sidesInto,
  SPHERE_VERTICES,
  sphereInto,
} from "../dynamicsOverlayModel";

/** A chain of three nodes on joints 4, 5 and 6: a pinned root, a particle, and a joint left out. */
const CHAIN: DrawnRig["chains"][number] = {
  count: 3,
  joint: Int32Array.of(4, 5, 6),
  simulated: Uint8Array.of(1, 1, 0),
  pinned: Uint8Array.of(1, 0, 0),
  radius: Float32Array.of(8, 8, 8),
};

function rounded(values: ArrayLike<number>): number[] {
  return Array.from(values, (value) => Math.round(value * 1e4) / 1e4 + 0);
}

describe("drawnJoints", () => {
  it("marks a chain's particles, the pinned one with no radius, in the skeleton's units", () => {
    const joints = drawnJoints({ chains: [CHAIN], slots: Int32Array.of(5) }, 2);

    expect(joints).toEqual([
      { slot: 4, pinned: true, radius: 0 },
      { slot: 5, pinned: false, radius: 4 },
    ]);
  });

  it("marks a joint that a modifier other than a chain writes", () => {
    const joints = drawnJoints({ chains: [CHAIN], slots: Int32Array.of(2, 5, 9) }, 1);

    expect(joints.map((joint) => joint.slot)).toEqual([4, 5, 2, 9]);
    expect(joints[2]).toEqual({ slot: 2, pinned: false, radius: 0 });
  });

  it("marks the written joints of a rig with no chain", () => {
    expect(drawnJoints({ chains: [], slots: Int32Array.of(3, 7) }, 1)).toEqual([
      { slot: 3, pinned: false, radius: 0 },
      { slot: 7, pinned: false, radius: 0 },
    ]);
  });
});

describe("sphereInto", () => {
  it("writes three closed rings, every vertex a radius from the centre", () => {
    const out = new Float32Array(3 + SPHERE_VERTICES * 3);

    const next = sphereInto(out, 3, 10, 20, 30, 5);

    expect(next).toBe(out.length);
    for (let at = 3; at < out.length; at += 3) {
      const away = Math.hypot(out[at] - 10, out[at + 1] - 20, out[at + 2] - 30);
      expect(away).toBeCloseTo(5, 4);
    }

    /* A ring is its segments end to end, so its last vertex is its first. */
    const ring = (SPHERE_VERTICES / 3) * 3;
    expect(rounded(out.subarray(3 + ring - 3, 3 + ring))).toEqual(rounded(out.subarray(3, 6)));
  });
});

describe("carryInto", () => {
  it("carries a point of a joint's frame by the joint's turn and place", () => {
    /* A quarter turn about Z that stands at (1, 2, 3), column-major. */
    const world = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1];
    const out = new Float32Array(3);

    carryInto(out, world, [5, 0, 0]);

    expect(rounded(out)).toEqual([1, 7, 3]);
  });
});

describe("sidesInto", () => {
  const sides = (a: number[], b: number[]) => {
    const out = new Float32Array(12);
    sidesInto(out, a, b);
    return [0, 3, 6, 9].map((at) => rounded(out.subarray(at, at + 3)));
  };

  it("answers four unit directions across the axis, in opposite pairs", () => {
    for (const end of [
      [0, 10, 0],
      [3, 1, -2],
    ]) {
      const [first, opposite, second, last] = sides([0, 0, 0], end);

      for (const side of [first, second]) {
        expect(Math.hypot(side[0], side[1], side[2])).toBeCloseTo(1, 3);
        expect(side[0] * end[0] + side[1] * end[1] + side[2] * end[2]).toBeCloseTo(0, 3);
      }
      expect(first[0] * second[0] + first[1] * second[1] + first[2] * second[2]).toBeCloseTo(0, 3);
      expect(opposite).toEqual(first.map((value) => -value + 0));
      expect(last).toEqual(second.map((value) => -value + 0));
    }
  });

  it("answers the flat directions for two ends on one point", () => {
    expect(sides([1, 1, 1], [1, 1, 1])).toEqual([
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]);
  });
});
