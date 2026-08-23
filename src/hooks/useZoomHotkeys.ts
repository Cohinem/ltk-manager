import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useSetZoomLevel, useZoomLevel, ZOOM_STEP } from "@/stores";

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
 * A press moves by `ZOOM_STEP`, the same grid the Appearance slider runs on, so
 * the two can never disagree about what a step is. The store clamps, so the ends
 * stop rather than wrap. Both rows of the keyboard are bound because the numpad
 * reports codes of its own.
 */
export function useZoomHotkeys(): void {
  const zoomLevel = useZoomLevel();
  const setZoomLevel = useSetZoomLevel();

  const step = useCallback(
    (direction: 1 | -1) => setZoomLevel(zoomLevel + direction * ZOOM_STEP),
    [zoomLevel, setZoomLevel],
  );

  useHotkeys("ctrl+equal, ctrl+numpadadd", () => step(1), OPTIONS, [step]);
  useHotkeys("ctrl+minus, ctrl+numpadsubtract", () => step(-1), OPTIONS, [step]);
  useHotkeys("ctrl+0, ctrl+numpad0", () => setZoomLevel(DEFAULT_ZOOM), OPTIONS, [setZoomLevel]);
}
