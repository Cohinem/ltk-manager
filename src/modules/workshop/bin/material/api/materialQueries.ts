import { keepPreviousData, queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type BinDocumentId,
  type BinRow,
  type MaterialProgram,
  type PreviewMaterial,
  type ShaderProgram,
} from "@/lib/tauri";
import { queryFnWithArgs, unwrapForQuery } from "@/utils/query";

/** The reads a material view draws from, keyed on the document as `skinQueries` is. */
export const materialQueries = {
  /**
   * One material with the game's own shaders translated, and null where the document
   * declares no such object.
   */
  program: (document: BinDocumentId, entry: string | null) =>
    queryOptions<MaterialProgram | null, AppError>({
      queryKey: ["material-program", document, entry],
      queryFn:
        entry === null
          ? skipToken
          : async () => {
              const programs = unwrapForQuery(
                await api.bin.readMaterialPrograms({ kind: "document", document }, [entry], {
                  lowQuality: false,
                }),
              );
              return programs[0] ?? null;
            },
      staleTime: Infinity,
      retry: false,
    }),
  /**
   * The program of the shader def `entry` through `material`, or with its defaults if
   * `material` is null, with `defines` set over it, and the defines that its TOCs declare. Null
   * if the document has no object at `entry`.
   */
  shader: (
    document: BinDocumentId,
    entry: string | null,
    material: PreviewMaterial | null,
    defines: readonly string[],
  ) =>
    queryOptions<ShaderProgram | null, AppError>({
      queryKey: ["material-program", document, entry, "shader", material, defines],
      queryFn:
        entry === null
          ? skipToken
          : async () =>
              unwrapForQuery(
                await api.bin.readShaderProgram(document, entry, material, defines, {
                  lowQuality: false,
                }),
              ),
      placeholderData: keepPreviousData,
      staleTime: Infinity,
      retry: false,
    }),
  /** Every object of the file at depth zero, under the root a patch reads again. */
  objects: (document: BinDocumentId) =>
    queryOptions<readonly BinRow[], AppError>({
      queryKey: ["bin-file-roots", document, "material"],
      queryFn: queryFnWithArgs(api.bin.roots, document),
      staleTime: Infinity,
      retry: false,
    }),
};
