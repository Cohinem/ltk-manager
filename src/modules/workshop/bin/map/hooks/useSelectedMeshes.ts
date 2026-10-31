import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { MapGeometryMesh } from "@/lib/tauri";

import { mapQueries } from "../api/mapQueries";
import { useMapScene } from "../state/mapScene";
import { meshId, meshIndexOf } from "../utils/meshSelection";

const NO_MESHES: readonly MapGeometryMesh[] = [];

/** The meshes of the open `.mapgeo`, and the ones the selection holds, lead first. */
export interface SelectedMeshes {
  /** Every mesh in file order, and empty while the map takes no edits. */
  readonly meshes: readonly MapGeometryMesh[];
  readonly selection: readonly MapGeometryMesh[];
}

/** Reads the mesh list of the scene's open `.mapgeo`, without the map buffer the viewport draws. */
export function useSelectedMeshes(): SelectedMeshes {
  const { geometryDocument, selected, lead } = useMapScene();
  const meshes =
    useQuery(
      mapQueries.geometryMeshes(geometryDocument?.id ?? null, geometryDocument?.revision ?? 0),
    ).data ?? NO_MESHES;

  const selection = useMemo(() => {
    const leadIndex = lead === null ? null : meshIndexOf(lead);
    const held = meshes.filter((mesh) => selected.has(meshId(mesh.index)));
    return held.sort((a, b) => Number(b.index === leadIndex) - Number(a.index === leadIndex));
  }, [meshes, selected, lead]);

  return { meshes, selection };
}
