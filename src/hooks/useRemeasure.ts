import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect } from "react";

/**
 * Measure `virtualizer` again whenever `sizeKey` changes.
 *
 * `estimateSize` is not one of the inputs the measurement memo watches, so sizes cached at an old
 * zoom or row height outlive a change to it. `sizeKey` is what the estimate reads: the row height,
 * or the zoom an estimate per index scales by.
 *
 * The virtualizer stays a direct `useVirtualizer` call in the component, since React Compiler
 * skips memoizing a component only where it sees that call.
 */
export function useRemeasure(
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  sizeKey: unknown,
): void {
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, sizeKey]);
}
