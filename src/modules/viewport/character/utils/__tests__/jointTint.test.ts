import { describe, expect, it } from "vitest";

import { tintFloats, UNWEIGHTED, vertexTints } from "../jointTint";

/** Two vertices: one wholly on shader joint 0, one split between shader joints 0 and 1. */
const INDICES = Uint16Array.of(0, 0, 0, 0, 0, 1, 0, 0);
const WEIGHTS = Float32Array.of(1, 0, 0, 0, 0.5, 0.5, 0, 0);
/** Shader joint 0 is skeleton joint 2, shader joint 1 is skeleton joint 0. */
const INFLUENCES = Uint32Array.of(2, 0);

function tints(jointWeights: ArrayLike<number> | null): number[] {
  const out = vertexTints(
    INDICES,
    WEIGHTS,
    INFLUENCES,
    jointWeights,
    new Float32Array(tintFloats(2)),
  );
  return Array.from(out, (value) => Math.round(value * 100) / 100);
}

describe("vertexTints", () => {
  it("writes full colour to every channel without a mask", () => {
    expect(tints(null)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("keeps a vertex on a weighed joint and dims one on none", () => {
    expect(tints([0, 0, 1])).toEqual([1, 1, 1, 0.65, 0.65, 0.65]);
  });

  it("grades a vertex by its skin weights across the joints weighing it", () => {
    const half = Math.round((UNWEIGHTED + (1 - UNWEIGHTED) * 0.5) * 100) / 100;

    expect(tints([1, 0, 0])).toEqual([0.3, 0.3, 0.3, half, half, half]);
  });

  it("reads a joint the mask does not reach as unweighed, and clamps a weight over one", () => {
    expect(tints([5])).toEqual([0.3, 0.3, 0.3, 0.65, 0.65, 0.65]);
  });
});
