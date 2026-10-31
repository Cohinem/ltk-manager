import { useEffect, useLayoutEffect, useMemo } from "react";
import {
  type BufferGeometry,
  type Color,
  type Material,
  Matrix4,
  type Skeleton,
  SkinnedMesh,
} from "three";

import type { MeshRange } from "../../assets/parsing/meshBuffer";
import { createEdgeGeometry, edgeIndexOf } from "../../scene/utils/edgeGeometry";
import { createEdgeMaterial, type Edges } from "../../scene/utils/viewMode";

/** The attributes a skinned line reads. */
const EDGE_ATTRIBUTES = ["position", "normal", "skinIndex", "skinWeight"];

/**
 * A skinned mesh that three draws as line segments.
 *
 * Three skins any object flagged `isSkinnedMesh`, and draws its `isLineSegments` branch from the
 * flags alone. Its only skinned class draws triangles, or a `wireframe` index that three builds
 * itself and that draws every shared edge twice.
 */
class SkinnedEdges extends SkinnedMesh<BufferGeometry, Material | Material[]> {
  constructor(geometry: BufferGeometry, material: Material) {
    super(geometry, material);
    Object.assign(this, { isMesh: false, isLine: true, isLineSegments: true });
  }
}

/**
 * The skin's triangle edges, and null where the view draws none.
 *
 * A second object over the same vertices and skeleton, so the edges follow the pose. The skin
 * hides rather than unmounts, because it parents the bones.
 */
export function useEdgeTwin(
  skinned: SkinnedMesh,
  skeleton: Skeleton,
  ranges: readonly MeshRange[],
  hidden: readonly string[],
  drawnEdges: Edges,
  colour: Color,
): SkinnedMesh | null {
  const edges = useMemo(() => {
    const triangles = skinned.geometry.index?.array;
    if (drawnEdges === "none" || !(triangles instanceof Uint32Array)) return null;

    const built = edgeIndexOf(triangles, skinned.geometry.getAttribute("position").array, ranges);
    const geometry = createEdgeGeometry(skinned.geometry, built, EDGE_ATTRIBUTES);
    ranges.forEach((range, at) => {
      const run = built.ranges.get(range.startIndex);
      if (run !== undefined) geometry.addGroup(run.start, run.count, at);
    });

    const shown = createEdgeMaterial(colour, drawnEdges, built.spacing);
    const held = new SkinnedEdges(geometry, shown);
    held.frustumCulled = false;
    held.bind(skeleton, new Matrix4());
    return { mesh: held, geometry, shown, skipped: shown.clone() };
  }, [skinned, skeleton, ranges, drawnEdges, colour]);

  useLayoutEffect(() => {
    if (edges === null) return;

    const skip = new Set(hidden.map((name) => name.toLowerCase()));
    edges.skipped.visible = false;
    edges.mesh.material = ranges.map((range) =>
      skip.has(range.name.toLowerCase()) ? edges.skipped : edges.shown,
    );
  }, [edges, ranges, hidden]);

  useEffect(
    () => () => {
      edges?.geometry.dispose();
      edges?.shown.dispose();
      edges?.skipped.dispose();
    },
    [edges],
  );

  return edges?.mesh ?? null;
}
