import type { LayerStep } from "../engine/edit/targets";
import type { PixelRect } from "../engine/layout/solve";
import { type ViewTransformControl, ZOOM_STEP } from "./useViewTransform";

/** The canvas's keys as its tooltips and its shortcut list draw them. */
export const CANVAS_KEYS = {
  frame: "F",
  fit: "0",
  actual: "1",
  zoomIn: "=",
  zoomOut: "-",
  nudge: "←↑↓→",
  nudgeFar: "Shift+←↑↓→",
  forward: "]",
  backward: "[",
  front: "Shift+]",
  back: "Shift+[",
  pan: "Space",
  delete: "Del",
  clear: "Esc",
} as const;

export interface KeyTargets {
  readonly transform: ViewTransformControl;
  readonly selected: PixelRect | null;
  readonly clear: () => void;
  readonly nudge: (dx: number, dy: number) => void;
  /** Move the primary selection along its siblings' draw order. */
  readonly arrange: (step: LayerStep) => void;
  /** Delete the selection. */
  readonly remove: () => void;
}

/** Run the canvas's action for `key`, and answer whether it had one. */
export function canvasKey(
  key: string,
  { transform, selected, clear, nudge, arrange, remove }: KeyTargets,
): boolean {
  switch (key) {
    case "f":
    case "F":
      if (selected === null) transform.fit();
      else transform.frame(selected);
      return true;
    case "0":
      transform.fit();
      return true;
    case "1":
      transform.zoomTo(1);
      return true;
    case "=":
    case "+":
      transform.zoomBy(ZOOM_STEP);
      return true;
    case "-":
      transform.zoomBy(1 / ZOOM_STEP);
      return true;
    case "ArrowLeft":
      nudge(-1, 0);
      return true;
    case "ArrowRight":
      nudge(1, 0);
      return true;
    case "ArrowUp":
      nudge(0, -1);
      return true;
    case "ArrowDown":
      nudge(0, 1);
      return true;
    case "]":
      arrange("forward");
      return true;
    case "[":
      arrange("backward");
      return true;
    case "}":
      arrange("front");
      return true;
    case "{":
      arrange("back");
      return true;
    case "Delete":
    case "Backspace":
      remove();
      return true;
    case "Escape":
      clear();
      return true;
    default:
      return false;
  }
}
