import { useEffect, useLayoutEffect, useMemo } from "react";
import { type Color, Matrix4, type Skeleton, SkinnedMesh } from "three";

import type { MeshRange } from "../../assets/parsing/meshBuffer";
import { createEdgeMaterial, type Edges } from "../../scene/utils/viewMode";

/**
 * The skin's triangle edges, and null where the view draws none.
 *
 * A second mesh on the same geometry and skeleton, so the edges follow the pose. The skin
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
    if (drawnEdges === "none") return null;

    const shown = createEdgeMaterial(colour, drawnEdges);
    const held: SkinnedMesh = new SkinnedMesh(skinned.geometry, shown);
    held.frustumCulled = false;
    held.bind(skeleton, new Matrix4());
    return { mesh: held, shown, skipped: shown.clone() };
  }, [skinned, skeleton, drawnEdges, colour]);

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
      edges?.shown.dispose();
      edges?.skipped.dispose();
    },
    [edges],
  );

  return edges?.mesh ?? null;
}
