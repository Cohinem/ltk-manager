import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { MapGeometryMesh } from "@/lib/tauri";
import { type MapGeometry, viewportQueries } from "@/modules/viewport";

import { mapQueries } from "../api/mapQueries";
import { useMapScene } from "../state/mapScene";
import { meshId, meshIndexOf } from "../utils/meshSelection";

const NO_MESHES: readonly MapGeometryMesh[] = [];

/** The query arguments of no edited map, which never runs. */
const NOT_EDITED = { document: -1 };

/** The meshes of the open `.mapgeo`, and the ones the selection holds, lead first. */
export interface GeometryMeshes {
  /** Every mesh in file order, and empty while the map takes no edits. */
  readonly meshes: readonly MapGeometryMesh[];
  readonly selection: readonly MapGeometryMesh[];
  /** The map buffer the backdrop draws: the edited one, else the file's. A pick reads it. */
  readonly drawn: MapGeometry | undefined;
}

/** The meshes of the map scene's open `.mapgeo`. */
export function useGeometryMeshes(): GeometryMeshes {
  const { geometry, geometryDocument, geometryEdited, geometryOpening, selected, lead } =
    useMapScene();
  const meshes =
    useQuery(
      mapQueries.geometryMeshes(geometryDocument?.id ?? null, geometryDocument?.revision ?? 0),
    ).data ?? NO_MESHES;
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

  const selection = useMemo(() => {
    const leadIndex = lead === null ? null : meshIndexOf(lead);
    const held = meshes.filter((mesh) => selected.has(meshId(mesh.index)));
    return held.sort((a, b) => Number(b.index === leadIndex) - Number(a.index === leadIndex));
  }, [meshes, selected, lead]);

  return { meshes, selection, drawn };
}
