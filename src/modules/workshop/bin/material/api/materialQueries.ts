import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type BinDocumentId,
  type BinRow,
  type MaterialProgram,
} from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

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
  /** Every object of the file at depth zero, under the root a patch reads again. */
  objects: (document: BinDocumentId) =>
    queryOptions<readonly BinRow[], AppError>({
      queryKey: ["bin-file-roots", document, "material"],
      queryFn: async () => unwrapForQuery(await api.bin.roots(document)),
      staleTime: Infinity,
      retry: false,
    }),
};
