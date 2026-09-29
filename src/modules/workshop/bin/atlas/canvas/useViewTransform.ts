import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { PixelRect, Screen } from "../engine/layout/solve";
import type { ViewTransform } from "../rendering/utils/composite";

/** The share of the pane a fitted frame fills, leaving its outline clear of the edges. */
const FIT_SHARE = 0.94;
/** The share of the pane a framed element fills. */
const FRAME_SHARE = 0.6;
/** The share of the pane a fitted target fills. */
const TARGET_SHARE = 0.8;
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 32;
/** How far one wheel notch zooms, as a factor per 100 pixels of delta. */
const WHEEL_STEP = 1.15;
/** How far a zoom button or key steps. */
export const ZOOM_STEP = 1.25;

export interface ViewTransformControl {
  readonly view: ViewTransform;
  /** The frame sits as a fit placed it, and follows the pane until the reader moves it. */
  readonly fitted: boolean;
  /** Fit the frame to the pane, centred. */
  readonly fit: () => void;
  /** Zoom by `factor` about the pane point `x, y`. */
  readonly zoomAt: (x: number, y: number, factor: number) => void;
  /** Zoom by `factor` about the pane's centre. */
  readonly zoomBy: (factor: number) => void;
  /** Zoom to `zoom` about the pane's centre. */
  readonly zoomTo: (zoom: number) => void;
  /** Centre `rect`, in screen pixels, and zoom so it fills a share of the pane. */
  readonly frame: (rect: PixelRect) => void;
  readonly panBy: (dx: number, dy: number) => void;
  /** The screen point under the pane point `x, y`. */
  readonly toScreen: (x: number, y: number) => readonly [number, number];
  /** The wheel handler: zoom about the pointer. */
  readonly onWheel: (event: WheelEvent) => void;
}

/**
 * Where the frame sits in a pane of `pane` pixels, fitted until the reader pans or zooms and
 * fitted again when the screen changes. A fit takes in the whole screen, or `target` where one
 * is given.
 */
export function useViewTransform(
  screen: Screen,
  pane: Screen | null,
  target: PixelRect | null = null,
): ViewTransformControl {
  const [view, setView] = useState<ViewTransform>({ x: 0, y: 0, zoom: 1 });
  const [fitted, setFitted] = useState(true);
  const held = useRef(view);
  held.current = view;
  const moved = useRef(false);

  const move = useCallback((next: (current: ViewTransform) => ViewTransform) => {
    moved.current = true;
    setFitted(false);
    setView(next);
  }, []);

  const fittedView = useCallback((): ViewTransform | null => {
    if (pane === null || pane.width <= 0 || pane.height <= 0) return null;

    const rect = target ?? { x: 0, y: 0, w: screen.width, h: screen.height };
    const w = Math.max(rect.w, 1);
    const h = Math.max(rect.h, 1);
    const share = target === null ? FIT_SHARE : TARGET_SHARE;
    const zoom = clampZoom(Math.min(pane.width / w, pane.height / h) * share);
    return {
      x: pane.width / 2 - (rect.x + w / 2) * zoom,
      y: pane.height / 2 - (rect.y + h / 2) * zoom,
      zoom,
    };
  }, [pane, screen, target]);

  const fit = useCallback(() => {
    const next = fittedView();
    if (next === null) return;

    moved.current = false;
    setFitted(true);
    setView(next);
  }, [fittedView]);

  useLayoutEffect(() => {
    moved.current = false;
    setFitted(true);
  }, [screen.width, screen.height]);

  useLayoutEffect(() => {
    if (moved.current) return;

    const next = fittedView();
    if (next !== null) setView(next);
  }, [fittedView]);

  const zoomAt = useCallback(
    (x: number, y: number, factor: number) => {
      move((current) => {
        const zoom = clampZoom(current.zoom * factor);
        const scale = zoom / current.zoom;
        return { x: x - (x - current.x) * scale, y: y - (y - current.y) * scale, zoom };
      });
    },
    [move],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      if (pane === null) return;
      zoomAt(pane.width / 2, pane.height / 2, factor);
    },
    [pane, zoomAt],
  );

  const zoomTo = useCallback(
    (zoom: number) => zoomBy(clampZoom(zoom) / held.current.zoom),
    [zoomBy],
  );

  const frame = useCallback(
    (rect: PixelRect) => {
      if (pane === null || pane.width <= 0 || pane.height <= 0) return;

      const w = Math.max(rect.w, 1);
      const h = Math.max(rect.h, 1);
      const zoom = clampZoom(Math.min(pane.width / w, pane.height / h) * FRAME_SHARE);
      move(() => ({
        x: pane.width / 2 - (rect.x + w / 2) * zoom,
        y: pane.height / 2 - (rect.y + h / 2) * zoom,
        zoom,
      }));
    },
    [move, pane],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      move((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
    },
    [move],
  );

  const toScreen = useCallback((x: number, y: number) => {
    const current = held.current;
    return [(x - current.x) / current.zoom, (y - current.y) / current.zoom] as const;
  }, []);

  const onWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();
      const target = event.currentTarget as HTMLElement;
      const box = target.getBoundingClientRect();
      zoomAt(
        event.clientX - box.left,
        event.clientY - box.top,
        WHEEL_STEP ** (-event.deltaY / 100),
      );
    },
    [zoomAt],
  );

  return { view, fitted, fit, zoomAt, zoomBy, zoomTo, frame, panBy, toScreen, onWheel };
}

function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}
