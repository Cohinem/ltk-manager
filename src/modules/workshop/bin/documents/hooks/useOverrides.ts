import { queryOptions, useQuery } from "@tanstack/react-query";
import { createContext, use, useMemo } from "react";

import { api, type AppError, type BinDocumentId, type LayerOverride } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { useOptionalProjectContext } from "../../../projects/state/ProjectContext";
import { useHiddenMarkLayers } from "../../../state";
import { rowKey } from "../../tree/utils/binRows";
import { enclosingKeys } from "./useChanges";
import { useDeclaredState } from "./useDeclared";
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

/** The overridden rows of a layer file. */
export interface OverriddenRows {
  /** The declarations overriding each row, by row key, in build order. */
  readonly rows: ReadonlyMap<string, readonly LayerOverride[]>;
  /** The layers overriding a row at or under each row key, in build order. */
  readonly layers: ReadonlyMap<string, readonly string[]>;
}

/** The overridden rows of the enclosing tree, or null for a document that is not a layer file. */
export const OverriddenRowsContext = createContext<OverriddenRows | null>(null);

/**
 * The rows of the layer file under `document` that the project's `game_data.yaml` files
 * override. ADR-0056.
 *
 * For a declared document, the rows a shown layer other than the target declares, each with
 * every shown layer's declaration and the target's. The target's own marks draw apart.
 */
export function useOverriddenRows(document: BinDocumentId): OverriddenRows | null {
  const overrides = useQuery(overridesQuery(document)).data;
  const target = useDeclaredState(document)?.layer ?? null;
  const hidden = useHiddenMarkLayers(useOptionalProjectContext()?.path);

  return useMemo(() => {
    if (overrides === undefined) return null;

    const marked = target === null ? overrides : otherLayersRows(overrides, target, hidden);
    if (marked.length === 0) return null;

    const rows = new Map<string, LayerOverride[]>();
    const layers = new Map<string, string[]>();
    for (const override of marked) {
      const key = rowKey(override.mark);
      rows.set(key, [...(rows.get(key) ?? []), override]);
      if (override.layer === target) continue;

      for (const at of [key, ...enclosingKeys(override.mark)]) {
        const listed = layers.get(at) ?? [];
        if (!listed.includes(override.layer)) layers.set(at, [...listed, override.layer]);
      }
    }
    return { rows, layers };
  }, [overrides, target, hidden]);
}

/** A declared document's declarations on the rows a shown layer other than `target` touches. */
function otherLayersRows(
  overrides: readonly LayerOverride[],
  target: string,
  hidden: readonly string[],
): LayerOverride[] {
  const shown = overrides.filter(
    (override) => override.layer === target || !hidden.includes(override.layer),
  );
  const others = new Set(
    shown.filter((override) => override.layer !== target).map((override) => rowKey(override.mark)),
  );

  return shown.filter((override) => others.has(rowKey(override.mark)));
}

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/** How many rows each layer's declarations touch in the declared document `document`. */
export function useLayerRowCounts(document: BinDocumentId): ReadonlyMap<string, number> {
  const overrides = useQuery(overridesQuery(document)).data;

  return useMemo(() => {
    if (overrides === undefined) return NO_COUNTS;

    const rows = new Map<string, Set<string>>();
    for (const override of overrides) {
      const held = rows.get(override.layer) ?? new Set<string>();
      held.add(rowKey(override.mark));
      rows.set(override.layer, held);
    }
    return new Map([...rows].map(([layer, keys]) => [layer, keys.size]));
  }, [overrides]);
}

const NO_OVERRIDES: readonly LayerOverride[] = [];

/** The declarations overriding the row under `key`, in build order. The last one is packed. */
export function useRowOverrides(key: string): readonly LayerOverride[] {
  return use(OverriddenRowsContext)?.rows.get(key) ?? NO_OVERRIDES;
}

const NO_LAYERS: readonly string[] = [];

/** The layers overriding a row at or under the row `key`, in build order. */
export function useOverridesWithin(key: string): readonly string[] {
  return use(OverriddenRowsContext)?.layers.get(key) ?? NO_LAYERS;
}
