import { createContext, use } from "react";

import type { SystemAdjust } from "./adjustModel";

/** The adjustment that the run's preview draws before it is written. */
export interface AdjustPreview {
  readonly adjust: SystemAdjust;
  readonly setAdjust: (adjust: SystemAdjust) => void;
}

export const AdjustPreviewContext = createContext<AdjustPreview | null>(null);

/** Returns the adjustment preview of the enclosing run, and null outside a run. */
export function useAdjustPreview(): AdjustPreview | null {
  return use(AdjustPreviewContext);
}
