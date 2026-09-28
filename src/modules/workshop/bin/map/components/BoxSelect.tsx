import { type RefObject, useEffect, useState } from "react";

import { modeOf, type ScreenRect, type SelectMode } from "../utils/mapSelection";

/** How far a press moves before it draws a box rather than clicking, in pixels. */
const DRAG_START = 4;

export interface BoxSelectProps {
  /** The viewport's box, which the tool takes the primary button of while it is on. */
  readonly target: RefObject<HTMLElement | null>;
  readonly active: boolean;
  /** A box drawn, in client pixels, or a click as a box of no size. */
  readonly onBox: (rect: ScreenRect, mode: SelectMode) => void;
}

/**
 * The viewport's box select: a primary drag draws a box, and a primary click picks what is
 * under it. Shift adds to the selection and Ctrl flips what the box holds.
 *
 * The press is taken in the capture phase, before the camera controls under it hear it, so
 * the other buttons and the wheel still move the camera.
 */
export function BoxSelect({ target, active, onBox }: BoxSelectProps) {
  const [drawn, setDrawn] = useState<ScreenRect | null>(null);

  useEffect(() => {
    const element = target.current;
    if (!active || element === null) return;

    let origin: { x: number; y: number; id: number } | null = null;
    let dragging = false;
    const rectTo = (x: number, y: number): ScreenRect => ({
      left: Math.min(origin?.x ?? x, x),
      top: Math.min(origin?.y ?? y, y),
      right: Math.max(origin?.x ?? x, x),
      bottom: Math.max(origin?.y ?? y, y),
    });

    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !isScene(event.target, element)) return;

      event.stopPropagation();
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      origin = { x: event.clientX, y: event.clientY, id: event.pointerId };
      dragging = false;
    };
    const move = (event: PointerEvent) => {
      if (origin === null || event.pointerId !== origin.id) return;

      event.stopPropagation();
      dragging ||= Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > DRAG_START;
      if (dragging) setDrawn(rectTo(event.clientX, event.clientY));
    };
    const up = (event: PointerEvent) => {
      if (origin === null || event.pointerId !== origin.id) return;

      event.stopPropagation();
      onBox(rectTo(event.clientX, event.clientY), modeOf(event));
      origin = null;
      setDrawn(null);
    };

    element.addEventListener("pointerdown", down, true);
    element.addEventListener("pointermove", move, true);
    element.addEventListener("pointerup", up, true);
    element.addEventListener("pointercancel", up, true);
    return () => {
      element.removeEventListener("pointerdown", down, true);
      element.removeEventListener("pointermove", move, true);
      element.removeEventListener("pointerup", up, true);
      element.removeEventListener("pointercancel", up, true);
      setDrawn(null);
    };
  }, [target, active, onBox]);

  if (drawn === null) return null;

  const bounds = target.current?.getBoundingClientRect();
  return (
    <div
      aria-hidden
      /* DS-TOKEN: the selection box in the accent, as the graph's is. */
      className="pointer-events-none absolute z-20 rounded-xs border border-accent-400/80 bg-accent-500/10"
      style={{
        left: drawn.left - (bounds?.left ?? 0),
        top: drawn.top - (bounds?.top ?? 0),
        width: drawn.right - drawn.left,
        height: drawn.bottom - drawn.top,
      }}
    />
  );
}

/** Whether a press lands on the scene itself rather than on the controls drawn over it. */
function isScene(target: EventTarget | null, box: HTMLElement): boolean {
  return target instanceof HTMLCanvasElement && box.contains(target);
}
