import type { KeyboardEvent } from "react";

import type { ExplorerSelectionApi } from "../hooks/useExplorer";

/** How a keyboard extract runs: with no dialog, through the dialog, or as a copy into a layer. */
export type ExtractKeyHow = "quick" | "dialog" | "copy";

interface SelectionKeyTargets {
  /** The selection the keys act on. A view without one answers only the extract keys. */
  selection?: ExplorerSelectionApi;
  /** The selection id of the focused item, which `Ctrl+Space` toggles. */
  focusedId: string | null;
  onRun?: (how: ExtractKeyHow) => void;
}

/**
 * The selection and extract keys every explorer view answers, returning whether it took `event`.
 *
 * `Ctrl+A` selects everything on screen, `Ctrl+Space` toggles the focused item and `Escape`
 * clears. `Ctrl+E` extracts with no dialog, `Ctrl+Shift+E` through the dialog and `Ctrl+I`
 * copies into a layer.
 */
export function handleSelectionKey(
  event: KeyboardEvent<HTMLElement>,
  { selection, focusedId, onRun }: SelectionKeyTargets,
): boolean {
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase();
    if (onRun && key === "e") {
      event.preventDefault();
      onRun(event.shiftKey ? "dialog" : "quick");
      return true;
    }

    if (onRun && key === "i") {
      event.preventDefault();
      onRun("copy");
      return true;
    }

    if (selection && key === "a") {
      event.preventDefault();
      selection.selectAll();
      return true;
    }

    if (selection && key === " ") {
      event.preventDefault();
      if (focusedId !== null) selection.select(focusedId, { toggle: true, extend: false });
      return true;
    }
  }

  if (selection && event.key === "Escape") {
    event.preventDefault();
    selection.clear();
    return true;
  }

  return false;
}
