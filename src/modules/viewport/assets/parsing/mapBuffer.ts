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

/** The visibility layer a backdrop draws when nothing else is chosen. */
export const DEFAULT_LAYER = 0;

/**
 * The meshes `layer` draws, which is the filter that stops the map z-fighting itself.
 *
 * Summoner's Rift carries seven small masks that are seven variants of the dragon pit
 * rather than seven regions, so drawing every mask stacks up to seven coincident floors
 * there. Filtering to one layer is a correctness requirement and not a saving.
 */
export function drawnMeshes(map: MapGeometry, layer: number): MapMesh[] {
  const bit = 1 << layer;
  return map.meshes.filter((mesh) => (mesh.visibility & bit) !== 0);
}

/**
 * Where a subject stands on a map before anyone moves it.
 *
 * The middle of the drawn meshes' union box on the flat axes, and the highest triangle
 * over that point on the up axis, so the subject stands on ground rather than in the air
 * above it or inside the terrain below. Null where the layer draws nothing.
 */
export function mapOrigin(map: MapGeometry, layer: number): [number, number, number] | null {
  const drawn = drawnMeshes(map, layer);
  if (drawn.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const mesh of drawn) {
    minX = Math.min(minX, mesh.min[0]);
    maxX = Math.max(maxX, mesh.max[0]);
    minY = Math.min(minY, mesh.min[1]);
    minZ = Math.min(minZ, mesh.min[2]);
    maxZ = Math.max(maxZ, mesh.max[2]);
  }

  const x = (minX + maxX) / 2;
  const z = (minZ + maxZ) / 2;
  return [x, groundAt(map, drawn, x, z) ?? minY, z];
}

/** The highest drawn triangle over `x, z`, and null where none covers the point. */
function groundAt(
  map: MapGeometry,
  drawn: readonly MapMesh[],
  x: number,
  z: number,
): number | null {
  let best: number | null = null;
  for (const mesh of drawn) {
    /* The box filter is what makes this affordable: a map is two million vertices and a
       handful of its meshes stand over any one point. */
    if (x < mesh.min[0] || x > mesh.max[0] || z < mesh.min[2] || z > mesh.max[2]) continue;
    for (let at = 0; at < mesh.submeshCount; at += 1) {
      const run = map.submeshes[mesh.firstSubmesh + at];
      if (run === undefined) continue;
      const end = Math.min(run.startIndex + run.indexCount, map.indices.length);
      for (let index = run.startIndex; index + 2 < end; index += 3) {
        const y = heightIn(map, index, x, z);
        if (y !== null && (best === null || y > best)) best = y;
      }
    }
  }
  return best;
}

/** The triangle's height over `x, z`, and null where the point is outside it. */
function heightIn(map: MapGeometry, index: number, x: number, z: number): number | null {
  const at = map.positions;
  const a = map.indices[index] * 3;
  const b = map.indices[index + 1] * 3;
  const c = map.indices[index + 2] * 3;
  const ax = at[a];
  const az = at[a + 2];
  const bx = at[b];
  const bz = at[b + 2];
  const cx = at[c];
  const cz = at[c + 2];

  const area = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (area === 0) return null;
  const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / area;
  const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / area;
  const w = 1 - u - v;
  if (u < 0 || v < 0 || w < 0) return null;
  return u * at[a + 1] + v * at[b + 1] + w * at[c + 1];
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
