import type { Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useId, useState } from "react";

/**
 * The row a tree's keyboard stands on, for a tree that names it through `aria-activedescendant`.
 *
 * The row is held by id, so a filter or a fold keeps it where it can. Until a key or a pick
 * names one, the first row stands in and draws no mark. `reveal` stands on a row and scrolls to
 * it once it is among the rows, which is after the fold above it opens.
 */
export function useActiveRow<Row extends { readonly id: string }>(
  rows: readonly Row[],
  virtualizer: Virtualizer<HTMLDivElement, Element>,
) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const idPrefix = useId();

  const found = activeId === null ? -1 : rows.findIndex((row) => row.id === activeId);
  const active = found >= 0 ? found : Math.min(0, rows.length - 1);

  useEffect(() => {
    if (pending === null) return;

    const index = rows.findIndex((row) => row.id === pending);
    if (index < 0) return;

    setPending(null);
    virtualizer.scrollToIndex(index, { align: "auto" });
  }, [pending, rows, virtualizer]);

  const moveTo = (index: number) => {
    const at = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[at];
    if (row === undefined) return;

    setActiveId(row.id);
    virtualizer.scrollToIndex(at, { align: "auto" });
  };

  /** The first key a fresh tree hears shows where the keyboard stands rather than moving it. */
  const stepTo = (index: number) => {
    const current = rows[active];
    if (activeId === null && current !== undefined) {
      setActiveId(current.id);
      return;
    }

    moveTo(index);
  };

  const reveal = (id: string) => {
    setActiveId(id);
    setPending(id);
  };

  return {
    active,
    setActiveId,
    stepTo,
    reveal,
    domId: (index: number) => `${idPrefix}-${index}`,
    activeDescendant: active < 0 ? undefined : `${idPrefix}-${active}`,
    isActive: (index: number) => index === active && activeId !== null,
  };
}

/** The row a movement key goes to from `at`, or null for any other key. */
export function steppedRow(key: string, at: number, count: number, page: number): number | null {
  switch (key) {
    case "ArrowDown":
      return at + 1;
    case "ArrowUp":
      return at - 1;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "PageDown":
      return at + Math.max(page - 1, 1);
    case "PageUp":
      return at - Math.max(page - 1, 1);
    default:
      return null;
  }
}
