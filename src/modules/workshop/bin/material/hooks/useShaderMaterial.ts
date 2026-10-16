import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { BinDocumentId, IndexResponse, PreviewMaterial, ReferenceResult } from "@/lib/tauri";

import { useOptionalProjectContext } from "../../../projects/state/ProjectContext";
import { referenceQueries } from "../../../references/api/queries";
import { nameHash } from "../../shared/utils/binHash";
import { usePickedMaterial } from "../state/previewDefines";

const STATIC_MATERIAL = nameHash("StaticMaterialDef");

/** One material that links a shader def, with the names a menu lists it by. */
export interface LinkingMaterial extends PreviewMaterial {
  /** The material's path, or its hash if the hash tables have no name for it. */
  readonly path: string;
  /** The path of the bin that declares it. */
  readonly file: string;
}

export interface ShaderMaterial {
  /** Every `StaticMaterialDef` that links the def, the open project's first, in the walk's order. */
  readonly linking: readonly LinkingMaterial[];
  /** The material that the preview draws through, or null for the def's defaults. */
  readonly chosen: PreviewMaterial | null;
  /** `true` while the walk runs, so the preview waits instead of drawing the defaults first. */
  readonly searching: boolean;
}

const NO_MATERIALS: readonly LinkingMaterial[] = [];

/**
 * Returns the `StaticMaterialDef` hits of the walk result `response`, each with the bin that
 * declares it. Returns none until the walk is ready.
 */
export function linkingMaterials(
  response: IndexResponse<ReferenceResult> | undefined,
): readonly LinkingMaterial[] {
  if (response?.status !== "ready") return NO_MATERIALS;

  return response.value.groups.flatMap((group) =>
    group.objects
      .filter((hit) => hit.classHash === STATIC_MATERIAL)
      .map((hit) => ({
        asset: group.asset,
        entry: hit.objectHash,
        path: hit.path,
        file: group.file,
      })),
  );
}

/**
 * Returns the materials that link the shader def `entry`, and the one that its preview draws
 * through. "The material shell" in docs/ux/BIN_EDITOR.md.
 *
 * A reference walk of the open project's layers and the install finds the materials, once per
 * def per session. Until the reader chooses, the preview draws through the first one. If the
 * object index is off or no material links the def, the preview draws the defaults.
 */
export function useShaderMaterial(
  document: BinDocumentId,
  entry: string | null,
  shader: boolean,
): ShaderMaterial {
  const project = useOptionalProjectContext()?.path ?? null;
  const request =
    shader && entry !== null
      ? { query: { kind: "object" as const, objectHash: entry }, label: entry, project }
      : null;
  const references = useQuery(referenceQueries.forRequest(request));
  const picked = usePickedMaterial(document, entry);

  const linking = useMemo(() => linkingMaterials(references.data), [references.data]);
  const status = references.data?.status;
  const searching =
    request !== null && picked === undefined && (status === undefined || status === "building");

  const chosen = picked === undefined ? (linking[0] ?? null) : picked;
  return { linking, chosen, searching };
}
