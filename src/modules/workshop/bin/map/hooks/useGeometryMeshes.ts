import { useQuery } from "@tanstack/react-query";

import { type MapGeometry, viewportQueries } from "@/modules/viewport";

import { useMapScene } from "../state/mapScene";
import { type SelectedMeshes, useSelectedMeshes } from "./useSelectedMeshes";

/** The query arguments of no edited map, which never runs. */
const NOT_EDITED = { document: -1 };

/** The meshes of the open `.mapgeo`, the selected ones, and the buffer the backdrop draws. */
export interface GeometryMeshes extends SelectedMeshes {
  /** The map buffer the backdrop draws: the edited one, else the file's. A pick reads it. */
  readonly drawn: MapGeometry | undefined;
}

/** The meshes of the map scene's open `.mapgeo`. */
export function useGeometryMeshes(): GeometryMeshes {
  const { geometry, geometryEdited, geometryOpening } = useMapScene();
  const { meshes, selection } = useSelectedMeshes();

  /* The same entries the backdrop reads, so neither reads the map again. */
  const edited = useQuery({
    ...viewportQueries.editedMap(geometry, geometryEdited ?? NOT_EDITED),
    enabled: geometryEdited !== null,
  }).data;
  const file = useQuery({
    ...viewportQueries.map(geometry),
    enabled: geometryEdited === null && !geometryOpening,
  }).data;
  const drawn = geometryEdited === null ? file : edited;

  return { meshes, selection, drawn };
}
