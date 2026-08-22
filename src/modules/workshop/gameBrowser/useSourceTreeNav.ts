import type { Virtualizer } from "@tanstack/react-virtual";
import { type KeyboardEvent, type RefObject, useCallback, useEffect, useState } from "react";

import type { SourceDirNode, SourceFileNode, SourceRow, SourceTreeNode } from "./sourceIndex";
import type { ExtractHow } from "./useExtractActions";

function expandable(node: SourceTreeNode): node is SourceDirNode {
  return node.type === "dir";
}

interface UseSourceTreeNavParams {
  rows: readonly SourceRow[];
  isExpanded: (node: SourceDirNode) => boolean;
  onToggle: (node: SourceDirNode) => void;
  /** The keyboard route to what a double click on a file row does. */
  onOpen?: (node: SourceFileNode) => void;
  /** The keyboard route to the focused row's own extract items. */
  onRun?: (node: SourceTreeNode, how: ExtractHow) => void;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollElementRef: RefObject<HTMLDivElement | null>;
}

interface UseSourceTreeNavReturn {
  focusedIndex: number;
  setFocusedIndex: (i: number) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Roving-tabindex keyboard navigation for the virtualized source tree.
 *
 * The same key rules as the layer file tree's `useContentTreeNav`, retargeted
 * at the source row model.
 */
export function useSourceTreeNav({
  rows,
  isExpanded,
  onToggle,
  onOpen,
  onRun,
  virtualizer,
  scrollElementRef,
}: UseSourceTreeNavParams): UseSourceTreeNavReturn {
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    setFocusedIndex((i) => (rows.length === 0 ? 0 : Math.max(0, Math.min(i, rows.length - 1))));
  }, [rows.length]);

  const moveFocus = useCallback(
    (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(nextIndex, rows.length - 1));
      setFocusedIndex(clamped);
      virtualizer.scrollToIndex(clamped, { align: "auto", behavior: "auto" });
      requestAnimationFrame(() => {
        /* Scoped to the rows themselves: the pinned band carries a second copy
           of an ancestor row under the same index, and it is not the one to
           focus. */
        const el = scrollElementRef.current?.querySelector<HTMLElement>(
          `[data-tree-rows] [data-treeitem-index="${clamped}"]`,
        );
        el?.focus();
      });
    },
    [rows.length, virtualizer, scrollElementRef],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const row = rows[focusedIndex];
      if (!row) return;
      const node = row.node;

      /* Before the switch, because the plain keys are already spoken for and a
         modifier has to be read rather than fallen through to. `Ctrl+E` is
         whichever extract needs no dialog, and Shift asks for the dialog. */
      if (onRun && (e.ctrlKey || e.metaKey)) {
        const key = e.key.toLowerCase();
        if (key === "e") {
          e.preventDefault();
          onRun(node, e.shiftKey ? "dialog" : "quick");
          return;
        }
        if (key === "i") {
          e.preventDefault();
          onRun(node, "copy");
          return;
        }
      }

      switch (e.key) {
        /* Enter opens, the way a double click does. A keyboard user who asked
           for a file by name meant to open it. */
        case "Enter":
          if (node.type === "file") {
            e.preventDefault();
            onOpen?.(node);
          } else if (expandable(node)) {
            e.preventDefault();
            onToggle(node);
          }
          return;
        case "ArrowDown":
          e.preventDefault();
          moveFocus(focusedIndex + 1);
          return;
        case "ArrowUp":
          e.preventDefault();
          moveFocus(focusedIndex - 1);
          return;
        case "Home":
          e.preventDefault();
          moveFocus(0);
          return;
        case "End":
          e.preventDefault();
          moveFocus(rows.length - 1);
          return;
        case "ArrowRight":
          if (expandable(node)) {
            e.preventDefault();
            if (!isExpanded(node)) onToggle(node);
            else moveFocus(focusedIndex + 1);
          }
          return;
        case "ArrowLeft":
          if (expandable(node) && isExpanded(node)) {
            e.preventDefault();
            onToggle(node);
          } else if (row.depth > 0) {
            e.preventDefault();
            for (let i = focusedIndex - 1; i >= 0; i--) {
              if (rows[i]!.depth < row.depth) {
                moveFocus(i);
                break;
              }
            }
          }
          return;
      }
    },
    [rows, focusedIndex, isExpanded, onToggle, onOpen, onRun, moveFocus],
  );

  return { focusedIndex, setFocusedIndex, handleKeyDown };
}
