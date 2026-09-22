import { describe, expect, it } from "vitest";

import { curveValueStep, snapCurveValue } from "../curveSnapping";

describe("curve snapping", () => {
  it("uses clean increments from the channel's authored range", () => {
    const keys = [
      { time: 0, values: [0] },
      { time: 1, values: [5] },
    ];
    const guide = curveValueStep(keys, 0, false);

    expect(guide).toEqual({ step: 0.05, smallStep: 0.005, largeStep: 0.5, decimals: 3 });
    expect(snapCurveValue(1.7519038572, guide)).toBe(1.75);
  });

  it("keeps enough precision for a small-value curve", () => {
    const keys = [
      { time: 0, values: [0.0001] },
      { time: 1, values: [0.0006] },
    ];
    const guide = curveValueStep(keys, 0, false);

    expect(guide.step).toBe(0.000005);
    expect(guide.decimals).toBe(6);
    expect(snapCurveValue(0.0004137, guide)).toBe(0.000415);
  });

  it("uses hundredths for normalized channels", () => {
    const guide = curveValueStep([], 0, true);

    expect(guide.step).toBe(0.01);
    expect(snapCurveValue(0.7539, guide)).toBe(0.75);
  });
});
