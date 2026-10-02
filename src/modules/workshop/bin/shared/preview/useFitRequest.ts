import { useCallback, useState } from "react";

/** A camera fit as a token bumped per ask, which `FitCamera` frames again on, and the ask. */
export function useFitRequest() {
  const [token, setToken] = useState(0);
  const request = useCallback(() => setToken((held) => held + 1), []);

  return [token, request] as const;
}
