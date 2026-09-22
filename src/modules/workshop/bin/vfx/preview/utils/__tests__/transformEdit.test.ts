import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { standingInto } from "../../../engine/utils/basis";
import {
  basisMatrix,
  engineRotation,
  rotationFrame,
  translationFrame,
  viewportRotation,
} from "../transformEdit";

const IDENTITY = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

describe("emitter transform editing", () => {
  it("round-trips offsets through the viewport mirror, scale and translation", () => {
    const matrix = translationFrame(new Float32Array([0, 0, 2, 0, 3, 0, -4, 0, 0]), [10, 20, 30]);
    const local = new Vector3(1, 2, 3);
    const world = local.clone().applyMatrix4(matrix);
    expect(world.toArray()).toEqual([-16, 26, 26]);
    expect(world.applyMatrix4(matrix.clone().invert()).distanceTo(local)).toBeLessThan(1e-8);
  });

  it("matches the simulation's YXZ convention under a rotated parent", () => {
    const parent = basisMatrix(
      standingInto(new Float32Array([10, 30, 5]), 0, 0, new Float32Array(9)),
    );
    const degrees = [20, 45, -30] as const;
    const rotation = viewportRotation(parent, degrees);
    const mirror = new Matrix4().makeScale(-1, 1, 1);
    const expected = mirror
      .clone()
      .multiply(parent)
      .multiply(basisMatrix(standingInto(new Float32Array(degrees), 0, 0, new Float32Array(9))))
      .multiply(mirror);
    const actual = new Matrix4().makeRotationFromQuaternion(rotation);
    actual.elements.forEach((value, at) => expect(value).toBeCloseTo(expected.elements[at], 5));

    engineRotation(parent, rotation).forEach((value, at) =>
      expect(value).toBeCloseTo(degrees[at], 4),
    );
  });

  it("rejects singular, mirrored, sheared and nonuniform rotation parents", () => {
    expect(rotationFrame(IDENTITY)).not.toBeNull();
    expect(rotationFrame(new Float32Array([2, 0, 0, 0, 2, 0, 0, 0, 2]))).not.toBeNull();
    for (const values of [
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [-1, 0, 0, 0, 1, 0, 0, 0, 1],
      [1, 1, 0, 0, 1, 0, 0, 0, 1],
      [2, 0, 0, 0, 1, 0, 0, 0, 1],
    ]) {
      expect(rotationFrame(new Float32Array(values))).toBeNull();
    }
  });
});
