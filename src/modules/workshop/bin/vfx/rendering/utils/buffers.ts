import {
  BufferAttribute,
  type BufferGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  type InterleavedBuffer,
  InterleavedBufferAttribute,
} from "three";

import type { MeshPose } from "./meshPose";

/** How many particles one emitter's buffers hold, which caps its share of the pool. */
export const QUADS_PER_EMITTER = 4096;

/**
 * Where each instanced attribute of a quad starts in its interleaved row, and how many floats it
 * takes. The rows of one emitter are one buffer, so a frame uploads one range rather than one per
 * attribute.
 */
export const QUAD_LAYOUT = {
  center: [0, 3],
  size: [3, 3],
  color: [6, 4],
  roll: [10, 1],
  basisX: [11, 3],
  basisY: [14, 3],
  basisZ: [17, 3],
  uvTurn: [20, 3],
  uvShift: [23, 4],
  uvTurnMult: [27, 3],
  uvShiftMult: [30, 4],
  lookup: [34, 3],
} as const satisfies Record<string, readonly [number, number]>;

/** The floats one quad's row takes. */
export const QUAD_STRIDE = 37;

/** The instanced attributes one quad carries, each a view into the row written once per frame. */
export interface QuadBuffers {
  readonly geometry: InstancedBufferGeometry;
  /** Every quad's row, `QUAD_STRIDE` floats in the `QUAD_LAYOUT` order. */
  readonly rows: InstancedInterleavedBuffer;
  /** Three per quad, in the viewport's own space. */
  readonly center: InterleavedBufferAttribute;
  /**
   * Three per quad: `scale0` as drawn. A quad expands its corners by half of the first
   * two, and a ray lays the second along its axis past the third.
   */
  readonly size: InterleavedBufferAttribute;
  /** Four per quad, straight multiplied onto the texture's sample. */
  readonly color: InterleavedBufferAttribute;
  /** One per quad: the radians a camera quad or a world-plane quad spins by. */
  readonly roll: InterleavedBufferAttribute;
  /**
   * Three per quad, three of them: the columns of the basis the particle stands on, as
   * the viewport sees it, which an arbitrary quad spans and a ray lies along.
   */
  readonly basisX: InterleavedBufferAttribute;
  readonly basisY: InterleavedBufferAttribute;
  readonly basisZ: InterleavedBufferAttribute;
  /** Three per quad: the angle and the two scales of the base layer's transform. */
  readonly uvTurn: InterleavedBufferAttribute;
  /** Four per quad: the base layer's scroll, and where its cell starts. */
  readonly uvShift: InterleavedBufferAttribute;
  /** The same pair again, for `textureMult`. */
  readonly uvTurnMult: InterleavedBufferAttribute;
  readonly uvShiftMult: InterleavedBufferAttribute;
  /**
   * Three per quad: where the colour ramp is read, in texture space, and in the third
   * lane the erosion drive, the map value its kept band opens at.
   *
   * Packed together because a vertex shader is allowed sixteen attributes and the
   * three the renderer declares count against them.
   */
  readonly lookup: InterleavedBufferAttribute;
}

/**
 * The geometry one emitter draws its quads from.
 *
 * One unit quad, expanded per instance in the vertex shader, so a frame writes one row of
 * floats per particle rather than a matrix.
 */
export function quadBuffers(capacity: number): QuadBuffers {
  const geometry = new InstancedBufferGeometry();
  /* The corners are the same four for every quad, so they are a plain attribute and only
     the rows below are instanced. */
  geometry.setAttribute("corner", new BufferAttribute(CORNERS, 2));
  /* three counts a wireframe's edges off `position`, which the shader never reads, so four
     empty vertices are what lets `wireMaterial` draw a quad at all. */
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array((CORNERS.length / 2) * 3), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const rows = new InstancedInterleavedBuffer(
    new Float32Array(capacity * QUAD_STRIDE),
    QUAD_STRIDE,
  );
  rows.setUsage(DynamicDrawUsage);
  const view = ([offset, size]: readonly [number, number]) =>
    new InterleavedBufferAttribute(rows, size, offset);
  const attributes = {
    center: view(QUAD_LAYOUT.center),
    size: view(QUAD_LAYOUT.size),
    color: view(QUAD_LAYOUT.color),
    roll: view(QUAD_LAYOUT.roll),
    basisX: view(QUAD_LAYOUT.basisX),
    basisY: view(QUAD_LAYOUT.basisY),
    basisZ: view(QUAD_LAYOUT.basisZ),
    uvTurn: view(QUAD_LAYOUT.uvTurn),
    uvShift: view(QUAD_LAYOUT.uvShift),
    uvTurnMult: view(QUAD_LAYOUT.uvTurnMult),
    uvShiftMult: view(QUAD_LAYOUT.uvShiftMult),
    lookup: view(QUAD_LAYOUT.lookup),
  };
  for (const [name, attribute] of Object.entries(attributes)) {
    geometry.setAttribute(name, attribute);
  }
  geometry.instanceCount = 0;

  return { geometry, rows, ...attributes };
}

/** The instanced attributes one planar projection's decal carries, each written once per frame. */
export interface ProjectionBuffers {
  readonly geometry: InstancedBufferGeometry;
  /** Three per decal: the particle's centre in the engine's space, before the mirror. */
  readonly center: InstancedBufferAttribute;
  /** Three per decal: the two half-extents and the uv's turn in radians. */
  readonly footprint: InstancedBufferAttribute;
  /** Four per decal, `MODULATE_COLOR`. */
  readonly color: InstancedBufferAttribute;
  /** Two per decal, `COLOR_UV`, where the colour ramp is read. */
  readonly lookup: InstancedBufferAttribute;
}

/** The geometry one emitter draws its decals from, the unit quad expanded per instance. */
export function projectionBuffers(capacity: number): ProjectionBuffers {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("corner", new BufferAttribute(CORNERS, 2));
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array((CORNERS.length / 2) * 3), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const written = {
    center: new InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    footprint: new InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    color: new InstancedBufferAttribute(new Float32Array(capacity * 4), 4),
    lookup: new InstancedBufferAttribute(new Float32Array(capacity * 2), 2),
  };
  for (const [name, attribute] of Object.entries(written)) {
    attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }
  geometry.instanceCount = 0;

  return { geometry, ...written };
}

/** How many meshes one emitter draws, which caps its share of the pool. */
export const MESHES_PER_EMITTER = 512;

/**
 * Where each interleaved attribute of a mesh instance starts in its row, and how many floats it
 * takes. `instanceMatrix` keeps a buffer of its own, which three's `InstancedMesh` reads by index.
 */
export const MESH_LAYOUT = {
  tint: [0, 4],
  lookup: [4, 3],
  uvTurn: [7, 3],
  uvShift: [10, 4],
  uvTurnMult: [14, 3],
  uvShiftMult: [17, 4],
} as const satisfies Record<string, readonly [number, number]>;

/** The floats one mesh instance's row takes. */
export const MESH_STRIDE = 21;

/** The instanced attributes one mesh emitter carries on its geometry, written once per frame. */
export interface MeshBuffers {
  readonly pose?: MeshPose;
  readonly geometry: BufferGeometry;
  /**
   * three reads `instanceMatrix` off the geometry ahead of the mesh's own, so the solid
   * and the twin share one buffer.
   */
  readonly instanceMatrix: InstancedBufferAttribute;
  /** Every instance's row, `MESH_STRIDE` floats in the `MESH_LAYOUT` order. */
  readonly rows: InstancedInterleavedBuffer;
  /** Four per mesh, straight multiplied onto the texture's sample. */
  readonly tint: InterleavedBufferAttribute;
  /**
   * Three per mesh: where the colour ramp is read, which a translated pair reads, and the
   * erosion drive, the map value its kept band opens at.
   */
  readonly lookup: InterleavedBufferAttribute;
  /** The two layers' transforms, as a quad carries them. */
  readonly uvTurn: InterleavedBufferAttribute;
  readonly uvShift: InterleavedBufferAttribute;
  readonly uvTurnMult: InterleavedBufferAttribute;
  readonly uvShiftMult: InterleavedBufferAttribute;
}

/**
 * The per-instance attributes a mesh emitter draws with, placed on its own geometry.
 *
 * Placed where the geometry is built rather than in the component that draws it, because
 * a render is no place to mutate a geometry: a strict-mode render runs a memo twice and
 * keeps the first result, so the attribute the frame loop wrote was not the one the
 * geometry held.
 */
export function meshBuffers(geometry: BufferGeometry): MeshBuffers {
  const count = MESHES_PER_EMITTER;
  const instanceMatrix = new InstancedBufferAttribute(new Float32Array(count * 16), 16);
  instanceMatrix.setUsage(DynamicDrawUsage);
  geometry.setAttribute("instanceMatrix", instanceMatrix);

  const rows = new InstancedInterleavedBuffer(new Float32Array(count * MESH_STRIDE), MESH_STRIDE);
  rows.setUsage(DynamicDrawUsage);
  const view = ([offset, size]: readonly [number, number]) =>
    new InterleavedBufferAttribute(rows, size, offset);
  const attributes = {
    tint: view(MESH_LAYOUT.tint),
    lookup: view(MESH_LAYOUT.lookup),
    uvTurn: view(MESH_LAYOUT.uvTurn),
    uvShift: view(MESH_LAYOUT.uvShift),
    uvTurnMult: view(MESH_LAYOUT.uvTurnMult),
    uvShiftMult: view(MESH_LAYOUT.uvShiftMult),
  };
  for (const [name, attribute] of Object.entries(attributes)) {
    geometry.setAttribute(name, attribute);
  }
  return { geometry, instanceMatrix, rows, ...attributes };
}

/** The first `items` items of `attribute` marked for upload, which is what a frame wrote. */
export function written(attribute: BufferAttribute, items: number): void {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, items * attribute.itemSize);
  attribute.needsUpdate = true;
}

/** Marks the first `rows` rows of `buffer` for upload. */
export function rowsWritten(buffer: InterleavedBuffer, rows: number): void {
  buffer.clearUpdateRanges();
  buffer.addUpdateRange(0, rows * buffer.stride);
  buffer.needsUpdate = true;
}

/** The four corners of the unit quad, each an offset from its centre. */
const CORNERS = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
