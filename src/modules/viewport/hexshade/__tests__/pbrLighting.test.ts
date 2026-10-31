import { DataUtils } from "three";
import { describe, expect, it } from "vitest";

import { DEFAULT_SUN } from "../../scene/utils/sunLight";
import {
  CUBE_LAYERS,
  GRID_LAYERS,
  gridLayerTexels,
  SKY_FACE_SIZE,
  skyCubeTexels,
} from "../pbrLighting";

describe("gridLayerTexels", () => {
  it("writes a linear face scaled by pi and leaves the sun's mask at one", () => {
    const out = new Float32Array(GRID_LAYERS * 4);

    gridLayerTexels(
      [
        [1, 0, 2],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      out,
    );

    expect(out[0]).toBeCloseTo(Math.PI);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(Math.PI);
    expect([...out.subarray(24)]).toEqual([1, 1, 1, 1]);
  });
});

describe("skyCubeTexels", () => {
  const FACE = SKY_FACE_SIZE * SKY_FACE_SIZE * 4;
  const middle = (face: number) => FACE * face + (FACE >> 1) + SKY_FACE_SIZE * 2;
  const red = (texels: Uint16Array, at: number) => DataUtils.fromHalfFloat(texels[at] ?? 0);

  it("states the sky on the face up and the ground on the face down", () => {
    const texels = skyCubeTexels({
      ...DEFAULT_SUN,
      sky: [1, 0, 0],
      ground: [0.25, 0, 0],
      horizon: [0.5, 0, 0],
    });

    expect(texels).toHaveLength(FACE * CUBE_LAYERS);
    expect(red(texels, middle(2))).toBeGreaterThan(red(texels, middle(0)));
    expect(red(texels, middle(0))).toBeGreaterThan(red(texels, middle(3)));
  });
});
