import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useSetZoomLevel, useZoomLevel, VALID_ZOOM_LEVELS } from "@/stores";

const DEFAULT_ZOOM = 100;

/* Zoom answers from anywhere, a focused field included. An app that stops
   zooming because a search box has focus reads as broken rather than careful. */
const OPTIONS = {
  preventDefault: true,
  enableOnFormTags: true,
  enableOnContentEditable: true,
};

/**
 * Binds ctrl with plus, minus and zero to the zoom setting.
 *
 * A step moves one entry along `VALID_ZOOM_LEVELS` rather than by a percentage
 * of its own, so the keys and the Appearance dropdown can never disagree about
 * what the steps are, and the ends clamp instead of wrapping. Both rows of the
 * keyboard are bound because the numpad reports codes of its own.
 */
export function useZoomHotkeys(): void {
  const zoomLevel = useZoomLevel();
  const setZoomLevel = useSetZoomLevel();

  const step = useCallback(
    (direction: 1 | -1) => {
      const next = VALID_ZOOM_LEVELS[VALID_ZOOM_LEVELS.indexOf(zoomLevel) + direction];
      if (next !== undefined) setZoomLevel(next);
    },
    [zoomLevel, setZoomLevel],
  );

  useHotkeys("ctrl+equal, ctrl+numpadadd", () => step(1), OPTIONS, [step]);
  useHotkeys("ctrl+minus, ctrl+numpadsubtract", () => step(-1), OPTIONS, [step]);
  useHotkeys("ctrl+0, ctrl+numpad0", () => setZoomLevel(DEFAULT_ZOOM), OPTIONS, [setZoomLevel]);
}
