import type { Virtualizer } from "@tanstack/react-virtual";
import { type KeyboardEvent, type RefObject, useCallback, useEffect, useState } from "react";

import type { OpenIntent } from "../palette/types";
import { activation, expandable, type ObjectTreeNode, type ObjectTreeRow } from "./objectTree";

interface UseObjectsTreeNavParams {
  rows: readonly ObjectTreeRow[];
  isExpanded: (node: ObjectTreeNode) => boolean;
  onToggle: (node: ObjectTreeNode) => void;
  /** The keyboard route to what a click on an object row does. */
  onOpen: (node: ObjectTreeNode, intent: OpenIntent) => void;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollElementRef: RefObject<HTMLDivElement | null>;
}

interface UseObjectsTreeNavReturn {
  focusedIndex: number;
  setFocusedIndex: (i: number) => void;
  /** Focus the row at `index`, scrolled into view. */
  moveFocus: (index: number) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Roving-tabindex keyboard navigation for the objects tree.
 *
 * The source tree's key rules, retargeted at the object row model. `Enter` opens an
 * object and toggles a prefix. A node that is both opens on `Enter` and expands from
 * `ArrowRight` alone, the rule a click obeys.
 */
export function useObjectsTreeNav({
  rows,
  isExpanded,
  onToggle,
  onOpen,
  virtualizer,
  scrollElementRef,
}: UseObjectsTreeNavParams): UseObjectsTreeNavReturn {
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

      switch (e.key) {
        case "Enter": {
          const does = activation(node, "row");
          if (does === "open") {
            e.preventDefault();
            onOpen(node, e.ctrlKey || e.metaKey ? "beside" : "default");
          } else if (does === "toggle") {
            e.preventDefault();
            onToggle(node);
          }
          return;
        }
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
    [rows, focusedIndex, isExpanded, onToggle, onOpen, moveFocus],
  );

  return { focusedIndex, setFocusedIndex, moveFocus, handleKeyDown };
}
