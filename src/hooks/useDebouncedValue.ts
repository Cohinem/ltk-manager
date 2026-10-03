import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * The first render returns `initial`, which is `value` unless the caller waits out the delay
 * for the first value too.
 */
export function useDebouncedValue<T>(value: T, delayMs = 200, initial: T = value): T {
  const [debounced, setDebounced] = useState(initial);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
