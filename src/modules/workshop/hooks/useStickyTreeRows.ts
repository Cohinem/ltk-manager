import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { type DepthRow, type StickyRow, stickyTreeRows } from "../utils/stickyTree";

/** How deep the pin stacks before the outermost rows win. */
const MAX_PINNED = 5;

/** A pin taking more of the pane than this would leave nothing to read. */
const MAX_PANE_SHARE = 0.4;

interface UseStickyTreeRowsParams<Row> {
  rows: readonly Row[];
  scrollElementRef: RefObject<HTMLElement | null>;
  rowHeight: number;
  /** Padding above the first row, which the scroll offset is read past. */
  offsetTop?: number;
  /** Whether the row is a directory whose children follow it. */
  isOpenBranch: (row: Row) => boolean;
}

interface UseStickyTreeRowsReturn<Row> {
  sticky: readonly StickyRow<Row>[];
  /** What the band covers, for the ground behind it and the scroll padding under it. */
  height: number;
}

/**
 * Track the ancestor rows pinned above a scrolled file tree.
 *
 * State changes only when the band itself does, which is once a row-height for
 * most of a scroll, so the tree around it re-renders no more than the
 * virtualizer already makes it.
 */
export function useStickyTreeRows<Row extends DepthRow>({
  rows,
  scrollElementRef,
  rowHeight,
  offsetTop = 0,
  isOpenBranch,
}: UseStickyTreeRowsParams<Row>): UseStickyTreeRowsReturn<Row> {
  const [sticky, setSticky] = useState<readonly StickyRow<Row>[]>([]);

  /* Held rather than depended on: the predicate is rebuilt whenever the set of
     open directories changes, which is already what rebuilds `rows`. */
  const branch = useRef(isOpenBranch);
  useLayoutEffect(() => {
    branch.current = isOpenBranch;
  });

  const measure = useCallback(() => {
    const element = scrollElementRef.current;
    if (!element) return;
    const next = stickyTreeRows(rows, {
      scrollTop: element.scrollTop - offsetTop,
      rowHeight,
      max: Math.min(MAX_PINNED, Math.floor((element.clientHeight * MAX_PANE_SHARE) / rowHeight)),
      isOpenBranch: (row) => branch.current(row),
    });
    setSticky((current) => (samePins(current, next) ? current : next));
  }, [rows, rowHeight, offsetTop, scrollElementRef]);

  useEffect(() => {
    const element = scrollElementRef.current;
    if (!element) return;

    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, scrollElementRef]);

  /* The furthest down any pin reaches, which is not the innermost one while a
     nest is riding out. */
  const height = sticky.reduce((reach, pin) => Math.max(reach, pin.top + rowHeight), 0);
  return { sticky, height };
}

function samePins<Row>(a: readonly StickyRow<Row>[], b: readonly StickyRow<Row>[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((pin, i) => {
    const other = b[i]!;
    return pin.index === other.index && pin.top === other.top && pin.row === other.row;
  });
}
