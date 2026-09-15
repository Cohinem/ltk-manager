import { Color } from "three";
import { describe, expect, it } from "vitest";

import { boneSegments, colorFloats, jointColors, weighedJoints } from "../armatureModel";

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
