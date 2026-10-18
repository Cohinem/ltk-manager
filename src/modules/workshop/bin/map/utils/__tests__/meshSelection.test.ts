import { Ray, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import type { MapGeometryMesh } from "@/lib/tauri";
import type { MapGeometry } from "@/modules/viewport";

import type { PlacedItem } from "../mapOutline";
import {
  dragDelta,
  meshAnchor,
  meshId,
  meshIndexOf,
  meshPatch,
  meshTransformEdit,
  pickMesh,
  selectionMiddle,
} from "../meshSelection";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mesh(index: number, min: number[], max: number[]): MapGeometryMesh {
  return {
    index,
    transform: IDENTITY as MapGeometryMesh["transform"],
    min: min as MapGeometryMesh["min"],
    max: max as MapGeometryMesh["max"],
    visibility: 255,
    controller: null,
    region: null,
    quality: 31,
    backfaceCullingDisabled: false,
    vertexCount: 3,
    materials: [],
  };
}

describe("meshIndexOf", () => {
  it("reads a mesh id and skips a placeable id", () => {
    expect(meshIndexOf(meshId(12))).toBe(12);
    expect(meshIndexOf("0x1/0x2")).toBeNull();
  });
});

describe("pickMesh", () => {
  /* Two quads facing up at heights 0 and 5, the higher one shown or not. */
  const map = {
    positions: new Float32Array([
      -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, -1, 5, -1, 1, 5, -1, 1, 5, 1, -1, 5, 1,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]),
    meshes: [
      { firstSubmesh: 0, submeshCount: 1, min: [-1, 0, -1], max: [1, 0, 1] },
      { firstSubmesh: 1, submeshCount: 1, min: [-1, 5, -1], max: [1, 5, 1] },
    ],
    submeshes: [
      { startIndex: 0, indexCount: 6, material: 0 },
      { startIndex: 6, indexCount: 6, material: 0 },
    ],
  } as unknown as MapGeometry;
  const down = new Ray(new Vector3(0.2, 10, 0.3), new Vector3(0, -1, 0));

  it("finds the nearest shown mesh under the ray", () => {
    expect(pickMesh(map, down, () => true)).toMatchObject({ mesh: 1, distance: 5 });
  });

  it("skips a mesh that is not shown", () => {
    const hit = pickMesh(map, down, (index) => index !== 1);

    expect(hit?.mesh).toBe(0);
    expect(hit?.point[1]).toBeCloseTo(0);
  });

  it("answers null for a ray past every mesh", () => {
    expect(pickMesh(map, new Ray(new Vector3(9, 10, 9), new Vector3(0, -1, 0)), () => true)).toBe(
      null,
    );
  });
});

describe("selectionMiddle", () => {
  it("averages the placeables' positions and the meshes' bounds middles", () => {
    const placed = { item: { position: [10, 0, 0] } } as unknown as PlacedItem;

    expect(selectionMiddle([placed], [mesh(0, [0, 0, 0], [10, 20, 0])])).toEqual([7.5, 5, 0]);
    expect(selectionMiddle([], [])).toBeNull();
  });
});

describe("meshAnchor", () => {
  it("stands the gizmo at the middle of the mesh's bounds", () => {
    expect(meshAnchor(mesh(0, [0, 0, 0], [10, 20, 30])).slice(12, 15)).toEqual([5, 10, 15]);
  });
});

describe("meshTransformEdit", () => {
  it("sets the transforms of the moved meshes and skips placeables", () => {
    expect(
      meshTransformEdit([
        { id: meshId(3), transform: IDENTITY },
        { id: "0x1/0x2", transform: IDENTITY },
      ]),
    ).toEqual({ kind: "transform", meshes: [{ mesh: 3, transform: IDENTITY }] });
    expect(meshTransformEdit([{ id: "0x1/0x2", transform: IDENTITY }])).toBeNull();
  });
});

describe("meshPatch", () => {
  it("copies a mesh's triangles over its own vertices alone", () => {
    const map = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 9, 9, 9, 10, 9, 9, 9, 10, 9]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
      meshes: [
        { firstSubmesh: 0, submeshCount: 1 },
        { firstSubmesh: 1, submeshCount: 1 },
      ],
      submeshes: [
        { startIndex: 0, indexCount: 3, material: 0 },
        { startIndex: 3, indexCount: 3, material: 0 },
      ],
    } as unknown as MapGeometry;

    const patch = meshPatch(map, [1]);

    expect([...patch.positions]).toEqual([9, 9, 9, 10, 9, 9, 9, 10, 9]);
    expect([...patch.indices]).toEqual([0, 1, 2]);
  });
});

describe("dragDelta", () => {
  it("is the lead's change during a drag and identity outside one", () => {
    const moved = [...IDENTITY];
    moved[12] = 100;
    const meshes = [mesh(0, [0, 0, 0], [1, 1, 1])];

    expect(dragDelta(meshes, null).elements.slice(12, 15)).toEqual([0, 0, 0]);
    expect(dragDelta(meshes, new Map([[meshId(0), moved]])).elements.slice(12, 15)).toEqual([
      100, 0, 0,
    ]);
  });
});
