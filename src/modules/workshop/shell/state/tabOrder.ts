/* The layout sub-barrel rather than the module barrel: the full barrel pulls
   the editor's components, whose imports circle back into workshop state. */
// eslint-disable-next-line no-restricted-imports -- the cycle the comment above names
import type { LayoutNode, LeafNode } from "@/modules/editor/layout";

/**
 * One strip's ids with the pinned ones first, each side keeping its own order.
 *
 * The invariant every other helper here relies on: a leaf's pinned tabs are a
 * prefix of its strip, so the divider between the two has tabs of one kind on
 * each side of it.
 */
export function pinnedFirst(tabs: readonly string[], pinned: readonly string[]): string[] {
  return [
    ...tabs.filter((id) => pinned.includes(id)),
    ...tabs.filter((id) => !pinned.includes(id)),
  ];
}

/**
 * One strip's ids with `documentId` moved to the boundary of the pinned run.
 *
 * The same index serves both directions. A pin lands at the end of the run and
 * an unpin in the first slot after it, which is where the tab that just
 * changed sides is closest to where it was.
 */
export function atPinnedBoundary(
  leaf: LeafNode,
  documentId: string,
  pinned: readonly string[],
): string[] {
  const rest = leaf.tabs.filter((id) => id !== documentId);
  const boundary = rest.filter((id) => pinned.includes(id)).length;

  const ids = [...rest];
  ids.splice(boundary, 0, documentId);
  return ids;
}

/**
 * Where a tab may land in a strip, given which side of the divider it is on.
 *
 * A pinned tab stays inside the run and an unpinned one stays out of it, so a
 * drop that aimed across the divider settles against it rather than through it.
 */
export function clampToPinnedRun(
  tabs: readonly string[],
  documentId: string,
  index: number,
  pinned: readonly string[],
): number {
  const rest = tabs.filter((id) => id !== documentId);
  const boundary = rest.filter((id) => pinned.includes(id)).length;
  return pinned.includes(documentId) ? Math.min(index, boundary) : Math.max(index, boundary);
}

/*
 * Rewrite one strip in the order a drag settled on. Lives here rather than in
 * the tree module because it is the one op with a store-shaped guard: a drop
 * that started before a close lands with a stale list, which would drop
 * whatever the two disagree about, so a list that is not a permutation of the
 * strip keeps the strip.
 */
export function reorderLeafTabs(
  node: LayoutNode,
  leafId: string,
  ids: readonly string[],
): LayoutNode {
  if (node.kind === "leaf") {
    if (node.id !== leafId) return node;
    if (ids.length !== node.tabs.length || !ids.every((id) => node.tabs.includes(id))) return node;
    if (ids.every((id, index) => node.tabs[index] === id)) return node;
    return { ...node, tabs: [...ids] };
  }

  let changed = false;
  const children = node.children.map((child) => {
    const next = reorderLeafTabs(child, leafId, ids);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}
