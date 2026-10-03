import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect } from "react";

/**
 * Measure `virtualizer` again whenever `sizeKey` changes.
 *
 * `estimateSize` is not one of the inputs the measurement memo watches, so sizes cached at an old
 * zoom or row height outlive a change to it. `sizeKey` is what the estimate reads: the row height,
 * or the zoom an estimate per index scales by.
 *
 * React Compiler skips memoizing a function only where it sees the `useVirtualizer` call, so the
 * function holding that call also reads the window, as `useBrowseTree` and `useRowWindow` do.
 */
export function useRemeasure(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  sizeKey: unknown,
): void {
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, sizeKey]);
}
