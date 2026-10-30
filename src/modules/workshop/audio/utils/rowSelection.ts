/**
 * The picked rows of an audio tree: the rows that a delete, a duplicate, a wrap, a copy, a play
 * and a knob edit act on together. Per "Selection" in docs/ux/AUDIO.md.
 */
export interface RowSelection {
  /** The picked row keys. */
  readonly keys: ReadonlySet<string>;
  /** The row that a range starts from, the last row picked without Shift. */
  readonly anchor: string | null;
  /**
   * The picks that a range adds to, held while one anchor stands, so a second Shift pick moves
   * the far end of the range instead of adding another.
   */
  readonly base: ReadonlySet<string> | null;
}

/** A selection of no row. */
export const NO_SELECTION: RowSelection = { keys: new Set(), anchor: null, base: null };

/** How a pick joins the selection: in place of it, flipping one row, or as a range. */
export type PickMode = "only" | "toggle" | "range";

/** Returns the mode that the modifiers of a press or a key ask for: Ctrl or Cmd flips, Shift ranges. */
export function pickMode(event: {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}): PickMode {
  if (event.shiftKey) return "range";
  if (event.ctrlKey || event.metaKey) return "toggle";

  return "only";
}

/**
 * Returns `selection` with the row `key` picked under `mode`.
 *
 * `order` is the keys of the rows that a pick takes, in the order that the tree draws them. A
 * range takes every row of `order` from the anchor to `key`, over the picks it started from. A
 * range without an anchor in `order` picks `key` alone and makes it the anchor.
 */
export function pickRow(
  selection: RowSelection,
  key: string,
  order: readonly string[],
  mode: PickMode,
): RowSelection {
  if (mode === "only") return { keys: new Set([key]), anchor: key, base: null };

  if (mode === "toggle") {
    const keys = new Set(selection.keys);
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    return { keys, anchor: key, base: null };
  }

  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor);
  const to = order.indexOf(key);
  if (from === -1 || to === -1) return { keys: new Set([key]), anchor: key, base: null };

  const base = selection.base ?? selection.keys;
  const [start, end] = from <= to ? [from, to] : [to, from];
  const keys = new Set(base);
  for (const each of order.slice(start, end + 1)) keys.add(each);
  return { keys, anchor: selection.anchor, base };
}

/** Returns a selection of every row of `order`, anchored on `anchor`. */
export function selectAll(order: readonly string[], anchor: string | null): RowSelection {
  return { keys: new Set(order), anchor, base: null };
}

/** Returns `selection` without the keys that `order` no longer draws. */
export function keepDrawn(selection: RowSelection, order: readonly string[]): RowSelection {
  const drawn = new Set(order);
  if ([...selection.keys].every((key) => drawn.has(key))) return selection;

  const keys = new Set([...selection.keys].filter((key) => drawn.has(key)));
  const anchor = selection.anchor !== null && drawn.has(selection.anchor) ? selection.anchor : null;
  return { keys, anchor, base: null };
}

/** Returns the picked keys of `selection` in the order of `order`. */
export function pickedInOrder(selection: RowSelection, order: readonly string[]): string[] {
  return order.filter((key) => selection.keys.has(key));
}
