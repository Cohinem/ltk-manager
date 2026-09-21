import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { createPose } from "@/modules/viewport";

import { meshPose, skinWeights } from "../meshPose";
import { CLIP, MESH, SKELETON } from "./skinnedFixture";

describe("meshPose", () => {
  it("keeps independent particle ages and remaps shader influences through inverse binds", () => {
    const palette = meshPose(createPose(SKELETON, CLIP));
    palette.write(0, 0);
    palette.write(1, 0.5);

    const data = palette.texture.image.data as Float32Array;
    const birth = new Matrix4().fromArray(data, 0);
    const older = new Matrix4().fromArray(data, 32);

    expect(new Vector3(-2, 0, 0).applyMatrix4(birth).x).toBeCloseTo(-2);
    expect(new Vector3(-2, 0, 0).applyMatrix4(older).x).toBeCloseTo(-4);

    palette.write(1, 0);
    expect(Array.from(data.slice(32, 48))).toEqual(Array.from(data.slice(0, 16)));
    palette.texture.dispose();
  });

  it("normalizes valid weights and leaves invalid rows in the bind pose", () => {
    const mesh = {
      ...MESH,
      skinIndices: Uint8Array.of(0, 1, 255, 0, 255, 255, 255, 255, 0, 0, 0, 0),
      skinWeights: Float32Array.of(2, 2, 9, -1, 1, 0, 0, 0, NaN, 0, 0, 0),
    };

    expect(Array.from(skinWeights(mesh, 2))).toEqual([0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
