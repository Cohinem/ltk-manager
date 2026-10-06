import { describe, expect, it } from "vitest";

import type { EmissionSurfaceModel } from "../../../engine/model/model";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import type { EmissionSampler } from "../../../engine/simulation/emissionSurface";
import { sourceCloudInto } from "../sourceCloud";

type Triple = readonly [number, number, number];

/** A sampler that always returns the same point and normal, and records the sample times. */
function fixed(position: Triple, normal: Triple, asked: number[] = []): EmissionSampler {
  return {
    sample(time, _rng, out) {
      asked.push(time);
      out.position.set(position);
      out.normal.set(normal);
      return true;
    },
  };
}

const NOTHING: EmissionSampler = { sample: () => false };

const SURFACE: EmissionSurfaceModel = {
  kind: "mesh",
  mesh: null,
  skeleton: null,
  submeshes: [],
  joints: [],
  scale: 1,
  maxJointWeights: 4,
  useNormal: true,
};

const MESH = { mesh: { path: "ring.scb", asset: null }, scale: 1, useNormal: true };

function buffers(births: number) {
  return { points: new Float32Array(births * 3), ticks: new Float32Array(births * 6) };
}

describe("sourceCloudInto", () => {
  it("adds the mesh point and the surface point to the emitter position", () => {
    const { points, ticks } = buffers(2);
    const emitter = emitterOf(0, { emissionMesh: MESH, emissionSurface: SURFACE });
    const asked: number[] = [];

    const count = sourceCloudInto(
      { mesh: fixed([0, 7, 0], [0, 0, 1]), surface: fixed([5, 0, 0], [1, 0, 0], asked) },
      emitter,
      1.5,
      Float32Array.of(1, 1, 1),
      points,
      ticks,
    );

    expect(count).toEqual({ births: 2, directed: 2 });
    expect(Array.from(points.subarray(0, 3))).toEqual([6, 8, 1]);
    expect(asked).toEqual([1.5, 1.5]);
  });

  it("draws the line along the surface normal, or along the mesh normal when the surface's switch is off", () => {
    const { points, ticks } = buffers(1);
    const samplers = { mesh: fixed([0, 0, 0], [0, 0, 1]), surface: fixed([0, 0, 0], [1, 0, 0]) };
    const stands = new Float32Array(3);

    sourceCloudInto(
      samplers,
      emitterOf(0, { emissionMesh: MESH, emissionSurface: SURFACE }),
      0,
      stands,
      points,
      ticks,
    );
    expect(Array.from(ticks)).toEqual([0, 0, 0, 10, 0, 0]);

    sourceCloudInto(
      samplers,
      emitterOf(0, { emissionMesh: MESH, emissionSurface: { ...SURFACE, useNormal: false } }),
      0,
      stands,
      points,
      ticks,
    );
    expect(Array.from(ticks)).toEqual([0, 0, 0, 0, 0, 10]);
  });

  it("writes no line when neither normal switch is on", () => {
    const { points, ticks } = buffers(3);
    const emitter = emitterOf(0, { emissionMesh: { ...MESH, useNormal: false } });

    const count = sourceCloudInto(
      { mesh: fixed([2, 0, 0], [0, 1, 0]), surface: null },
      emitter,
      0,
      new Float32Array(3),
      points,
      ticks,
    );

    expect(count).toEqual({ births: 3, directed: 0 });
  });

  it("writes no birth when no sampler returns a point", () => {
    const { points, ticks } = buffers(4);

    const count = sourceCloudInto(
      { mesh: NOTHING, surface: null },
      emitterOf(0, { emissionMesh: MESH }),
      0,
      new Float32Array(3),
      points,
      ticks,
    );

    expect(count).toEqual({ births: 0, directed: 0 });
  });
});
