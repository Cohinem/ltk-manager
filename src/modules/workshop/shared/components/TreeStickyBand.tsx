import type { ReactNode } from "react";

interface TreeStickyBandProps {
  /** What the band covers, from `useStickyTreeRows`. */
  height: number;
  children: ReactNode;
}

/**
 * The band of pinned ancestor rows at the top of a scrolled file tree.
 *
 * Sticky inside the scrollport rather than an overlay beside it, so it stays
 * within the tree's own context menu trigger and needs no second element to
 * position against. It carries no height of its own - the rows inside are
 * placed against its top edge by `useStickyTreeRows`, which also sizes the
 * ground they sit on.
 */
export function TreeStickyBand({ height, children }: TreeStickyBandProps) {
  if (height <= 0) return null;
  return (
    <div data-ui="TreeStickyBand" className="sticky top-0 z-10 h-0">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 bg-surface-950 shadow-md"
        style={{ height: `${height}px` }}
      />
      {children}
    </div>
  );
}
