/**
 * The map buffer the `ltk-asset` scheme answers `?as=map` with.
 *
 * The layout is `crates/ltk-manager-core/src/preview/map.rs`'s module doc, and this is
 * the other half of it. The vertex blocks are read as views rather than copies, which is
 * what the format's four-byte alignment is for: a map is 73 to 93 MiB and copying it
 * doubles what the tab holds.
 */

import { BufferReader } from "../utils/bufferReader";

/** `LTKM`, the word a map buffer opens with. */
const MAGIC = 0x4d4b544c;

/** The layouts this build reads. */
const VERSIONS: readonly number[] = [1];

/** What the flags word says the buffer carries past its `uv0` block. */
const FLAG = { uv1: 1 } as const;

/** What a mesh's own flags byte says about how it is drawn and placed. */
export const MESH_FLAG = {
  /** The game draws it without backface culling. */
  cullDisabled: 1,
  /**
   * The game places it through a map region rather than at the world origin.
   *
   * The backdrop draws no placeables, so such a mesh sits where its own transform put it
   * rather than where the game would. 13 of Summoner's Rift's 586.
   */
  regionAnchored: 2,
} as const;

/** One drawable object of a map, and the fields a viewport filters it by. */
export interface MapMesh {
  /** World-space bounds of this mesh's own baked vertices. */
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  /** The layer mask, one bit per visibility layer. */
  readonly visibility: number;
  /** Carried and unread: every Summoner's Rift mesh is at every quality. */
  readonly quality: number;
  /** [`MESH_FLAG`] bits. */
  readonly flags: number;
  readonly firstSubmesh: number;
  readonly submeshCount: number;
}

/** One run of the index block, drawn with one material. */
export interface MapSubmesh {
  readonly startIndex: number;
  readonly indexCount: number;
  /** Into [`MapGeometry.materials`]. */
  readonly material: number;
}

/** One whole map, in the engine's own space and units. */
export interface MapGeometry {
  /** Three per vertex, world space, each mesh's transform already applied. */
  readonly positions: Float32Array;
  /** Three per vertex. */
  readonly normals: Float32Array;
  /** Two per vertex. */
  readonly uv0: Float32Array;
  /** Two per vertex, and null for a map carrying no lightmap channel. */
  readonly uv1: Float32Array | null;
  /** Absolute into the flat vertex list. */
  readonly indices: Uint32Array;
  readonly meshes: readonly MapMesh[];
  /** Ordered by mesh, so a mesh names a run of them. */
  readonly submeshes: readonly MapSubmesh[];
  /** Each material once, as the entry path of a `StaticMaterialDef`. */
  readonly materials: readonly string[];
}

/** How many visibility layers a mask names, one bit each. */
const LAYER_COUNT = 8;

/** One visibility layer some mesh of a map names, and what turning it on draws. */
export interface MapLayer {
  /** The layer's bit in a mask. */
  readonly index: number;
  /** Every triangle of the meshes whose mask carries the layer, shared ones included. */
  readonly triangles: number;
}

/**
 * The meshes an active set of visibility `flags` draws: those whose mask shares a bit with it.
 *
 * `flags` is a mask like a mesh's own, so two variants on at once stack, as they would in
 * the engine.
 */
export function drawnMeshes(map: MapGeometry, flags: number): MapMesh[] {
  return map.meshes.filter((mesh) => (mesh.visibility & flags) !== 0);
}

/** Every visibility layer a mesh of `map` names, in bit order. */
export function mapLayers(map: MapGeometry): MapLayer[] {
  const triangles = new Array<number>(LAYER_COUNT).fill(0);
  let named = 0;
  for (const mesh of map.meshes) {
    named |= mesh.visibility;
    const drawn = meshTriangles(map, mesh);
    for (let index = 0; index < LAYER_COUNT; index += 1) {
      if ((mesh.visibility & (1 << index)) !== 0) triangles[index] += drawn;
    }
  }
  return triangles.flatMap((count, index) =>
    (named & (1 << index)) === 0 ? [] : [{ index, triangles: count }],
  );
}

/**
 * The flags a map opens on: layer 0 while it draws half the map, else the fullest layer.
 *
 * Per ADR-0045. Zero for a map with no mesh on any layer.
 */
export function openingFlags(map: MapGeometry): number {
  const layers = mapLayers(map);
  const total = map.meshes.reduce((sum, mesh) => sum + meshTriangles(map, mesh), 0);
  const base = layers.find((layer) => layer.index === 0);
  if (base !== undefined && base.triangles * 2 >= total) return 1;
  const fullest = layers.reduce<MapLayer | null>(
    (best, layer) => (best === null || layer.triangles > best.triangles ? layer : best),
    null,
  );
  return fullest === null ? 0 : 1 << fullest.index;
}

/** How many triangles `mesh`'s submeshes draw. */
function meshTriangles(map: MapGeometry, mesh: MapMesh): number {
  let indices = 0;
  for (let at = 0; at < mesh.submeshCount; at += 1) {
    indices += map.submeshes[mesh.firstSubmesh + at]?.indexCount ?? 0;
  }
  return Math.floor(indices / 3);
}

/**
 * How many indices of the drawn runs are stepped over between samples.
 *
 * Nine is one vertex of every third triangle, which leaves Summoner's Rift around 20,000
 * points to take a median of rather than 183,000.
 */
const SAMPLE_STRIDE = 9;

/**
 * How wide a circle the ground height is read over, in engine units.
 *
 * Two champion heights. On open ground it holds terrain alone, and under a canopy it
 * still holds far more terrain than leaves, which is what the median needs.
 */
const GROUND_RADIUS = 400;

/**
 * Where a subject stands on a map before anyone moves it.
 *
 * The median of the drawn geometry on each axis, rather than the middle of its bounding
 * box. A map draws far scenery tens of thousands of units past the ground a game is
 * played on, which drags a box's middle, and a mean with it, off the playable area
 * entirely. A median follows where the geometry is dense instead.
 *
 * The height is the median of the points standing within [`GROUND_RADIUS`] of that spot,
 * so neither a canopy above nor the skirt hanging under the terrain moves it. Null where
 * the flags draw nothing.
 */
export function mapOrigin(map: MapGeometry, flags: number): [number, number, number] | null {
  const points = drawnPoints(map, flags);
  const count = points.length / 3;
  if (count === 0) return null;

  const held = new Float64Array(count);
  const middle = (axis: number) => {
    for (let at = 0; at < count; at += 1) held[at] = points[at * 3 + axis];
    return median(held);
  };
  const x = middle(0);
  const z = middle(2);

  const reach = GROUND_RADIUS * GROUND_RADIUS;
  const near: number[] = [];
  for (let at = 0; at < count; at += 1) {
    const dx = points[at * 3] - x;
    const dz = points[at * 3 + 2] - z;
    if (dx * dx + dz * dz <= reach) near.push(points[at * 3 + 1]);
  }
  return [x, near.length === 0 ? middle(1) : median(Float64Array.from(near)), z];
}

/** The middle value of `values`, which are sorted in place to find it. */
function median(values: Float64Array): number {
  values.sort();
  return values[values.length >> 1];
}

/** Every [`SAMPLE_STRIDE`]th vertex of what `flags` draw, as flat triples. */
function drawnPoints(map: MapGeometry, flags: number): number[] {
  const points: number[] = [];
  for (const mesh of drawnMeshes(map, flags)) {
    for (let at = 0; at < mesh.submeshCount; at += 1) {
      const run = map.submeshes[mesh.firstSubmesh + at];
      if (run === undefined) continue;
      const end = Math.min(run.startIndex + run.indexCount, map.indices.length);
      for (let index = run.startIndex; index < end; index += SAMPLE_STRIDE) {
        const vertex = map.indices[index] * 3;
        points.push(map.positions[vertex], map.positions[vertex + 1], map.positions[vertex + 2]);
      }
    }
  }
  return points;
}

/**
 * One map out of the bytes the scheme answered.
 *
 * # Throws
 *
 * [`BufferError`] where the bytes are not a map buffer of a version this build reads,
 * where the counts reach past the bytes that arrived, or where a block does not start on
 * the four-byte boundary the format promises.
 */
export function readMapBuffer(bytes: ArrayBuffer): MapGeometry {
  const reader = new BufferReader(bytes);
  reader.header(MAGIC, VERSIONS, "map geometry");

  const flags = reader.u32();
  const vertexCount = reader.u32();
  const indexCount = reader.u32();
  const meshCount = reader.u32();
  const submeshCount = reader.u32();

  const positions = reader.floatView(vertexCount * 3);
  const normals = reader.floatView(vertexCount * 3);
  const uv0 = reader.floatView(vertexCount * 2);
  const uv1 = (flags & FLAG.uv1) !== 0 ? reader.floatView(vertexCount * 2) : null;
  const indices = reader.wordView(indexCount);

  const meshes: MapMesh[] = [];
  for (let at = 0; at < meshCount; at += 1) {
    const min = [reader.f32(), reader.f32(), reader.f32()] as const;
    const max = [reader.f32(), reader.f32(), reader.f32()] as const;
    /* One word rather than four byte reads: the encoder writes visibility, quality,
       flags and a zero pad in that order, which little-endian packs low byte first. */
    const packed = reader.u32();
    meshes.push({
      min,
      max,
      visibility: packed & 0xff,
      quality: (packed >>> 8) & 0xff,
      flags: (packed >>> 16) & 0xff,
      firstSubmesh: reader.u32(),
      submeshCount: reader.u32(),
    });
  }

  const submeshes: MapSubmesh[] = [];
  for (let at = 0; at < submeshCount; at += 1) {
    submeshes.push({
      startIndex: reader.u32(),
      indexCount: reader.u32(),
      material: reader.u32(),
    });
  }

  const materialCount = reader.u32();
  const materials: string[] = [];
  for (let at = 0; at < materialCount; at += 1) materials.push(reader.text());

  return { positions, normals, uv0, uv1, indices, meshes, submeshes, materials };
}
