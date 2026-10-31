import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { LayerStep } from "../engine/edit/targets";
import type { PixelRect } from "../engine/layout/solve";
import { type ViewTransformControl, ZOOM_STEP } from "./useViewTransform";

/** An action that a key of the focused canvas runs. */
export type CanvasAction =
  | "frame"
  | "fit"
  | "actual"
  | "zoomIn"
  | "zoomOut"
  | "nudgeLeft"
  | "nudgeRight"
  | "nudgeUp"
  | "nudgeDown"
  | "forward"
  | "backward"
  | "front"
  | "back"
  | "delete"
  | "clear";

/** The word that a surface shows for each action, and the `KeyboardEvent.key` values it answers. */
export const CANVAS_BINDINGS: Readonly<
  Record<CanvasAction, { readonly shown: string; readonly answers: readonly string[] }>
> = {
  frame: { shown: "F", answers: ["f", "F"] },
  fit: { shown: "0", answers: ["0"] },
  actual: { shown: "1", answers: ["1"] },
  zoomIn: { shown: "=", answers: ["=", "+"] },
  zoomOut: { shown: "-", answers: ["-"] },
  nudgeLeft: { shown: "←", answers: ["ArrowLeft"] },
  nudgeRight: { shown: "→", answers: ["ArrowRight"] },
  nudgeUp: { shown: "↑", answers: ["ArrowUp"] },
  nudgeDown: { shown: "↓", answers: ["ArrowDown"] },
  forward: { shown: "]", answers: ["]"] },
  backward: { shown: "[", answers: ["["] },
  front: { shown: "}", answers: ["}"] },
  back: { shown: "{", answers: ["{"] },
  delete: { shown: "Del", answers: ["Delete", "Backspace"] },
  clear: { shown: "Esc", answers: ["Escape"] },
};

/** The keys that the canvas's tooltips, shortcut list and menus show. */
export const CANVAS_KEYS = {
  frame: CANVAS_BINDINGS.frame.shown,
  fit: CANVAS_BINDINGS.fit.shown,
  actual: CANVAS_BINDINGS.actual.shown,
  zoomIn: CANVAS_BINDINGS.zoomIn.shown,
  zoomOut: CANVAS_BINDINGS.zoomOut.shown,
  nudge: "←↑↓→",
  nudgeFar: "Shift+←↑↓→",
  forward: CANVAS_BINDINGS.forward.shown,
  backward: CANVAS_BINDINGS.backward.shown,
  front: CANVAS_BINDINGS.front.shown,
  back: CANVAS_BINDINGS.back.shown,
  pan: "Space",
  delete: CANVAS_BINDINGS.delete.shown,
  clear: CANVAS_BINDINGS.clear.shown,
  selectAll: "Ctrl+A",
} as const;

const ACTION_OF_KEY: ReadonlyMap<string, CanvasAction> = new Map(
  (
    Object.entries(CANVAS_BINDINGS) as [CanvasAction, (typeof CANVAS_BINDINGS)[CanvasAction]][]
  ).flatMap(([action, binding]) => binding.answers.map((key) => [key, action] as const)),
);

/** The keys that the sprites pane answers on its active row. */
export const SPRITE_KEYS = { replace: "R", export: "E" } as const;

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

/** Runs `action`, for a key of the canvas or an item of its menu bar. */
export function runCanvasAction(
  action: CanvasAction,
  { transform, selected, clear, nudge, arrange, remove }: KeyTargets,
): void {
  switch (action) {
    case "frame":
      if (selected === null) transform.fit();
      else transform.frame(selected);
      return;
    case "fit":
      transform.fit();
      return;
    case "actual":
      transform.zoomTo(1);
      return;
    case "zoomIn":
      transform.zoomBy(ZOOM_STEP);
      return;
    case "zoomOut":
      transform.zoomBy(1 / ZOOM_STEP);
      return;
    case "nudgeLeft":
      nudge(-1, 0);
      return;
    case "nudgeRight":
      nudge(1, 0);
      return;
    case "nudgeUp":
      nudge(0, -1);
      return;
    case "nudgeDown":
      nudge(0, 1);
      return;
    case "forward":
    case "backward":
    case "front":
    case "back":
      arrange(action);
      return;
    case "delete":
      remove();
      return;
    case "clear":
      clear();
      return;
  }
}

/** Runs the canvas's action for `key`, and returns whether it had one. */
export function canvasKey(key: string, targets: KeyTargets): boolean {
  const action = ACTION_OF_KEY.get(key);
  if (action === undefined) return false;

  runCanvasAction(action, targets);
  return true;
}

/** Returns `true` if `event` is the select all chord that `CANVAS_KEYS.selectAll` shows. */
export function isSelectAllKey(event: ReactKeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "a"
  );
}
