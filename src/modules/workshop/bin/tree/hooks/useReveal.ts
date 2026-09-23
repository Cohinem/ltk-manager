import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { BinRow } from "@/lib/tauri";

import { ancestorKeys, isUnder, type LoadedChildren, revealPage, rowKey } from "../utils/binRows";

/** A row the tree is asked to expand, focus and scroll to. A new request scrolls again. */
export interface TreeReveal {
  readonly key: string;
  readonly token: number;
}

/** The row a reveal landed on, until a reader moves. */
export interface Revealed {
  readonly focused: string | null;
  readonly clearFocus: () => void;
}

/** What a reveal reads and changes of the tree it opens. */
export interface RevealTree {
  readonly roots: readonly BinRow[];
  readonly loaded: ReadonlyMap<string, LoadedChildren>;
  readonly expand: (keys: Iterable<string>) => void;
  /** Ask a node with `loadedCount` rows answered for its next page. */
  readonly requestMore: (parent: string, loadedCount: number) => void;
  readonly scrollToKey: (key: string) => boolean;
}

/**
 * The row a reveal opens down to, focuses and scrolls to.
 *
 * Every level above the row opens, and a level whose answered pages end before the next
 * key down asks for its next page, so a row past a page boundary is reached too. The
 * scroll waits for the line to exist. A request for a row this tree does not hold is left
 * alone.
 */
export function useReveal(
  reveal: TreeReveal | null,
  { roots, loaded, expand, requestMore, scrollToKey }: RevealTree,
): Revealed {
  const [focused, setFocused] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<TreeReveal | null>(null);

  const ancestors = useMemo(() => {
    if (reveal === null) return [];
    return ancestorKeys(reveal.key).filter((key) => roots.some((row) => isUnder(rowKey(row), key)));
  }, [reveal, roots]);

  useEffect(() => {
    if (reveal === null || ancestors.length === 0) return;
    expand(ancestors);
    setFocused(reveal.key);
    setScrollTo(reveal);
  }, [reveal, ancestors, expand]);

  const page = scrollTo === null ? null : revealPage(ancestors, (key) => loaded.get(key));
  const pageParent = page?.parent ?? null;
  const pageLoaded = page?.loaded ?? 0;
  useEffect(() => {
    if (pageParent !== null) requestMore(pageParent, pageLoaded);
  }, [pageParent, pageLoaded, requestMore]);

  /* Keyed on the request itself, so a second request for the same row scrolls again. */
  const scrolled = useRef<TreeReveal | null>(null);
  useEffect(() => {
    if (scrollTo === null || scrolled.current === scrollTo) return;
    if (scrollToKey(scrollTo.key)) scrolled.current = scrollTo;
  }, [scrollTo, scrollToKey]);

  const clearFocus = useCallback(() => setFocused(null), []);

  return { focused, clearFocus };
}
