import { describe, expect, it } from "vitest";

import { BufferError } from "../../utils/bufferReader";
import {
  drawnMeshes,
  type MapGeometry,
  mapLayers,
  mapOrigin,
  MESH_FLAG,
  openingFlags,
  readMapBuffer,
} from "../mapBuffer";

/** One mesh of the buffer a writer would produce, in the fields a test varies. */
interface Written {
  visibility: number;
  quality?: number;
  flags?: number;
  firstSubmesh: number;
  submeshCount: number;
}

/**
 * Writes the buffer `preview/map.rs` writes, off the layout its module doc states.
 *
 * Hand-written rather than shared with the reader, so that the two can disagree.
 */
function write({
  vertices = 3,
  uv1 = false,
  meshes = [],
  submeshes = [],
  materials = [],
}: {
  vertices?: number;
  uv1?: boolean;
  meshes?: Written[];
  submeshes?: { startIndex: number; indexCount: number; material: number }[];
  materials?: string[];
} = {}): ArrayBuffer {
  const indices = vertices;
  const names = materials.map((name) => new TextEncoder().encode(name));
  const size =
    28 +
    vertices * (3 + 3 + 2 + (uv1 ? 2 : 0)) * 4 +
    indices * 4 +
    meshes.length * 36 +
    submeshes.length * 12 +
    4 +
    names.reduce((n, name) => n + 4 + name.length, 0);

  const bytes = new ArrayBuffer(size);
  const view = new DataView(bytes);
  let at = 0;
  const u32 = (value: number) => {
    view.setUint32(at, value, true);
    at += 4;
  };
  const f32 = (value: number) => {
    view.setFloat32(at, value, true);
    at += 4;
  };

  u32(0x4d4b544c);
  u32(1);
  u32(uv1 ? 1 : 0);
  u32(vertices);
  u32(indices);
  u32(meshes.length);
  u32(submeshes.length);

  for (let n = 0; n < vertices * 3; n += 1) f32(n);
  for (let n = 0; n < vertices * 3; n += 1) f32(0);
  for (let n = 0; n < vertices * 2; n += 1) f32(n * 0.5);
  if (uv1) for (let n = 0; n < vertices * 2; n += 1) f32(9);
  for (let n = 0; n < indices; n += 1) u32(n);

  for (const mesh of meshes) {
    for (let axis = 0; axis < 3; axis += 1) f32(-1);
    for (let axis = 0; axis < 3; axis += 1) f32(1);
    view.setUint8(at, mesh.visibility);
    view.setUint8(at + 1, mesh.quality ?? 0x1f);
    view.setUint8(at + 2, mesh.flags ?? 0);
    view.setUint8(at + 3, 0);
    at += 4;
    u32(mesh.firstSubmesh);
    u32(mesh.submeshCount);
  }
  for (const submesh of submeshes) {
    u32(submesh.startIndex);
    u32(submesh.indexCount);
    u32(submesh.material);
  }
  u32(names.length);
  for (const name of names) {
    u32(name.length);
    new Uint8Array(bytes, at, name.length).set(name);
    at += name.length;
  }
  return bytes;
}

/** A one-mesh, one-submesh map, which most cases only vary one field of. */
function simple(over: Parameters<typeof write>[0] = {}): MapGeometry {
  return readMapBuffer(
    write({
      meshes: [{ visibility: 0b0000_0101, firstSubmesh: 0, submeshCount: 1 }],
      submeshes: [{ startIndex: 0, indexCount: 3, material: 0 }],
      materials: ["Characters/Test/Material"],
      ...over,
    }),
  );
}

describe("readMapBuffer", () => {
  it("refuses bytes that are not a map buffer", () => {
    const bytes = write();
    new DataView(bytes).setUint32(0, 0x474b544c, true);

    expect(() => readMapBuffer(bytes)).toThrow(BufferError);
  });

  it("refuses a version this build does not read", () => {
    const bytes = write();
    new DataView(bytes).setUint32(4, 2, true);

    expect(() => readMapBuffer(bytes)).toThrow(BufferError);
  });

  it("refuses a buffer that ends before the counts in its header", () => {
    expect(() => readMapBuffer(write().slice(0, 40))).toThrow(BufferError);
  });

  it("reads the counts and the blocks", () => {
    const map = simple();

    expect(map.positions).toHaveLength(9);
    expect(map.normals).toHaveLength(9);
    expect(map.uv0).toHaveLength(6);
    expect(Array.from(map.indices)).toEqual([0, 1, 2]);
    expect(map.materials).toEqual(["Characters/Test/Material"]);
  });

  it("carries no uv1 block where the flag is clear", () => {
    expect(simple().uv1).toBeNull();
  });

  it("carries a uv1 block under its flag", () => {
    expect(Array.from(simple({ uv1: true }).uv1 ?? [])).toEqual([9, 9, 9, 9, 9, 9]);
  });

  /* Views, not copies. A map is 73 to 93 MiB, so copying each block doubles what the tab
     holds and the format's alignment exists to make this legal. */
  it("reads the vertex blocks as views onto the buffer that arrived", () => {
    const bytes = write({ uv1: true });
    const map = readMapBuffer(bytes);

    expect(map.positions.buffer).toBe(bytes);
    expect(map.normals.buffer).toBe(bytes);
    expect(map.uv0.buffer).toBe(bytes);
    expect(map.uv1?.buffer).toBe(bytes);
    expect(map.indices.buffer).toBe(bytes);
  });

  it("unpacks a mesh's visibility, quality and flags out of one word", () => {
    const map = simple({
      meshes: [
        {
          visibility: 0b1000_0001,
          quality: 0x1f,
          flags: MESH_FLAG.cullDisabled | MESH_FLAG.regionAnchored,
          firstSubmesh: 0,
          submeshCount: 1,
        },
      ],
    });

    expect(map.meshes[0]).toMatchObject({
      visibility: 0b1000_0001,
      quality: 0x1f,
      flags: MESH_FLAG.cullDisabled | MESH_FLAG.regionAnchored,
    });
  });

  it("reads a mesh's bounds", () => {
    const map = simple();

    expect(map.meshes[0]?.min).toEqual([-1, -1, -1]);
    expect(map.meshes[0]?.max).toEqual([1, 1, 1]);
  });

  it("reads a submesh's run and its material", () => {
    const map = simple({
      submeshes: [
        { startIndex: 0, indexCount: 3, material: 1 },
        { startIndex: 3, indexCount: 6, material: 0 },
      ],
      meshes: [{ visibility: 1, firstSubmesh: 0, submeshCount: 2 }],
      materials: ["first", "second"],
    });

    expect(map.submeshes).toEqual([
      { startIndex: 0, indexCount: 3, material: 1 },
      { startIndex: 3, indexCount: 6, material: 0 },
    ]);
  });
});

describe("drawnMeshes", () => {
  const map = simple({
    meshes: [
      { visibility: 0b0000_0001, firstSubmesh: 0, submeshCount: 1 },
      { visibility: 0b0000_1000, firstSubmesh: 1, submeshCount: 1 },
      { visibility: 0b1111_1111, firstSubmesh: 2, submeshCount: 1 },
    ],
    submeshes: [
      { startIndex: 0, indexCount: 3, material: 0 },
      { startIndex: 0, indexCount: 3, material: 0 },
      { startIndex: 0, indexCount: 3, material: 0 },
    ],
  });

  it("keeps the meshes whose mask shares a bit with the flags", () => {
    expect(drawnMeshes(map, 0b0000_0001).map((mesh) => mesh.firstSubmesh)).toEqual([0, 2]);
    expect(drawnMeshes(map, 0b0000_1000).map((mesh) => mesh.firstSubmesh)).toEqual([1, 2]);
  });

  it("draws only the mesh present in every layer where no other one is", () => {
    expect(drawnMeshes(map, 0b1000_0000).map((mesh) => mesh.firstSubmesh)).toEqual([2]);
  });

  it("stacks the variants of two layers turned on together", () => {
    expect(drawnMeshes(map, 0b0000_1001).map((mesh) => mesh.firstSubmesh)).toEqual([0, 1, 2]);
  });

  it("draws nothing with every flag off", () => {
    expect(drawnMeshes(map, 0)).toEqual([]);
  });
});

/** A map of one mesh per mask, each drawing `triangles` triangles. */
function layered(meshes: { visibility: number; triangles: number }[]): MapGeometry {
  let start = 0;
  return simple({
    meshes: meshes.map((mesh, at) => ({
      visibility: mesh.visibility,
      firstSubmesh: at,
      submeshCount: 1,
    })),
    submeshes: meshes.map((mesh) => {
      const run = { startIndex: start, indexCount: mesh.triangles * 3, material: 0 };
      start += run.indexCount;
      return run;
    }),
  });
}

describe("mapLayers", () => {
  it("lists only the layers a mesh names, counting shared meshes on each", () => {
    const map = layered([
      { visibility: 0b0000_0100, triangles: 10 },
      { visibility: 0b0100_0100, triangles: 5 },
    ]);

    expect(mapLayers(map)).toEqual([
      { index: 2, triangles: 15 },
      { index: 6, triangles: 5 },
    ]);
  });

  it("lists nothing for a map whose meshes are on no layer", () => {
    expect(mapLayers(layered([{ visibility: 0, triangles: 4 }]))).toEqual([]);
  });
});

describe("openingFlags", () => {
  it("opens on layer 0 while it draws half the map", () => {
    const map = layered([
      { visibility: 0b0000_0001, triangles: 250 },
      { visibility: 0b0000_1000, triangles: 180 },
      { visibility: 0b1111_1111, triangles: 80 },
    ]);

    expect(openingFlags(map)).toBe(0b0000_0001);
  });

  /* A TFT board: two variants of the board on two layers, and layer 0 reached only by
     what every layer shares. */
  it("opens on the fullest layer where layer 0 draws under half the map", () => {
    const map = layered([
      { visibility: 0b0000_1000, triangles: 5860 },
      { visibility: 0b0100_0000, triangles: 5995 },
      { visibility: 0b1111_1111, triangles: 8 },
    ]);

    expect(openingFlags(map)).toBe(0b0100_0000);
  });

  it("takes the lower layer of two that draw alike", () => {
    const map = layered([
      { visibility: 0b0000_0100, triangles: 100 },
      { visibility: 0b0000_1000, triangles: 100 },
    ]);

    expect(openingFlags(map)).toBe(0b0000_0100);
  });

  it("opens on nothing where no mesh is on a layer", () => {
    expect(openingFlags(layered([{ visibility: 0, triangles: 3 }]))).toBe(0);
  });
});

describe("mapOrigin", () => {
  /** Terrain, a canopy over it, and far scenery, as the three things a median sees. */
  function written(): MapGeometry {
    const points: number[] = [];
    /* Ten sampled terrain vertices, spread over ten units so the median is a real pick. */
    for (let at = 0; at < 90; at += 1) points.push(1000 + (at % 10), 50, 1000 + (at % 10));
    for (let at = 0; at < 9; at += 1) points.push(1005, 900, 1005);
    for (let at = 0; at < 9; at += 1) points.push(30_000, 900, 30_000);

    const positions = Float32Array.from(points);
    const count = positions.length / 3;
    return {
      positions,
      normals: new Float32Array(count * 3),
      uv0: new Float32Array(count * 2),
      uv1: null,
      indices: Uint32Array.from({ length: count }, (_, at) => at),
      meshes: [
        {
          min: [0, 0, 0],
          max: [0, 0, 0],
          visibility: 1,
          quality: 31,
          flags: 0,
          firstSubmesh: 0,
          submeshCount: 1,
        },
      ],
      submeshes: [{ startIndex: 0, indexCount: count, material: 0 }],
      materials: ["one"],
    };
  }

  it("stands on the dense ground rather than in the middle of the box", () => {
    const origin = mapOrigin(written(), 0b0000_0001);

    /* The box runs out to 30,000, so its own middle would be 15,500. */
    expect(origin?.[0]).toBeCloseTo(1005);
    expect(origin?.[2]).toBeCloseTo(1005);
  });

  it("takes the height from the terrain under the spot and not from the canopy over it", () => {
    expect(mapOrigin(written(), 0b0000_0001)?.[1]).toBe(50);
  });

  it("stands nowhere on flags that draw nothing", () => {
    expect(mapOrigin(written(), 0b0000_1000)).toBeNull();
  });
});
