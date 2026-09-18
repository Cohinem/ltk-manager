/* The layout sub-barrel rather than the module barrel: the full barrel pulls
   the editor's components, whose imports circle back into workshop state. */
// eslint-disable-next-line no-restricted-imports -- the cycle the comment above names
import { findLeaf, type LayoutNode } from "@/modules/editor/layout";

/** The ephemeral tab of each editor group, as leaf id to document id. */
export type PreviewIds = Readonly<Record<string, string>>;

/**
 * The map with `leafId` holding `documentId` as its ephemeral tab.
 *
 * Returns the map itself where it already says so, so an open that changes no
 * role leaves the persisted slice comparing equal.
 */
export function withPreview(held: PreviewIds, leafId: string, documentId: string): PreviewIds {
  if (held[leafId] === documentId) return held;
  return { ...held, [leafId]: documentId };
}

/** The map without whichever group's entry names `documentId`, and itself where none does. */
export function withoutPreviewDocument(held: PreviewIds, documentId: string): PreviewIds {
  const entries = Object.entries(held).filter(([, id]) => id !== documentId);
  if (entries.length === Object.keys(held).length) return held;
  return Object.fromEntries(entries);
}

/** The map without every entry naming a leaf `layout` has lost, and itself where none is. */
export function withHeldLeaves(held: PreviewIds, layout: LayoutNode): PreviewIds {
  const entries = Object.entries(held).filter(([leafId]) => findLeaf(layout, leafId) !== null);
  if (entries.length === Object.keys(held).length) return held;
  return Object.fromEntries(entries);
}
