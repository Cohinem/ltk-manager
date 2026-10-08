import type { Box3, Frustum, Vector3 } from "three";

/** One run of the index block and the index of the material that draws it. */
export interface DrawGroup {
  readonly startIndex: number;
  readonly indexCount: number;
  readonly material: number;
}

/** The draw groups of one map mesh, and the box that holds its vertices. */
export interface MeshRun {
  /** The bounds of the mesh in the space of the map's geometry. */
  readonly box: Box3;
  readonly groups: readonly DrawGroup[];
  /** The distance from the eye to `box` at the last [`runsInView`] call. Scratch, not state. */
  depth: number;
}

/**
 * The runs of `runs` whose box is in `frustum`, nearest to `eye` first, written into `out`.
 *
 * `frustum` and `eye` are in the space of the map's geometry. Drawing the nearest mesh
 * first lets the depth test reject the pixels of the meshes behind it before they are
 * shaded. Runs at the same distance keep their order in `runs`.
 */
export function runsInView(
  runs: readonly MeshRun[],
  frustum: Frustum,
  eye: Vector3,
  out: MeshRun[],
): MeshRun[] {
  out.length = 0;
  for (const run of runs) {
    if (!frustum.intersectsBox(run.box)) continue;

    run.depth = run.box.distanceToPoint(eye);
    out.push(run);
  }
  return out.sort(nearestFirst);
}

function nearestFirst(left: MeshRun, right: MeshRun): number {
  return left.depth - right.depth;
}
