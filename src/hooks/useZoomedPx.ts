import { useCallback } from "react";

import { useZoomLevel } from "@/stores";

/**
 * Scales a px length to the zoom setting.
 */
export function useZoomedPx(): (px: number) => number {
  const zoomLevel = useZoomLevel();

  return useCallback((px: number) => Math.round((px * zoomLevel) / 100), [zoomLevel]);
}
