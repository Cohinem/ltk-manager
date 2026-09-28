import { queryOptions, useQuery } from "@tanstack/react-query";
import { createContext, use, useMemo } from "react";

import { api, type AppError, type BinDocumentId, type LayerOverride } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { rowKey } from "../../tree/utils/binRows";
import { sendOn } from "./useDocumentCall";

/** The query root of a layer file's overrides. An edit and a manifest change make it stale. */
export const OVERRIDES_ROOT = ["bin-overrides"] as const;

const overridesQuery = (document: BinDocumentId) =>
  queryOptions<LayerOverride[], AppError>({
    queryKey: [...OVERRIDES_ROOT, document],
    queryFn: async () => unwrapForQuery((await sendOn(document, api.bin.overrides)).result),
    staleTime: Infinity,
    retry: false,
  });

/** The declarations overriding each row of a layer file, by row key, in build order. */
export type OverriddenRows = ReadonlyMap<string, readonly LayerOverride[]>;

/** The overridden rows of the enclosing tree, or null for a document that is not a layer file. */
export const OverriddenRowsContext = createContext<OverriddenRows | null>(null);

/**
 * The rows of the layer file under `document` that the project's `game_data.yaml` files
 * override. ADR-0056.
 */
export function useOverriddenRows(document: BinDocumentId): OverriddenRows | null {
  const overrides = useQuery(overridesQuery(document)).data;
  return useMemo(() => {
    if (overrides === undefined || overrides.length === 0) return null;

    const rows = new Map<string, LayerOverride[]>();
    for (const override of overrides) {
      const key = rowKey(override.mark);
      rows.set(key, [...(rows.get(key) ?? []), override]);
    }
    return rows;
  }, [overrides]);
}

const NO_OVERRIDES: readonly LayerOverride[] = [];

/** The declarations overriding the row under `key`, in build order. The last one is packed. */
export function useRowOverrides(key: string): readonly LayerOverride[] {
  return use(OverriddenRowsContext)?.get(key) ?? NO_OVERRIDES;
}
