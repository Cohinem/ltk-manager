import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, use, useCallback, useEffect, useMemo } from "react";

import {
  api,
  type AppError,
  type BinDocumentId,
  type DeclaredMark,
  type DeclaredState,
} from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { rowKey } from "../../tree/utils/binRows";

/** The query root of a document's declared state, which every edit leaves stale. */
export const DECLARED_ROOT = ["bin-declared"] as const;

const declaredQuery = (document: BinDocumentId) =>
  queryOptions<DeclaredState | null, AppError>({
    queryKey: [...DECLARED_ROOT, document],
    queryFn: async () => unwrapForQuery(await api.bin.declared(document)),
    staleTime: Infinity,
    retry: false,
  });

/**
 * What a declared document says beside its rows, or null for a document that declares
 * nothing. "Declaring from a game bin" in docs/ux/BIN_EDITOR.md.
 */
export function useDeclaredState(document: BinDocumentId): DeclaredState | null {
  return useQuery(declaredQuery(document)).data ?? null;
}

/**
 * Write the edits that follow to `layer`, and keep the document on the project's
 * selected layer while it is one the document can write to.
 */
export function useDeclareInto(
  document: BinDocumentId,
  declared: DeclaredState | null,
  preferred: string | null,
): (layer: string) => void {
  const queryClient = useQueryClient();
  const declareInto = useCallback(
    (layer: string) => {
      void api.bin.declareInto(document, layer).then((result) => {
        if (result.ok) queryClient.setQueryData(declaredQuery(document).queryKey, result.value);
      });
    },
    [document, queryClient],
  );

  const layer = declared?.layer ?? null;
  const follows =
    preferred !== null && layer !== null && preferred !== layer
      ? (declared?.layers.includes(preferred) ?? false)
      : false;
  useEffect(() => {
    if (follows && preferred !== null) declareInto(preferred);
  }, [declareInto, follows, preferred]);

  return declareInto;
}

/** The rows a declaration of the chosen layer touches, by row key, and that layer. */
export interface DeclaredRows {
  readonly layer: string;
  readonly marks: ReadonlyMap<string, DeclaredMark>;
}

/** The declared rows of the enclosing tree, or null for a tree that declares nothing. */
export const DeclaredRowsContext = createContext<DeclaredRows | null>(null);

/** The marks of the document by the key of the row each stands on. */
export function useDeclaredRows(document: BinDocumentId): DeclaredRows | null {
  const declared = useDeclaredState(document);
  return useMemo(() => {
    if (declared === null) return null;
    return {
      layer: declared.layer,
      marks: new Map(declared.marks.map((mark) => [rowKey(mark), mark])),
    };
  }, [declared]);
}

/** Whether the enclosing tree is a declared document's, whose edits land as declarations. */
export function useDeclares(): boolean {
  return use(DeclaredRowsContext) !== null;
}

/** The declaration standing on the row under `key` and its layer, or null where none does. */
export function useDeclaredMark(key: string): { mark: DeclaredMark; layer: string } | null {
  const rows = use(DeclaredRowsContext);
  const mark = rows?.marks.get(key);
  return rows && mark ? { mark, layer: rows.layer } : null;
}
