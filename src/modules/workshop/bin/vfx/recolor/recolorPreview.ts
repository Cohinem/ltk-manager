import { createContext, use } from "react";

/** The hue turn that the run's preview draws before it is written. */
export interface RecolorPreview {
  /** The turn in degrees, 0 for the authored colors. */
  readonly hue: number;
  readonly setHue: (hue: number) => void;
}

export const RecolorPreviewContext = createContext<RecolorPreview | null>(null);

/** Returns the recolor preview of the enclosing run, and null outside a run. */
export function useRecolorPreview(): RecolorPreview | null {
  return use(RecolorPreviewContext);
}
