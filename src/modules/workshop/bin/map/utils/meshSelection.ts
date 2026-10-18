import { Box3, Matrix4, type Ray, Vector3 } from "three";

import type { MapGeometryEdit, MapGeometryMesh, MeshTransform } from "@/lib/tauri";
import type { MapGeometry } from "@/modules/viewport";

import type { PlacedItem } from "./mapOutline";
import type { Moved } from "./placeableSpace";

/** What a mesh's selection id starts with, apart from a placeable's `chunk/key`. */
const MESH_PREFIX = "mesh:";

/** The selection id of the mesh at `index` of the `.mapgeo`. */
export function meshId(index: number): string {
  return `${MESH_PREFIX}${index}`;
}

/** The mesh index a selection id names, and null for a placeable's id. */
export function meshIndexOf(id: string): number | null {
  if (!id.startsWith(MESH_PREFIX)) return null;

  const index = Number(id.slice(MESH_PREFIX.length));
  return Number.isInteger(index) ? index : null;
}

/** Where a ray meets a map: the mesh, the point in the engine's space and how far along. */
export interface MeshHit {
  readonly mesh: number;
  readonly point: [number, number, number];
  readonly distance: number;
}

/**
 * The nearest triangle of a shown mesh of `map` that `ray`, in the engine's space, meets, and
 * null if it meets none.
 *
 * A mesh's bounds are tested first, and a mesh whose bounds start past the nearest hit so far
 * is skipped, so a click tests the triangles of the few meshes under it rather than the map's.
 */
export function pickMesh(
  map: MapGeometry,
  ray: Ray,
  shown: (index: number) => boolean,
): MeshHit | null {
  const box = new Box3();
  const enter = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const point = new Vector3();
  let best: MeshHit | null = null;

  map.meshes.forEach((mesh, index) => {
    if (!shown(index)) return;

    box.min.set(...mesh.min);
    box.max.set(...mesh.max);
    if (ray.intersectBox(box, enter) === null) return;
    if (best !== null && ray.origin.distanceTo(enter) > best.distance) return;

    for (let at = mesh.firstSubmesh; at < mesh.firstSubmesh + mesh.submeshCount; at += 1) {
      const run = map.submeshes[at];
      if (run === undefined) continue;

      for (let face = run.startIndex; face + 2 < run.startIndex + run.indexCount; face += 3) {
        a.fromArray(map.positions, (map.indices[face] ?? 0) * 3);
        b.fromArray(map.positions, (map.indices[face + 1] ?? 0) * 3);
        c.fromArray(map.positions, (map.indices[face + 2] ?? 0) * 3);
        if (ray.intersectTriangle(a, b, c, false, point) === null) continue;

        const distance = ray.origin.distanceTo(point);
        if (best === null || distance < best.distance) {
          best = { mesh: index, point: [point.x, point.y, point.z], distance };
        }
      }
    }
  });
  return best;
}

/** The triangles of some meshes of a map, with their own vertices and indices. */
export interface MeshPatch {
  /** Three per vertex, in the engine's space. */
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

/**
 * Copies the triangles that the meshes at `meshes` of `map` draw, with only the vertices they
 * use. A mesh's vertices are one run of the blocks, so each is copied once.
 */
export function meshPatch(map: MapGeometry, meshes: readonly number[]): MeshPatch {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const index of meshes) {
    const mesh = map.meshes[index];
    if (mesh === undefined) continue;

    const runs = map.submeshes.slice(mesh.firstSubmesh, mesh.firstSubmesh + mesh.submeshCount);
    let low = Infinity;
    let high = -Infinity;
    for (const run of runs) {
      for (let at = run.startIndex; at < run.startIndex + run.indexCount; at += 1) {
        const vertex = map.indices[at] ?? 0;
        if (vertex < low) low = vertex;
        if (vertex > high) high = vertex;
      }
    }
    if (low > high) continue;

    const base = positions.length / 3;
    for (let vertex = low; vertex <= high; vertex += 1) {
      positions.push(
        map.positions[vertex * 3] ?? 0,
        map.positions[vertex * 3 + 1] ?? 0,
        map.positions[vertex * 3 + 2] ?? 0,
      );
    }
    for (const run of runs) {
      for (let at = run.startIndex; at < run.startIndex + run.indexCount; at += 1) {
        indices.push((map.indices[at] ?? 0) - low + base);
      }
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/**
 * The change a drag makes to the lead of `meshes`, in the engine's space, which moves every
 * selected mesh the same way. Identity outside a drag.
 */
export function dragDelta(
  meshes: readonly MapGeometryMesh[],
  dragged: ReadonlyMap<string, readonly (number | null)[]> | null,
): Matrix4 {
  const lead = meshes[0];
  const moved = lead === undefined ? undefined : dragged?.get(meshId(lead.index));
  if (lead === undefined || moved === undefined) return new Matrix4();

  return new Matrix4()
    .fromArray(moved.map((cell) => cell ?? 0))
    .multiply(new Matrix4().fromArray(lead.transform.map((cell) => cell ?? 0)).invert());
}

/**
 * The middle of a selection: the mean of each placeable's position and each mesh's bounds
 * middle, in the engine's space, and null for an empty selection.
 */
export function selectionMiddle(
  placeables: readonly PlacedItem[],
  meshes: readonly MapGeometryMesh[],
): [number, number, number] | null {
  const points = [
    ...placeables.map(({ item }) => item.position.map((cell) => cell ?? 0)),
    ...meshes.map((mesh) =>
      [0, 1, 2].map((axis) => ((mesh.min[axis] ?? 0) + (mesh.max[axis] ?? 0)) / 2),
    ),
  ];
  if (points.length === 0) return null;

  const middle: [number, number, number] = [0, 0, 0];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      middle[axis] = (middle[axis] ?? 0) + (point[axis] ?? 0) / points.length;
    }
  }
  return middle;
}

/** `mesh`'s transform moved to the middle of its bounds, where the gizmo stands for it. */
export function meshAnchor(mesh: MapGeometryMesh): number[] {
  const anchor = mesh.transform.map((cell) => cell ?? 0);
  for (let axis = 0; axis < 3; axis += 1) {
    anchor[12 + axis] = ((mesh.min[axis] ?? 0) + (mesh.max[axis] ?? 0)) / 2;
  }
  return anchor;
}

/** The edit that sets the transforms of the meshes among `moved`, and null if there are none. */
export function meshTransformEdit(moved: readonly Moved[]): MapGeometryEdit | null {
  const meshes = moved.flatMap(({ id, transform }): MeshTransform[] => {
    const mesh = meshIndexOf(id);
    return mesh === null ? [] : [{ mesh, transform: transform as MeshTransform["transform"] }];
  });
  return meshes.length === 0 ? null : { kind: "transform", meshes };
}
