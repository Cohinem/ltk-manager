import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  api,
  type AppError,
  type BinDocumentId,
  type MissileSpell,
  type VfxSystem,
} from "@/lib/tauri";
import { usePreviewEffectsQuality } from "@/stores";
import { queryFnWithArgs } from "@/utils/query";

import { adjustedRoot, isNoAdjust, NO_ADJUST, type SystemAdjust } from "../adjust/adjustModel";
import type { SystemModel } from "../engine/model/model";
import { readVfxSystem } from "../engine/parsing/readVfxSystem";

export const vfxKeys = {
  /**
   * One system read out of an open document.
   *
   * Keyed on the document rather than the asset, so an edit invalidates this key and the
   * viewport swaps the definition against the pool it already holds (decision 2.5 of
   * docs/plans/vfx-particle-renderer.md).
   */
  system: (document: BinDocumentId, entry: string) => ["vfx-system", document, entry] as const,
  /** Every system read out of one open document, which a retry of a failed read refetches. */
  document: (document: BinDocumentId) => ["vfx-system", document] as const,
  /** The spells that fire one system as their missile, which no edit of the system changes. */
  missileSpells: (document: BinDocumentId, entry: string) =>
    ["vfx-missile-spells", document, entry] as const,
};

export const vfxQueries = {
  /**
   * The whole object subtree in one call, references chased and assets located.
   *
   * The projected read is the wrong instrument here: a system carries a list of
   * emitters of 139 properties each and `READ_ROW_CAP` bounds one projected read at
   * 2000 rows.
   */
  system: (document: BinDocumentId, entry: string) =>
    queryOptions<VfxSystem, AppError>({
      queryKey: vfxKeys.system(document, entry),
      queryFn: queryFnWithArgs(api.bin.readVfxSystem, document, entry),
      staleTime: Infinity,
      retry: false,
    }),
  /** The spells that fire the system as their missile, read from its character's bin. */
  missileSpells: (document: BinDocumentId, entry: string) =>
    queryOptions<MissileSpell[], AppError>({
      queryKey: vfxKeys.missileSpells(document, entry),
      queryFn: queryFnWithArgs(api.bin.vfxMissileSpells, document, entry),
      staleTime: Infinity,
      retry: false,
    }),
};

/** What the viewport reads: the system, and whether the read has answered. */
export interface VfxSystemRead {
  readonly system: SystemModel | null;
  readonly error: AppError | null;
  readonly pending: boolean;
}

/** Returns one `VfxSystemDefinitionData` as the renderer's model, with `adjust` applied. */
export function useVfxSystem(
  document: BinDocumentId,
  entry: string,
  adjust: SystemAdjust = NO_ADJUST,
): VfxSystemRead {
  const query = useQuery(vfxQueries.system(document, entry));
  const quality = usePreviewEffectsQuality();

  const system = useMemo(() => {
    if (query.data === undefined) return null;

    const read = isNoAdjust(adjust)
      ? query.data
      : { ...query.data, root: adjustedRoot(query.data.root, adjust) };
    return readVfxSystem(read, quality);
  }, [query.data, quality, adjust]);

  return { system, error: query.error, pending: query.isPending };
}
