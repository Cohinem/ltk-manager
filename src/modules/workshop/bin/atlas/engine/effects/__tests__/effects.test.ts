import { describe, expect, it } from "vitest";

import type { DrawnEffect } from "../../commands/types";
import type { ViewEffect } from "../../model/view";
import { effectConstants, effectPasses, isTimed } from "../effects";

function drawn(effect: ViewEffect, pass = 0): DrawnEffect {
  return { effect, pass, centre: [0.5, 0.5], uvSize: [0.5, 0.25], texel: [0, 0] };
}

const COOLDOWN: ViewEffect = {
  effect: "cooldown",
  color0: [255, 0, 0, 255],
  color1: [0, 0, 0, 128],
};

describe("effectPasses", () => {
  it("draws a cooldown's sweep and then its hand as a line strip", () => {
    const passes = effectPasses(COOLDOWN);

    expect(passes.map((pass) => pass.shader)).toEqual(["cooldown", "cooldownLine"]);
    expect(passes[1]?.primitive).toBe("lineStrip");
  });

  it("picks the radial fill pixel stage by the fill flag", () => {
    expect(effectPasses({ effect: "cooldownRadial", fill: true })[0]?.shader).toBe(
      "cooldownRadialFill",
    );
  });
});

describe("effectConstants", () => {
  it("sweeps a cooldown through the live input's share of a turn, colours in 0 to 1", () => {
    const constants = effectConstants(drawn(COOLDOWN), 0, 0.25);

    expect(constants.params?.[0]).toBeCloseTo(Math.PI / 2);
    expect(constants.color0).toEqual([1, 0, 0, 1]);
    expect(constants.color1?.[3]).toBeCloseTo(128 / 255);
  });

  it("points the hand from the top and stretches it to the square's edge", () => {
    const [x, y, reach] = effectConstants(drawn(COOLDOWN, 1), 0, 0.125).angleParams ?? [];

    expect(x).toBeCloseTo(-Math.SQRT1_2);
    expect(y).toBeCloseTo(-Math.SQRT1_2);
    expect(reach).toBeCloseTo(Math.SQRT2);
  });

  it("steps a flipbook by its first frame and a texel, along its rows by the clock", () => {
    const flipbook: ViewEffect = { effect: "animation", frames: 8, perRow: 4, fps: 10, finish: 0 };
    const frame = {
      ...drawn(flipbook),
      uvSize: [78 / 2048, 142 / 2048],
      texel: [1 / 2048, 1 / 2048],
    } as const;

    const [u, v] = effectConstants(frame, 0.55, 0).animationVSParams ?? [];

    expect(isTimed(flipbook)).toBe(true);
    expect(u).toBeCloseTo((5 % 4) * (79 / 2048));
    expect(v).toBeCloseTo(1 * (143 / 2048));
  });

  it("desaturates between the class's bounds by the live input", () => {
    const effect: ViewEffect = { effect: "desaturate", minimum: 0.2, maximum: 1 };

    expect(effectConstants(drawn(effect), 0, 0.5).params?.[0]).toBeCloseTo(0.6);
  });
});
