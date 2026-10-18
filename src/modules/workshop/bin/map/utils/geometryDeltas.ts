import { Matrix3, Matrix4, Vector3 } from "three";

import type { MeshDelta } from "@/lib/tauri";
import { type MapGeometry, type MapMesh, type MapSubmesh, MESH_FLAG } from "@/modules/viewport";

import { meshId, meshIndexOf } from "./meshSelection";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** The meshes listed in insert order, which an insert delta takes its vertices from. */
export function insertedMeshes(deltas: readonly MeshDelta[]): number[] {
  return deltas.flatMap((delta) => (delta.kind === "insert" ? [delta.mesh] : []));
}

/**
 * Returns `map` with `deltas` applied in order, without changing `map`.
 *
 * A removed mesh leaves its vertices in the blocks, unread. An inserted mesh takes the next
 * mesh of `inserted`, the buffer of every inserted mesh in insert order, and appends its
 * vertices. An update moves the mesh's own vertices by the change of its transform and takes
 * its flags and materials from the record. The result matches the buffer the backend would
 * encode for the edited map, up to float rounding.
 */
export function applyMeshDeltas(
  map: MapGeometry,
  deltas: readonly MeshDelta[],
  inserted: MapGeometry | null,
): MapGeometry {
  const out: Mutable<MapGeometry> = { ...map };
  const meshes: Mutable<MapMesh>[] = map.meshes.map((mesh) => ({ ...mesh }));
  const submeshes: MapSubmesh[] = [...map.submeshes];
  const materials = [...map.materials];
  const lightmaps = [...map.lightmaps];
  let copied = false;
  let next = 0;

  const materialIndex = (path: string) => {
    const at = materials.indexOf(path);
    if (at >= 0) return at;
    materials.push(path);
    return materials.length - 1;
  };
  const shiftRuns = (after: number, by: number) => {
    for (const mesh of meshes) {
      if (mesh.firstSubmesh >= after) mesh.firstSubmesh += by;
    }
  };

  for (const delta of deltas) {
    if (delta.kind === "remove") {
      const mesh = meshes[delta.mesh];
      if (mesh === undefined) continue;

      submeshes.splice(mesh.firstSubmesh, mesh.submeshCount);
      meshes.splice(delta.mesh, 1);
      shiftRuns(mesh.firstSubmesh, -mesh.submeshCount);
    } else if (delta.kind === "insert") {
      const source = inserted?.meshes[next];
      if (inserted === null || source === undefined) continue;

      const appended = appendBlocks(out, inserted, next);
      next += 1;
      const runs = inserted.submeshes
        .slice(source.firstSubmesh, source.firstSubmesh + source.submeshCount)
        .map((submesh) => ({
          startIndex: submesh.startIndex - appended.indexShift,
          indexCount: submesh.indexCount,
          material: materialIndex(inserted.materials[submesh.material] ?? ""),
        }));
      const at = meshes[delta.mesh]?.firstSubmesh ?? submeshes.length;
      shiftRuns(at, runs.length);
      submeshes.splice(at, 0, ...runs);
      meshes.splice(delta.mesh, 0, { ...source, firstSubmesh: at });
      for (const channel of [source.bakedLight, source.stationaryLight]) {
        if (channel !== null && !lightmaps.includes(channel.texture)) {
          lightmaps.push(channel.texture);
        }
      }
    } else {
      const mesh = meshes[delta.mesh];
      if (mesh === undefined) continue;

      const { record } = delta;
      if (!sameCells(delta.from, record.transform)) {
        if (!copied) {
          out.positions = out.positions.slice();
          out.normals = out.normals.slice();
          copied = true;
        }
        const bounds = moveVertices(out, submeshes, mesh, delta.from, record.transform);
        if (bounds !== null) {
          mesh.min = bounds.min;
          mesh.max = bounds.max;
        }
      }

      mesh.visibility = record.visibility;
      mesh.quality = record.quality;
      mesh.controller = record.controller;
      mesh.flags =
        (record.backfaceCullingDisabled ? MESH_FLAG.cullDisabled : 0) |
        (record.region === null ? 0 : MESH_FLAG.regionAnchored);
      record.materials.forEach((material, at) => {
        const submesh = submeshes[mesh.firstSubmesh + at];
        if (submesh !== undefined) {
          submeshes[mesh.firstSubmesh + at] = { ...submesh, material: materialIndex(material) };
        }
      });
    }
  }

  out.meshes = meshes;
  out.submeshes = submeshes;
  out.materials = materials;
  out.lightmaps = lightmaps;
  return out;
}

/**
 * Appends the vertices and indices of mesh `which` of `inserted` to the blocks of `out`, and
 * returns how far its index runs move back from where they stand in `inserted`.
 */
function appendBlocks(
  out: Mutable<MapGeometry>,
  inserted: MapGeometry,
  which: number,
): { indexShift: number } {
  const source = inserted.meshes[which];
  if (source === undefined) return { indexShift: 0 };

  const runs = inserted.submeshes.slice(
    source.firstSubmesh,
    source.firstSubmesh + source.submeshCount,
  );
  const first = Math.min(...runs.map((run) => run.startIndex));
  const last = Math.max(...runs.map((run) => run.startIndex + run.indexCount));
  const { low, high } = vertexRange(inserted.indices, runs);

  const base = out.positions.length / 3;
  out.positions = concat(out.positions, inserted.positions.subarray(low * 3, high * 3));
  out.normals = concat(out.normals, inserted.normals.subarray(low * 3, high * 3));
  out.uv0 = concat(out.uv0, inserted.uv0.subarray(low * 2, high * 2));
  if (out.uv1 !== null) {
    const uv1 = inserted.uv1?.subarray(low * 2, high * 2) ?? new Float32Array((high - low) * 2);
    out.uv1 = concat(out.uv1, uv1);
  }

  const indexStart = out.indices.length;
  const indices = inserted.indices.subarray(first, last).map((index) => index - low + base);
  out.indices = concatIndices(out.indices, indices);
  return { indexShift: first - indexStart };
}

/** The first and one past the last vertex that `runs` of `indices` draw. */
function vertexRange(
  indices: Uint32Array,
  runs: readonly MapSubmesh[],
): { low: number; high: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const run of runs) {
    for (let at = run.startIndex; at < run.startIndex + run.indexCount; at += 1) {
      const index = indices[at] ?? 0;
      if (index < low) low = index;
      if (index > high) high = index;
    }
  }
  return low === Infinity ? { low: 0, high: 0 } : { low, high: high + 1 };
}

/**
 * Moves the vertices `mesh` draws from `from` to `to`, both column major in the engine's
 * space, and returns their new bounds, or null for a mesh that draws none.
 */
function moveVertices(
  map: Mutable<MapGeometry>,
  submeshes: readonly MapSubmesh[],
  mesh: MapMesh,
  from: readonly (number | null)[],
  to: readonly (number | null)[],
): { min: [number, number, number]; max: [number, number, number] } | null {
  const runs = submeshes.slice(mesh.firstSubmesh, mesh.firstSubmesh + mesh.submeshCount);
  const { low, high } = vertexRange(map.indices, runs);
  if (high <= low) return null;

  const delta = new Matrix4()
    .fromArray(to.map((cell) => cell ?? 0))
    .multiply(new Matrix4().fromArray(from.map((cell) => cell ?? 0)).invert());
  const normal = new Matrix3().getNormalMatrix(delta);
  const point = new Vector3();
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let vertex = low; vertex < high; vertex += 1) {
    const at = vertex * 3;
    point.fromArray(map.positions, at).applyMatrix4(delta).toArray(map.positions, at);
    for (let axis = 0; axis < 3; axis += 1) {
      const value = map.positions[at + axis] ?? 0;
      if (value < (min[axis] ?? 0)) min[axis] = value;
      if (value > (max[axis] ?? 0)) max[axis] = value;
    }
    point.fromArray(map.normals, at).applyMatrix3(normal).normalize().toArray(map.normals, at);
  }
  return { min, max };
}

function sameCells(a: readonly (number | null)[], b: readonly (number | null)[]): boolean {
  return a.length === b.length && a.every((cell, at) => cell === b[at]);
}

function concat(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function concatIndices(a: Uint32Array, b: Uint32Array): Uint32Array {
  const out = new Uint32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/**
 * Returns `ids` with each mesh id moved the way `deltas` move the meshes: a removed mesh's id
 * dropped and the ids after it moved down, and the ids from an inserted mesh on moved up.
 * A placeable's id stays.
 */
export function shiftMeshIds(ids: ReadonlySet<string>, deltas: readonly MeshDelta[]): Set<string> {
  let held = new Set(ids);
  for (const delta of deltas) {
    if (delta.kind === "update") continue;

    const next = new Set<string>();
    for (const id of held) {
      const index = meshIndexOf(id);
      if (index === null) {
        next.add(id);
      } else if (delta.kind === "remove") {
        if (index !== delta.mesh) next.add(meshId(index > delta.mesh ? index - 1 : index));
      } else {
        next.add(meshId(index >= delta.mesh ? index + 1 : index));
      }
    }
    held = next;
  }
  return held;
}
