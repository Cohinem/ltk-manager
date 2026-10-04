import { useMemo } from "react";

import type { BinDocumentId, BinRow } from "@/lib/tauri";

import { useBinRead } from "../../documents/hooks/useBinRead";
import { useHeldRows } from "../../tree/state/rowRegistry";
import { childCount, rowKey } from "../../tree/utils/binRows";
import { meshPath, under } from "../utils/dynamicsEdits";

const NO_ROWS: readonly BinRow[] = [];

/** The items the list `list` holds, each as the document's own row, held for the row menu. */
export function useItems(document: BinDocumentId, list: BinRow | undefined): readonly BinRow[] {
  const key = list === undefined ? null : rowKey(list);
  const count = list === undefined ? 0 : childCount(list);
  return useRowsUnder(document, count === 0 ? null : key, count);
}

/**
 * The items of the list `field` of the skin's mesh properties, of which the skin's typed
 * read counted `count`.
 *
 * The typed read hands out each item's hash path, which is the path the row is read at, so
 * an item finds its own row by it.
 */
export function useMeshItems(
  document: BinDocumentId,
  entry: string,
  field: string,
  count: number,
): readonly BinRow[] {
  const path = meshPath(under("", field));
  return useRowsUnder(document, count === 0 ? null : rowKey({ entry, path }), count);
}

function useRowsUnder(
  document: BinDocumentId,
  key: string | null,
  count: number,
): readonly BinRow[] {
  const requests = useMemo(() => (key === null ? [] : [{ key, rows: count }]), [key, count]);
  const pages = useBinRead(document, requests);
  const rows = key === null ? NO_ROWS : (pages.get(key)?.rows ?? NO_ROWS);
  useHeldRows(rows);
  return rows;
}
