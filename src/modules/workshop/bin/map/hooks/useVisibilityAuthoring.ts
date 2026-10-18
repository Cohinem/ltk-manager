import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import type { MapChunk } from "@/lib/tauri";

import { mapQueries } from "../api/mapQueries";
import { useMapScene } from "../state/mapScene";
import {
  childEdits,
  controllerCreation,
  controllerMeshIds,
  controllerPlaceableIds,
  isolation,
  layerMeshIds,
  type NewController,
  placeableControllerEdits,
  splitSelection,
} from "../utils/visibilityAuthoring";
import { useGeometryMeshes } from "./useGeometryMeshes";

const NO_CHUNKS: readonly MapChunk[] = [];

/** What the Visibility pane does to the scene's controllers and to what they show. */
export interface VisibilityAuthoring {
  /** The map takes edits. Every edit below resolves false while it does not. */
  readonly editable: boolean;
  /** Sets the controller of every selected mesh and placeable to `controller`. */
  readonly assign: (controller: string) => Promise<boolean>;
  readonly selectMeshes: (controller: string) => void;
  readonly selectPlaceables: (controller: string) => void;
  /** Hides every mesh and placeable under another controller, and shows the ones under `controller`. */
  readonly isolate: (controller: string) => void;
  /** Selects the meshes that the layer `index` decides. */
  readonly selectLayer: (index: number) => void;
  /** Creates `controller` at the object path `path`. */
  readonly create: (path: string, controller: NewController) => Promise<boolean>;
  /** Sets the parents and the `ParentMode` of the child controller `entry`, which holds `held` parents. */
  readonly setParents: (
    entry: string,
    held: number,
    parents: readonly string[],
    mode: number,
  ) => Promise<boolean>;
}

/** The visibility authoring actions over the map scene in view. */
export function useVisibilityAuthoring(): VisibilityAuthoring {
  const { editable, apply, editGeometry, selected, select, setHidden, materials } = useMapScene();
  const { meshes } = useGeometryMeshes();
  const chunks = useQuery(mapQueries.outline(materials)).data ?? NO_CHUNKS;

  const assign = useCallback(
    async (controller: string) => {
      if (!editable) return false;

      const split = splitSelection(selected);
      let done = true;
      if (split.meshes.length > 0) {
        done = await editGeometry({
          kind: "controller",
          meshes: split.meshes,
          controller,
        });
      }
      if (split.placeables.length > 0) {
        done = (await apply(placeableControllerEdits(split.placeables, controller))) && done;
      }

      return done;
    },
    [editable, selected, editGeometry, apply],
  );

  const create = useCallback(
    (path: string, controller: NewController) => {
      const { objects, edits } = controllerCreation(path, controller);
      return apply(edits, objects);
    },
    [apply],
  );

  const setParents = useCallback(
    (entry: string, held: number, parents: readonly string[], mode: number) =>
      apply(childEdits(entry, held, parents, mode)),
    [apply],
  );

  return useMemo(
    () => ({
      editable,
      assign,
      selectMeshes: (controller) => select(controllerMeshIds(meshes, controller), "replace"),
      selectPlaceables: (controller) =>
        select(controllerPlaceableIds(chunks, controller), "replace"),
      isolate: (controller) => {
        const { hide, show } = isolation(meshes, chunks, controller);
        setHidden(hide, true);
        setHidden(show, false);
      },
      selectLayer: (index) => select(layerMeshIds(meshes, index), "replace"),
      create,
      setParents,
    }),
    [editable, assign, select, meshes, chunks, setHidden, create, setParents],
  );
}
