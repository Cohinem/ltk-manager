import { useCallback } from "react";

import { useMapScene } from "../state/mapScene";
import { meshId } from "../utils/meshSelection";

/** What the map shell does to meshes of its open `.mapgeo`, each change one undo step. */
export interface MeshActions {
  /** Removes the meshes and clears the selection. */
  readonly remove: (meshes: readonly number[]) => Promise<boolean>;
  /** Appends a copy of each mesh and selects the copies. */
  readonly duplicate: (meshes: readonly number[]) => Promise<boolean>;
  /** Sets the controller of each mesh, `0x` and eight hex digits, or none. */
  readonly setController: (
    meshes: readonly number[],
    controller: string | null,
  ) => Promise<boolean>;
}

/**
 * The mesh actions over the map scene's open `.mapgeo`. `count` is how many meshes it holds,
 * which is where a duplicate lands.
 */
export function useMeshActions(count: number): MeshActions {
  const { editGeometry, select } = useMapScene();

  const remove = useCallback(
    async (meshes: readonly number[]) => {
      if (meshes.length === 0) return false;

      const done = await editGeometry({ kind: "remove", meshes: [...meshes] });
      if (done) select([], "replace");
      return done;
    },
    [editGeometry, select],
  );

  const duplicate = useCallback(
    async (meshes: readonly number[]) => {
      if (meshes.length === 0) return false;

      const done = await editGeometry({ kind: "duplicate", meshes: [...meshes] });
      if (done) {
        select(
          meshes.map((_, at) => meshId(count + at)),
          "replace",
        );
      }
      return done;
    },
    [editGeometry, select, count],
  );

  const setController = useCallback(
    (meshes: readonly number[], controller: string | null) =>
      editGeometry({ kind: "controller", meshes: [...meshes], controller }),
    [editGeometry],
  );

  return { remove, duplicate, setController };
}
