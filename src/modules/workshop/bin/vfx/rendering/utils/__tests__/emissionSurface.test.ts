import { describe, expect, it } from "vitest";

import { createPose } from "@/modules/viewport";

import { nameHash } from "../../../../shared/utils/binHash";
import type { EmissionSurfaceModel } from "../../../engine/model/model";
import { Rng } from "../../../engine/utils/Rng";
import { meshSurface, skeletonSurface } from "../emissionSurface";
import { CLIP, MESH, SKELETON } from "./skinnedFixture";

const MODEL: EmissionSurfaceModel = {
  kind: "mesh",
  mesh: null,
  skeleton: null,
  animation: null,
  submeshes: [],
  joints: [],
  scale: 1,
  maxJointWeights: 4,
  useNormal: true,
};

function birth() {
  return { position: new Float32Array(3), normal: new Float32Array(3) };
}

describe("emission surfaces", () => {
  it("samples the animated surface in engine space and replays the same birth after a seek", () => {
    const surface = meshSurface(MODEL, MESH, createPose(SKELETON, CLIP));
    const first = birth();
    const later = birth();
    const replay = birth();

    expect(surface.sample(0, new Rng(42), first)).toBe(true);
    surface.sample(0.5, new Rng(42), later);
    surface.sample(0, new Rng(42), replay);

    expect(first.position[0]).toBeCloseTo(2);
    expect(later.position[0]).toBeCloseTo(4);
    expect(first.normal).toEqual(Float32Array.of(1, 0, 0));
    expect(replay).toEqual(first);
    expect(first.position[1] + first.position[2]).toBeLessThanOrEqual(1);
  });

  it("samples a selected bone and refuses a mask that selects no bones", () => {
    const pose = createPose(SKELETON, CLIP);
    const surface = skeletonSurface(
      { ...MODEL, kind: "skeleton", joints: [nameHash("tip")] },
      pose,
    );
    const out = birth();

    expect(surface.sample(0.5, new Rng(42), out)).toBe(true);
    expect(out.position[0]).toBeGreaterThanOrEqual(0);
    expect(out.position[0]).toBeLessThanOrEqual(4);
    expect(out.position[1]).toBe(0);
    expect(
      skeletonSurface({ ...MODEL, joints: [nameHash("missing")] }, pose).sample(0, new Rng(1), out),
    ).toBe(false);
  });
});
