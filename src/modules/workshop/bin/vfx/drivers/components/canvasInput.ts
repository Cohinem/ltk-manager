import { type CSSProperties, type RefObject, useMemo } from "react";

import type { GraphActions } from "./graphActions";

/** Returns `actions` with each fold marking its node as the one that the view keeps still. */
export function useAnchoredActions(
  actions: GraphActions | null,
  anchor: RefObject<string | null>,
): GraphActions | null {
  return useMemo(
    () =>
      actions === null
        ? null
        : {
            ...actions,
            toggleCollapsed: (id) => {
              anchor.current = id;
              actions.toggleCollapsed(id);
            },
            collapseOthers: (item) => {
              anchor.current = item.id;
              actions.collapseOthers(item);
            },
          },
    [actions, anchor],
  );
}

export const PRO_OPTIONS = { hideAttribution: true } as const;

/** The buttons a drag on empty canvas pans with: the primary and the middle. */
export const PAN_BUTTONS = [0, 1];

/** The key a drag on empty canvas holds to draw a selection box instead of panning. */
export const BOX_KEY = "Shift";

/** The keys a click or a box holds to add to the selection rather than replace it. */
export const ADD_KEYS = ["Shift", "Control", "Meta"];

/* DS-TOKEN: the selection box and the box around a picked group, in the accent. */
export const SELECTION_STYLE = {
  "--xy-selection-background-color": "color-mix(in srgb, var(--color-accent-500) 10%, transparent)",
  "--xy-selection-border": "1px solid color-mix(in srgb, var(--color-accent-400) 70%, transparent)",
} as CSSProperties;

const CONTROLS = ".nodrag, button, input, select, textarea, [role='spinbutton'], [role='slider']";

/**
 * Whether a pointer lands in a node's fields or controls, where two quick presses nudge a
 * value twice rather than reveal the node's row.
 */
export function inControl(target: EventTarget): boolean {
  return target instanceof Element && target.closest(CONTROLS) !== null;
}

/** Whether a key lands in a field of a node, whose own keys Select all must leave alone. */
export function typing(target: EventTarget): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.closest("input, textarea, select") !== null)
  );
}
