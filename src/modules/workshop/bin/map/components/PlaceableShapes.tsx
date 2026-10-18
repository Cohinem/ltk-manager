import { useMemo } from "react";
import { BufferAttribute, BufferGeometry, LineBasicMaterial } from "three";

import { useDisposable } from "@/hooks";
import type { SceneColors } from "@/modules/viewport";

import { isHidden, type PlacedItem } from "../utils/mapOutline";
import { type ShapedItem, shapeLines } from "../utils/placeableShapes";

/** Drawn under the markers and over the scene, as the markers are. */
const OVER_THE_SCENE = 998;

export interface PlaceableShapesProps {
  readonly items: readonly PlacedItem[];
  readonly hidden: ReadonlySet<string>;
  readonly selected: ReadonlySet<string>;
  readonly colors: SceneColors;
}

/**
 * The extent of each listed placeable that states one, as wire lines: a light's reach or
 * frustum, a probe's region, a banner's box and a motion path. A selected one draws in the
 * selection color. Per "Placeables" in docs/ux/MAP_EDITOR.md.
 */
export function PlaceableShapes({ items, hidden, selected, colors }: PlaceableShapesProps) {
  const [rest, picked] = useMemo(() => {
    const groups: [ShapedItem[], ShapedItem[]] = [[], []];
    for (const { id, chunk, item } of items) {
      if (item.shape === null || isHidden(hidden, chunk.entry, item.key)) continue;
      groups[selected.has(id) ? 1 : 0].push({
        shape: item.shape,
        transform: item.transform,
      });
    }
    return groups;
  }, [items, hidden, selected]);

  const restGeometry = useDisposable(() => lines(rest), [rest]);
  const pickedGeometry = useDisposable(() => lines(picked), [picked]);
  const restMaterial = useDisposable(
    () => new LineBasicMaterial({ color: colors.markerOther, depthTest: false }),
    [colors.markerOther],
  );
  const pickedMaterial = useDisposable(
    () => new LineBasicMaterial({ color: colors.gizmo, depthTest: false }),
    [colors.gizmo],
  );

  return (
    <>
      <lineSegments
        geometry={restGeometry}
        material={restMaterial}
        renderOrder={OVER_THE_SCENE}
        frustumCulled={false}
      />
      <lineSegments
        geometry={pickedGeometry}
        material={pickedMaterial}
        renderOrder={OVER_THE_SCENE + 1}
        frustumCulled={false}
      />
    </>
  );
}

function lines(items: readonly ShapedItem[]): BufferGeometry {
  const made = new BufferGeometry();
  made.setAttribute("position", new BufferAttribute(shapeLines(items), 3));
  return made;
}
