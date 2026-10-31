import { useEffect, useRef } from "react";

/**
 * Calls `reset` when `count` changes after mount.
 *
 * Choices keyed by list index use it, because a removal or an undo moves every index behind it
 * and a count alone cannot say which.
 */
export function useResetOnChange(count: number, reset: () => void): void {
  const seen = useRef(count);

  useEffect(() => {
    if (seen.current === count) return;

    seen.current = count;
    reset();
  }, [count, reset]);
}
