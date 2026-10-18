import { useCallback, useMemo } from "react";
import { Plane, Ray, Vector3 } from "three";

import type { MapGeometry } from "@/modules/viewport";

import type { CanvasHit } from "../components/CanvasClick";
import type { PlaceablePicking } from "../components/PlaceablePicking";
import { useMapScene } from "../state/mapScene";
import { modeOf, nearest } from "../utils/mapSelection";
import {
  meshAnchor,
  meshId,
  meshIndexOf,
  meshTransformEdit,
  pickMesh,
} from "../utils/meshSelection";
import { type Moved, placeableMoves, type Positioned } from "../utils/placeableSpace";
import type { GeometryMeshes } from "./useGeometryMeshes";
import type { PlaceableActions } from "./usePlaceableActions";

/** The plane at height 0, which a click that meets no mesh places on. */
const GROUND = new Plane(new Vector3(0, 1, 0), 0);

/** How far above a placeable a drop looks down from when no floor is under the placeable. */
const DROP_HEIGHT = 5000;
const DOWN = new Vector3(0, -1, 0);

/** Returns the height of the first shown mesh below `x`,`y`,`z`, then above it, else null. */
function floorUnder(
  drawn: MapGeometry,
  [x, y, z]: readonly [number, number, number],
  shown: (mesh: number) => boolean,
): number | null {
  for (const lift of [1, DROP_HEIGHT]) {
    const hit = pickMesh(drawn, new Ray(new Vector3(x, y + lift, z), DOWN), shown);
    if (hit !== null) return hit.point[1];
  }
  return null;
}

/** Where `ray` meets the plane at height 0, and null if it points away from it. */
function groundPoint(ray: Ray): [number, number, number] | null {
  const point = ray.intersectPlane(GROUND, new Vector3());
  return point === null ? null : [point.x, point.y, point.z];
}

/** What the viewport's gizmo and clicks do to the selection. */
export interface ViewportEdits {
  /** The selection the gizmo moves, the lead first: meshes when the lead is a mesh. */
  readonly gizmoItems: readonly Positioned[];
  readonly commit: (moved: readonly Moved[]) => Promise<boolean>;
  readonly drag: (moved: readonly Moved[] | null) => void;
  /** Places with the Place tool, else picks the mesh under the click. */
  readonly click: (hit: CanvasHit) => void;
  /** Drops each selected placeable onto the shown mesh under it, as one edit. */
  readonly drop: () => void;
}

/**
 * The gizmo items, the commit and the click handling of the map viewport.
 *
 * A click selects the placeable marker within reach of it first, then the nearest mesh that
 * `shown` draws along its ray, and a plain click on nothing clears the selection.
 */
export function useViewportEdits(
  actions: PlaceableActions,
  geometry: GeometryMeshes,
  picking: PlaceablePicking,
  shown: (mesh: number) => boolean,
): ViewportEdits {
  const { lead, tool, placeClass, setDragged, editGeometry, select } = useMapScene();
  const meshLead = lead === null ? null : meshIndexOf(lead);

  const gizmoItems = useMemo<readonly Positioned[]>(() => {
    if (meshLead !== null) {
      /* A region mesh's matrix is its region's placement, so it moves only with the region. */
      return geometry.selection
        .filter((mesh) => mesh.region === null)
        .map((mesh) => ({
          id: meshId(mesh.index),
          transform: mesh.transform,
          anchor: meshAnchor(mesh),
        }));
    }
    if (actions.lead === null) return [];

    return [actions.lead, ...actions.selection.filter((each) => each !== actions.lead)].map(
      ({ id, item }) => ({ id, transform: item.transform }),
    );
  }, [meshLead, geometry.selection, actions.lead, actions.selection]);

  const commit = useCallback(
    async (moved: readonly Moved[]) => {
      const meshes = meshTransformEdit(moved);
      if (meshes !== null) return editGeometry(meshes);

      return actions.move(placeableMoves(moved));
    },
    [editGeometry, actions],
  );

  const drag = useCallback(
    (moved: readonly Moved[] | null) =>
      setDragged(moved === null ? null : new Map(moved.map((each) => [each.id, each.transform]))),
    [setDragged],
  );

  const { place } = actions;
  const { drawn } = geometry;
  const click = useCallback(
    ({ ray, at, event }: CanvasHit) => {
      const hit = drawn === undefined ? null : pickMesh(drawn, ray, shown);

      if (tool === "place") {
        const ground = hit?.point ?? groundPoint(ray);
        if (ground !== null) void place(placeClass, ground);
        return;
      }

      const mode = modeOf(event);
      const marker = picking.shown
        ? nearest(
            picking.items.map((each) => each.id),
            picking.projector.current?.() ?? [],
            at,
          )
        : null;
      if (marker !== null) select([marker], mode);
      else if (hit !== null) select([meshId(hit.mesh)], mode);
      else if (mode === "replace") select([], "replace");
    },
    [tool, place, placeClass, drawn, select, shown, picking],
  );

  const { move, selection } = actions;
  const drop = useCallback(() => {
    if (drawn === undefined) return;

    const moves = selection.flatMap(({ chunk, item }) => {
      const position = item.position.map((cell) => cell ?? 0) as [number, number, number];
      const floor = floorUnder(drawn, position, shown);
      if (floor === null) return [];

      const transform = item.transform.map((cell) => cell ?? 0);
      transform[13] = floor;
      return [{ chunk: chunk.entry, key: item.key, transform }];
    });
    if (moves.length > 0) void move(moves);
  }, [drawn, selection, shown, move]);

  return { gizmoItems, commit, drag, click, drop };
}
