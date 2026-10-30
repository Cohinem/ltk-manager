/** The number of rows that PageUp and PageDown move the selection by. */
export const PAGE_ROWS = 10;

/**
 * Returns the index that `key` moves the selection of a list of `count` rows to, from `index`.
 *
 * The index is clamped to the rows. Returns `null` for a key that moves nothing, and for an
 * empty list.
 */
export function movedIndex(key: string, index: number, count: number): number | null {
  const moves: Record<string, number> = {
    ArrowDown: index + 1,
    ArrowUp: index - 1,
    PageDown: index + PAGE_ROWS,
    PageUp: index - PAGE_ROWS,
    Home: 0,
    End: count - 1,
  };

  const target = moves[key];
  if (target === undefined || count === 0) return null;
  return Math.max(0, Math.min(count - 1, target));
}

/** The parts of a tree row that `treeStep` reads. */
export interface TreeStepRow {
  readonly key: string;
  readonly parent: string | null;
  readonly expandable: boolean;
}

/** What an ArrowRight or an ArrowLeft does to the selected row of the event tree. */
export type TreeStep =
  | { readonly kind: "expand"; readonly key: string; readonly open: boolean }
  | { readonly kind: "select"; readonly index: number };

/**
 * Returns what `key` does to the row at `index` of `rows`, with the keys in `expanded` open.
 *
 * ArrowRight opens a closed row and selects the first child of an open one. ArrowLeft closes an
 * open row and selects the parent of another. Returns `null` for another key, and for a row that
 * the key does not change.
 */
export function treeStep(
  key: string,
  rows: readonly TreeStepRow[],
  index: number,
  expanded: ReadonlySet<string>,
): TreeStep | null {
  const row = rows[index];
  if (row === undefined) return null;

  const open = expanded.has(row.key);
  if (key === "ArrowRight" && row.expandable) {
    return open
      ? { kind: "select", index: index + 1 }
      : { kind: "expand", key: row.key, open: true };
  }

  if (key === "ArrowLeft") {
    if (row.expandable && open) return { kind: "expand", key: row.key, open: false };

    const parent = rows.findIndex((each) => each.key === row.parent);
    if (parent >= 0) return { kind: "select", index: parent };
  }

  return null;
}
