/**
 * The map buffer the `ltk-asset` scheme answers `?as=map` with.
 *
 * The layout is `crates/ltk-manager-assets/src/preview/map.rs`'s module doc, and this is
 * the other half of it. The vertex blocks are read as views rather than copies, which is
 * what the format's four-byte alignment is for: a map is 73 to 93 MiB and copying it
 * doubles what the tab holds.
 */

import type { MapController } from "@/lib/tauri";

import { BufferReader } from "../utils/bufferReader";
import {
  layerVisibility,
  type MapVisibility,
  mapVisibility,
  meshVisible,
} from "../utils/mapVisibility";

/** `LTKM`, the word a map buffer opens with. */
const MAGIC = 0x4d4b544c;

/** The layouts this build reads. */
const VERSIONS: readonly number[] = [3];

/** The lightmap index of a channel a mesh carries no texture for. */
const NO_TEXTURE = 0xffffffff;

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
  /** The layer mask, one bit per visibility layer. It is used only if `controller` is null. */
  readonly visibility: number;
  /**
   * The path hash of the mesh's visibility controller, as `0x` and eight hex digits. The
   * controller is an object of the map's `.materials.bin`. Null if the mesh has none.
   */
  readonly controller: string | null;
  /** Carried and unread: every Summoner's Rift mesh is at every quality. */
  readonly quality: number;
  /** [`MESH_FLAG`] bits. */
  readonly flags: number;
  readonly firstSubmesh: number;
  readonly submeshCount: number;
  /** The baked light map the mesh is lit by, and null for a mesh carrying none. */
  readonly bakedLight: MapChannel | null;
  /** The stationary light map the mesh is lit by, and null for a mesh carrying none. */
  readonly stationaryLight: MapChannel | null;
}

/** One texture channel of a mesh, read through `uv1` scaled and offset. */
export interface MapChannel {
  /** The texture's path, as the file spells it. */
  readonly texture: string;
  readonly scale: readonly [number, number];
  readonly bias: readonly [number, number];
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
  /** Each light map once, as the path a mesh channel names it by. */
  readonly lightmaps: readonly string[];
  /** Each material once, as the entry path of a `StaticMaterialDef`. */
  readonly materials: readonly string[];
}

/** How many visibility layers a mask names, one bit each. */
const LAYER_COUNT = 8;

/** One visibility layer that changes which meshes of a map are drawn. */
export interface MapLayer {
  /** The layer's bit in a mask. */
  readonly index: number;
  /** The number of triangles drawn when this layer is the only active one. */
  readonly triangles: number;
}

const NO_CONTROLLERS: readonly MapController[] = [];

/** The meshes of `map` drawn under `visibility`, per ADR-0064. */
export function drawnMeshes(map: MapGeometry, visibility: MapVisibility): MapMesh[] {
  return map.meshes.filter((mesh) => meshVisible(visibility, mesh.visibility, mesh.controller));
}

/**
 * Every visibility layer that changes which meshes of `map` are drawn, in bit order.
 *
 * `controllers` are the controllers that the map declares. If the list is empty, each
 * mesh is tested by its layer mask, which is how the map is drawn until its model is
 * loaded.
 */
export function mapLayers(
  map: MapGeometry,
  controllers: readonly MapController[] = NO_CONTROLLERS,
): MapLayer[] {
  const unlayered = new Set(drawnMeshes(map, mapVisibility(controllers, 0)));
  const layers: MapLayer[] = [];

  for (let index = 0; index < LAYER_COUNT; index += 1) {
    const drawn = drawnMeshes(map, mapVisibility(controllers, 1 << index));
    const changes = drawn.length !== unlayered.size || drawn.some((mesh) => !unlayered.has(mesh));
    if (!changes) continue;

    layers.push({
      index,
      triangles: drawn.reduce((sum, mesh) => sum + meshTriangles(map, mesh), 0),
    });
  }
  return layers;
}

/**
 * The flags a map opens on: layer 0 while it draws half the map, else the fullest layer.
 *
 * Per ADR-0045. The layer masks alone are used, so the result does not change when the
 * map's controllers are loaded. Zero if no layer changes which meshes are drawn.
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

/** `hash` as `0x` and eight hex digits, the format of `MapParticle.controller`. Null for zero. */
function controllerOf(hash: number): string | null {
  return hash === 0 ? null : `0x${hash.toString(16).padStart(8, "0")}`;
}

/** The meshes of a map that reference one controller. */
export interface ControllerUse {
  /** The number of meshes that reference the controller. */
  readonly meshes: number;
  /** The material path of the first submesh of each such mesh, each path once, in mesh order. */
  readonly materials: readonly string[];
}

/** The meshes of `map` that reference each controller, keyed by controller path hash. */
export function controllerUses(map: MapGeometry): Map<string, ControllerUse> {
  const counted = new Map<string, { meshes: number; materials: Set<string> }>();

  for (const mesh of map.meshes) {
    if (mesh.controller === null) continue;

    const held = counted.get(mesh.controller) ?? { meshes: 0, materials: new Set<string>() };
    held.meshes += 1;

    const first = mesh.submeshCount === 0 ? undefined : map.submeshes[mesh.firstSubmesh];
    const material = first === undefined ? undefined : map.materials[first.material];
    if (material !== undefined) held.materials.add(material);

    counted.set(mesh.controller, held);
  }

  return new Map(
    [...counted].map(([hash, { meshes, materials }]) => [
      hash,
      { meshes, materials: [...materials] },
    ]),
  );
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
 * so neither a canopy above nor the skirt hanging under the terrain moves it. The layer
 * masks alone are used, as in [`openingFlags`]. Null if no mesh is drawn under `flags`.
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
  for (const mesh of drawnMeshes(map, layerVisibility(flags))) {
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

  const records: Omit<MapMesh, "bakedLight" | "stationaryLight">[] = [];
  for (let at = 0; at < meshCount; at += 1) {
    const min = [reader.f32(), reader.f32(), reader.f32()] as const;
    const max = [reader.f32(), reader.f32(), reader.f32()] as const;
    /* One word rather than four byte reads: the encoder writes visibility, quality,
       flags and a zero pad in that order, which little-endian packs low byte first. */
    const packed = reader.u32();
    records.push({
      min,
      max,
      visibility: packed & 0xff,
      quality: (packed >>> 8) & 0xff,
      flags: (packed >>> 16) & 0xff,
      firstSubmesh: reader.u32(),
      submeshCount: reader.u32(),
      controller: controllerOf(reader.u32()),
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

  /* Read as indices here and named once the lightmaps table has arrived after them. */
  const lights: [number, number, number, number, number][][] = [];
  for (let at = 0; at < meshCount; at += 1) {
    const channel = (): [number, number, number, number, number] => [
      reader.u32(),
      reader.f32(),
      reader.f32(),
      reader.f32(),
      reader.f32(),
    ];
    lights.push([channel(), channel()]);
  }

  const materialCount = reader.u32();
  const materials: string[] = [];
  for (let at = 0; at < materialCount; at += 1) materials.push(reader.text());
  const lightmapCount = reader.u32();
  const lightmaps: string[] = [];
  for (let at = 0; at < lightmapCount; at += 1) lightmaps.push(reader.text());

  const channelOf = ([index, sx, sy, bx, by]: (typeof lights)[number][number]) => {
    const texture = index === NO_TEXTURE ? undefined : lightmaps[index];
    if (texture === undefined) return null;
    return { texture, scale: [sx, sy] as const, bias: [bx, by] as const };
  };
  const meshes: MapMesh[] = records.map((record, at) => ({
    ...record,
    bakedLight: channelOf(lights[at]?.[0] ?? [NO_TEXTURE, 1, 1, 0, 0]),
    stationaryLight: channelOf(lights[at]?.[1] ?? [NO_TEXTURE, 1, 1, 0, 0]),
  }));

  return { positions, normals, uv0, uv1, indices, meshes, submeshes, lightmaps, materials };
}
