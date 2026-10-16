import { useQuery } from "@tanstack/react-query";

import type { BinDocumentId, ShaderProgram } from "@/lib/tauri";

import { materialQueries } from "../api/materialQueries";
import { usePreviewDefines } from "../state/previewDefines";
import { useShaderMaterial } from "./useShaderMaterial";

const programOf = (read: ShaderProgram | null) => read?.program ?? null;

/**
 * Returns the query options of a shader def's preview read, through the material that
 * `useShaderMaterial` chose and with the defines that the preview sets. The query waits while
 * the materials that link the def are searched for, and is disabled if `shader` is false.
 */
export function useShaderReadOptions(
  document: BinDocumentId,
  entry: string | null,
  shader: boolean,
) {
  const defines = usePreviewDefines(document, entry);
  const { chosen, searching } = useShaderMaterial(document, entry, shader);
  const ready = shader && !searching;

  return materialQueries.shader(document, ready ? entry : null, chosen, defines);
}

/**
 * Returns the query of the program that a material view draws. If `shader` is true, `entry` is
 * a `CustomShaderDef` and is read with `useShaderReadOptions`.
 */
export function useMaterialProgram(document: BinDocumentId, entry: string | null, shader: boolean) {
  const material = useQuery(materialQueries.program(document, shader ? null : entry));
  const shaderRead = useQuery({
    ...useShaderReadOptions(document, entry, shader),
    select: programOf,
  });

  if (shader) return shaderRead;
  return material;
}
