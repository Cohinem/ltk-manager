import { describe, expect, it } from "vitest";

import type { MapGeometryMesh, MeshDelta } from "@/lib/tauri";
import type { MapGeometry, MapMesh } from "@/modules/viewport";

import { applyMeshDeltas, insertedMeshes, shiftMeshIds } from "../geometryDeltas";

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function translation(x: number, y: number, z: number): MapGeometryMesh["transform"] {
  const out = [...IDENTITY];
  out[12] = x;
  out[13] = y;
  out[14] = z;
  return out as MapGeometryMesh["transform"];
}

function mapMesh(firstSubmesh: number): MapMesh {
  return {
    min: [0, 0, 0],
    max: [1, 1, 0],
    visibility: 255,
    controller: null,
    quality: 31,
    flags: 0,
    firstSubmesh,
    submeshCount: 1,
    bakedLight: null,
    stationaryLight: null,
  };
}

/** Two triangles, one mesh each, three vertices each. */
function twoTriangles(): MapGeometry {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uv0: new Float32Array(12),
    uv1: null,
    indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    meshes: [mapMesh(0), mapMesh(1)],
    submeshes: [
      { startIndex: 0, indexCount: 3, material: 0 },
      { startIndex: 3, indexCount: 3, material: 1 },
    ],
    lightmaps: [],
    materials: ["Maps/A", "Maps/B"],
  };
}

function record(index: number, transform: MapGeometryMesh["transform"]): MapGeometryMesh {
  return {
    index,
    transform,
    min: [0, 0, 0],
    max: [1, 1, 0],
    visibility: 1,
    controller: "0x00000001",
    region: null,
    quality: 31,
    backfaceCullingDisabled: true,
    vertexCount: 3,
    materials: ["Maps/C"],
  };
}

describe("applyMeshDeltas", () => {
  it("moves a mesh's own vertices by the change of its transform", () => {
    const map = twoTriangles();
    const deltas: MeshDelta[] = [
      {
        kind: "update",
        mesh: 1,
        from: IDENTITY as MapGeometryMesh["transform"],
        record: record(1, translation(0, 5, 0)),
      },
    ];

    const next = applyMeshDeltas(map, deltas, null);

    expect([...next.positions.slice(9, 12)]).toEqual([10, 5, 0]);
    expect([...next.positions.slice(0, 3)]).toEqual([0, 0, 0]);
    expect(map.positions[10]).toBe(0);
    expect(next.meshes[1]?.min).toEqual([10, 5, 0]);
    expect(next.meshes[1]?.controller).toBe("0x00000001");
    expect(next.meshes[1]?.flags).toBe(1);
    expect(next.materials[next.submeshes[1]?.material ?? -1]).toBe("Maps/C");
  });

  it("drops a removed mesh's runs and moves the runs after it down", () => {
    const next = applyMeshDeltas(twoTriangles(), [{ kind: "remove", mesh: 0 }], null);

    expect(next.meshes).toHaveLength(1);
    expect(next.meshes[0]?.firstSubmesh).toBe(0);
    expect(next.submeshes).toEqual([{ startIndex: 3, indexCount: 3, material: 1 }]);
  });

  it("appends an inserted mesh's vertices and indices at its place", () => {
    const map = twoTriangles();
    const inserted: MapGeometry = {
      ...twoTriangles(),
      meshes: [mapMesh(0)],
      submeshes: [{ startIndex: 0, indexCount: 3, material: 0 }],
      materials: ["Maps/New"],
    };

    const next = applyMeshDeltas(map, [{ kind: "insert", mesh: 1 }], inserted);

    expect(next.meshes).toHaveLength(3);
    expect(next.positions.length).toBe(map.positions.length + 9);
    expect([...next.indices.slice(6)]).toEqual([6, 7, 8]);
    expect(next.submeshes[1]).toEqual({ startIndex: 6, indexCount: 3, material: 2 });
    expect(next.meshes[1]?.firstSubmesh).toBe(1);
    expect(next.meshes[2]?.firstSubmesh).toBe(2);
    expect(next.materials[2]).toBe("Maps/New");
  });
});

describe("insertedMeshes", () => {
  it("lists the inserted meshes in order", () => {
    expect(
      insertedMeshes([
        { kind: "remove", mesh: 3 },
        { kind: "insert", mesh: 4 },
        { kind: "insert", mesh: 5 },
      ]),
    ).toEqual([4, 5]);
  });
});

describe("shiftMeshIds", () => {
  it("drops a removed mesh and moves the ones after it down", () => {
    const ids = new Set(["mesh:1", "mesh:2", "mesh:5", "0x1/0x2"]);

    expect(shiftMeshIds(ids, [{ kind: "remove", mesh: 2 }])).toEqual(
      new Set(["mesh:1", "mesh:4", "0x1/0x2"]),
    );
  });

  it("moves the meshes from an insert on up", () => {
    expect(shiftMeshIds(new Set(["mesh:1", "mesh:2"]), [{ kind: "insert", mesh: 2 }])).toEqual(
      new Set(["mesh:1", "mesh:3"]),
    );
  });
});
