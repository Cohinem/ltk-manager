import { describe, expect, it } from "vitest";

import { createPose, type MeshGeometry } from "@/modules/viewport";

import { nameHash } from "../../../../shared/utils/binHash";
import type { EmissionSurfaceModel } from "../../../engine/model/model";
import { Rng } from "../../../engine/utils/Rng";
import { meshSurface, skeletonSurface, staticMeshSurface } from "../emissionSurface";
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

/** A generator answering `draws` in turn, which a sampler reads in the order it documents. */
function scripted(...draws: number[]): Rng {
  let at = 0;
  return {
    unitFloat: () => {
      const draw = draws[at];
      at += 1;
      if (draw === undefined) throw new Error("the sampler drew more often than scripted");
      return draw;
    },
  } as unknown as Rng;
}

/** A static mesh of `triangles`, each three corners, with nothing but positions. */
function staticMesh(...triangles: number[][]): MeshGeometry {
  const positions = Float32Array.from(triangles.flat());
  return {
    positions,
    normals: null,
    uvs: null,
    skinIndices: null,
    skinWeights: null,
    indices: Uint32Array.from({ length: positions.length / 3 }, (_, index) => index),
    ranges: [],
  };
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

describe("staticMeshSurface", () => {
  /** One unit of area, in the plane `z = 0`, wound so its normal is `+Z`. */
  const SMALL = [1, 0, 0, 3, 0, 0, 1, 1, 0];

  /** Three units of area, standing far off the first. */
  const LARGE = [10, 0, 0, 16, 0, 0, 10, 1, 0];

  /** The corner a sampler lands on where both of its point draws are zero. */
  function cornerPicked(mesh: MeshGeometry, pick: number): number[] {
    const out = birth();
    expect(staticMeshSurface(mesh, 1).sample(0, scripted(pick, 0, 0), out)).toBe(true);
    return Array.from(out.position);
  }

  it("picks a triangle by its share of the area rather than by the count", () => {
    const mesh = staticMesh(SMALL, LARGE);

    expect(cornerPicked(mesh, 0)).toEqual([1, 0, 0]);
    expect(cornerPicked(mesh, 0.24)).toEqual([1, 0, 0]);
    /* A quarter of the area is the small triangle's, so the rest of the draw is the large one's. */
    expect(cornerPicked(mesh, 0.25)).toEqual([10, 0, 0]);
    expect(cornerPicked(mesh, 0.4)).toEqual([10, 0, 0]);
    expect(cornerPicked(mesh, 0.999)).toEqual([10, 0, 0]);
  });

  it("skips a triangle of no area, however many of them the mesh holds", () => {
    const flat = [5, 5, 5, 6, 6, 6, 7, 7, 7];
    const mesh = staticMesh(flat, flat, SMALL);

    expect(cornerPicked(mesh, 0)).toEqual([1, 0, 0]);
    expect(cornerPicked(mesh, 0.5)).toEqual([1, 0, 0]);
  });

  it("blends the three corners by its two draws, which lands inside the triangle", () => {
    const surface = staticMeshSurface(staticMesh(SMALL), 1);
    const at = (u: number, v: number) => {
      const out = birth();
      surface.sample(0, scripted(0, u, v), out);
      return Array.from(out.position);
    };

    expect(at(0, 0)).toEqual([1, 0, 0]);
    expect(at(0, 1)).toEqual([3, 0, 0]);
    expect(at(1, 0)).toEqual([1, 1, 0]);
    /* The first draw is the third corner's weight, and the second splits the rest. */
    expect(at(0.5, 0.5)).toEqual([0.25 * 1 + 0.25 * 3 + 0.5 * 1, 0.5, 0]);
    expect(at(0.25, 0.75)).toEqual([0.1875 * 1 + 0.5625 * 3 + 0.25 * 1, 0.25, 0]);
  });

  it("scales the point off the mesh's own origin, and leaves the normal a unit", () => {
    const out = birth();
    const surface = staticMeshSurface(staticMesh(SMALL), 4);

    expect(surface.sample(0, scripted(0, 0.5, 0.5), out)).toBe(true);

    expect(Array.from(out.position)).toEqual([6, 2, 0]);
    expect(Array.from(out.normal)).toEqual([0, 0, 1]);
  });

  it("answers the triangle's geometric normal, by its winding, and reads no vertex normal", () => {
    const out = birth();
    const reversed = [1, 0, 0, 1, 1, 0, 3, 0, 0];
    const lying = { ...staticMesh(SMALL), normals: Float32Array.of(1, 0, 0, 1, 0, 0, 1, 0, 0) };
    const tilted = [0, 0, 0, 0, 2, 0, 0, 0, 2];

    staticMeshSurface(lying, 1).sample(0, scripted(0, 0.3, 0.3), out);
    expect(Array.from(out.normal)).toEqual([0, 0, 1]);

    staticMeshSurface(staticMesh(reversed), 1).sample(0, scripted(0, 0.3, 0.3), out);
    expect(Array.from(out.normal)).toEqual([0, 0, -1]);

    staticMeshSurface(staticMesh(tilted), 1).sample(0, scripted(0, 0.3, 0.3), out);
    expect(Array.from(out.normal)).toEqual([1, 0, 0]);
  });

  it("samples nothing off a mesh with no area, and draws no number for it", () => {
    const out = birth();
    const flat = [5, 5, 5, 6, 6, 6, 7, 7, 7];

    expect(staticMeshSurface(staticMesh(flat), 1).sample(0, scripted(), out)).toBe(false);
    expect(staticMeshSurface(staticMesh(), 1).sample(0, scripted(), out)).toBe(false);
    expect(Array.from(out.position)).toEqual([0, 0, 0]);
    expect(Array.from(out.normal)).toEqual([0, 0, 0]);
  });

  it("reads its three draws in a fixed order, so a seed replays the same birth", () => {
    const surface = staticMeshSurface(staticMesh(SMALL, LARGE), 1);
    const first = birth();
    const replay = birth();

    surface.sample(0, new Rng(7), first);
    surface.sample(3, new Rng(7), replay);

    expect(replay).toEqual(first);
  });
});
