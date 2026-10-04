import { Color } from "three";
import { describe, expect, it } from "vitest";

import {
  boneSegments,
  colorFloats,
  jointColors,
  nearestJoint,
  subtreeOf,
  weighedJoints,
} from "../armatureModel";

const PALETTE = {
  plain: new Color(1, 1, 1),
  weighed: new Color(1, 0, 0),
  unweighed: new Color(0, 0, 1),
};

describe("boneSegments", () => {
  it("hangs every joint with a parent from it, and no root from anything", () => {
    expect(boneSegments(Int32Array.of(-1, 0, 0, 2, -1))).toEqual([
      [1, 0],
      [2, 0],
      [3, 2],
    ]);
  });
});

describe("subtreeOf", () => {
  it("holds a joint and every joint under it", () => {
    /* 0 is the root, 1 and 2 hang from it, 3 hangs from 2. */
    expect(subtreeOf([-1, 0, 0, 2], 2)).toEqual([false, false, true, true]);
    expect(subtreeOf([-1, 0, 0, 2], 0)).toEqual([true, true, true, true]);
  });
});

describe("nearestJoint", () => {
  const screen = [10, 10, 0.5, 14, 10, 0.5, 200, 200, 0.5, 10, 10, 1.5];

  it("picks the joint nearest the point within reach", () => {
    expect(nearestJoint(screen, 13, 10, 8)).toBe(1);
    expect(nearestJoint(screen, 9, 10, 8)).toBe(0);
  });

  it("picks none where no joint is within reach, and none behind the camera", () => {
    expect(nearestJoint(screen, 100, 100, 8)).toBe(-1);
    expect(nearestJoint([10, 10, 1.5], 10, 10, 8)).toBe(-1);
  });

  it("picks the joint nearer the camera of two drawn on one point", () => {
    expect(nearestJoint([10, 10, 0.9, 10, 10, 0.2], 10, 10, 8)).toBe(1);
  });
});

describe("weighedJoints", () => {
  it("answers no mask as null", () => {
    expect(weighedJoints(3, null)).toBeNull();
  });

  it("weighs a joint with any weight, and none past the list or with no number", () => {
    expect(weighedJoints(4, [0.5, 0, Number.NaN])).toEqual([true, false, false, false]);
  });
});

describe("jointColors", () => {
  it("paints every joint plain with no mask", () => {
    expect([...jointColors(null, 2, PALETTE, new Float32Array(colorFloats(2)))]).toEqual([
      1, 1, 1, 1, 1, 1,
    ]);
  });

  it("paints a weighed joint and an unweighed one apart", () => {
    const out = jointColors([true, false], 2, PALETTE, new Float32Array(colorFloats(2)));

    expect([...out]).toEqual([1, 0, 0, 0, 0, 1]);
  });
});
