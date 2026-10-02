import { useVirtualizer } from "@tanstack/react-virtual";
import { type Key, useEffect, useRef, useState } from "react";

import { useRemeasure } from "@/hooks";

import { keepScrollTop, keptScrollTop } from "../state/scrollTops";
import type { DepthRow } from "../utils/stickyTree";
import { useStickyTreeRows } from "./useStickyTreeRows";

interface UseBrowseTreeParams<Row extends DepthRow> {
  rows: readonly Row[];
  rowHeight: number;
  /** Padding above the first row, which the pinned band reads the scroll past. */
  offsetTop: number;
  keyOf: (row: Row) => Key;
  /** Whether the row is a folder whose children follow it. */
  isOpenBranch: (row: Row) => boolean;
  /** Names the tree's scroll so a remount restores it. Absent starts at the top. */
  scrollKey?: string;
}

/**
 * The scroll element, pinned band and virtualizer of a read-only tree.
 *
 * Everything the tree scrolls to itself clears the pinned band rather than landing under it.
 * `items`, `totalSize` and `sticky` are in the shape `VirtualTree` takes. The window is read
 * here, since React Compiler memoizes a caller that reads it off the stable `virtualizer`.
 */
export function useBrowseTree<Row extends DepthRow>({
  rows,
  rowHeight,
  offsetTop,
  keyOf,
  isOpenBranch,
  scrollKey,
}: UseBrowseTreeParams<Row>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [initialOffset] = useState(() => (scrollKey ? keptScrollTop(scrollKey) : 0));

  /* The live element rather than one captured at mount, because where it ended
     up is the whole point of reading it here. */
  useEffect(() => {
    if (!scrollKey) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => keepScrollTop(scrollKey, scrollRef.current?.scrollTop ?? 0);
  }, [scrollKey]);

  const { sticky, height } = useStickyTreeRows({
    rows,
    scrollElementRef: scrollRef,
    rowHeight,
    offsetTop,
    isOpenBranch,
  });

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
    getItemKey: (index) => keyOf(rows[index]!),
    initialOffset,
    scrollPaddingStart: height,
  });
  useRemeasure(virtualizer, rowHeight);

  return {
    scrollRef,
    virtualizer,
    items: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
    sticky: { rows: sticky, height },
  };
}
