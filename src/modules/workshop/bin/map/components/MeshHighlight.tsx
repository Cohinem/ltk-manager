import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicMaterial } from "three";

import { useDisposable } from "@/hooks";
import type { MapGeometryMesh } from "@/lib/tauri";
import { AXIS_SIGN, type MapGeometry, type SceneColors } from "@/modules/viewport";

import type { DraggedTransforms } from "../state/mapScene";
import { dragDelta, meshPatch } from "../utils/meshSelection";

/** Drawn over the map's own meshes, under the markers. */
const OVER_THE_MAP = 997;

export interface MeshHighlightProps {
  /** The map buffer the backdrop draws, which the highlight copies the triangles of. */
  readonly map: MapGeometry | undefined;
  /** The selected meshes, the lead first. */
  readonly meshes: readonly MapGeometryMesh[];
  readonly dragged: DraggedTransforms | null;
  readonly colors: SceneColors;
}

/**
 * The selected meshes drawn in the selection color: a faint fill where they show, and their
 * wireframe through whatever stands in front of them. During a drag the highlight follows the
 * gizmo, because the drawn map updates only once the edit lands.
 */
export function MeshHighlight({ map, meshes, dragged, colors }: MeshHighlightProps) {
  const indices = useMemo(() => meshes.map((mesh) => mesh.index), [meshes]);
  const geometry = useDisposable(() => {
    const made = new BufferGeometry();
    if (map === undefined) return made;

    const patch = meshPatch(map, indices);
    made.setAttribute("position", new BufferAttribute(patch.positions, 3));
    made.setIndex(new BufferAttribute(patch.indices, 1));
    return made;
  }, [map, indices]);

  const fill = useDisposable(
    () =>
      new MeshBasicMaterial({
        color: colors.gizmo,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [colors.gizmo],
  );
  const wire = useDisposable(
    () =>
      new MeshBasicMaterial({
        color: colors.gizmo,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
        depthTest: false,
      }),
    [colors.gizmo],
  );
  const moved = useMemo(() => dragDelta(meshes, dragged), [meshes, dragged]);

  if (meshes.length === 0) return null;

  return (
    <group scale={[AXIS_SIGN[0], AXIS_SIGN[1], AXIS_SIGN[2]]}>
      <group matrix={moved} matrixAutoUpdate={false}>
        <mesh
          geometry={geometry}
          material={fill}
          renderOrder={OVER_THE_MAP}
          frustumCulled={false}
        />
        <mesh
          geometry={geometry}
          material={wire}
          renderOrder={OVER_THE_MAP + 1}
          frustumCulled={false}
        />
      </group>
    </group>
  );
}
