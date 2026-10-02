import { useCallback, useRef } from "react";

import type { ArrangedRow } from "./types";

/** The selection store an arranged table picks into, keyed by item id. */
export interface PickSelection {
  anchorId: string | null;
  setAnchor: (id: string | null) => void;
  toggle: (id: string) => void;
  selectRangeTo: (id: string) => void;
  /** Pick `ids` as the range from the anchor, replacing the range drawn before it. */
  selectRange: (ids: string[]) => void;
  addMany: (ids: string[]) => void;
  removeMany: (ids: string[]) => void;
}

/**
 * An arranged table's gestures that pick rows: the anchor, ranges, and a drag down the checkboxes.
 *
 * The store's anchor is an item, and the table keeps the row it was set on, so
 * a range starts from the copy the reader pressed when an item is filed under
 * several groups. `idOf` names a row's item, or null for a group heading.
 */
export function useRowPicks<Row extends ArrangedRow>(
  rows: Row[],
  idOf: (row: Row) => string | null,
  selection: () => PickSelection,
) {
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const live = useRef({ idOf, selection });
  live.current = { idOf, selection };
  const anchorKey = useRef<string | null>(null);
  const paint = useRef<{ select: boolean; lastKey: string } | null>(null);

  /** Make a row the anchor without picking it. */
  const anchor = useCallback((rowKey: string, id: string) => {
    anchorKey.current = rowKey;
    live.current.selection().setAnchor(id);
  }, []);

  /** Pick a row, or drop it, and make it the anchor. */
  const pick = useCallback((rowKey: string, id: string) => {
    anchorKey.current = rowKey;
    live.current.selection().toggle(id);
  }, []);

  /** Pick every row from the anchor to this one, replacing the range drawn before. */
  const rangeTo = useCallback((rowKey: string, id: string) => {
    const drawn = rowsRef.current;
    const from = anchorIndex(drawn, anchorKey.current, live.current);
    const to = drawn.findIndex((row) => row.key === rowKey);

    if (from === -1 || to === -1) {
      anchorKey.current = rowKey;
      live.current.selection().selectRangeTo(id);
      return;
    }

    live.current.selection().selectRange(idsBetween(drawn, from, to, live.current.idOf));
  }, []);

  /** A press on a row's checkbox, which a drag carries to the rows it crosses. */
  const startPick = useCallback(
    (event: React.PointerEvent, rowKey: string, id: string, selected: boolean) => {
      if (event.button !== 0) return;
      event.preventDefault();

      if (event.shiftKey) {
        rangeTo(rowKey, id);
        return;
      }

      pick(rowKey, id);
      paint.current = { select: !selected, lastKey: rowKey };
      const stop = () => {
        paint.current = null;
      };
      window.addEventListener("pointerup", stop, { once: true });
      window.addEventListener("pointercancel", stop, { once: true });
    },
    [pick, rangeTo],
  );

  /**
   * Carry a drag's pick onto the row the pointer reached, if a drag is under way.
   *
   * A fast drag skips rows between two pointer events, so the pick covers every
   * row from the last one reached to this one. `buttons` ends a drag whose
   * release landed outside the window.
   */
  const paintOver = useCallback((rowKey: string, buttons: number) => {
    const drag = paint.current;
    if (!drag) return false;

    if ((buttons & 1) === 0) {
      paint.current = null;
      return false;
    }

    const drawn = rowsRef.current;
    const to = drawn.findIndex((row) => row.key === rowKey);
    if (to === -1) return true;

    const last = drawn.findIndex((row) => row.key === drag.lastKey);
    const from = last === -1 ? to : last;
    const ids = idsBetween(drawn, from, to, live.current.idOf);

    drag.lastKey = rowKey;
    if (drag.select) live.current.selection().addMany(ids);
    else live.current.selection().removeMany(ids);
    return true;
  }, []);

  return { anchor, pick, rangeTo, startPick, paintOver };
}

/** The items of the rows from `from` to `to`, either way round, headings left out. */
function idsBetween<Row extends ArrangedRow>(
  rows: Row[],
  from: number,
  to: number,
  idOf: (row: Row) => string | null,
): string[] {
  const [start, end] = from <= to ? [from, to] : [to, from];
  return rows.slice(start, end + 1).flatMap((row) => {
    const id = idOf(row);
    return id === null ? [] : [id];
  });
}

/** Where the anchor sits among the drawn rows, preferring the copy it was set on. */
function anchorIndex<Row extends ArrangedRow>(
  rows: Row[],
  key: string | null,
  { idOf, selection }: { idOf: (row: Row) => string | null; selection: () => PickSelection },
): number {
  const { anchorId } = selection();
  if (anchorId === null) return -1;

  const exact = rows.findIndex((row) => row.key === key && idOf(row) === anchorId);
  if (exact !== -1) return exact;

  return rows.findIndex((row) => idOf(row) === anchorId);
}
