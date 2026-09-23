/* The layout sub-barrel rather than the module barrel: the full barrel pulls
   the editor's components, whose imports circle back into workshop state. */
// eslint-disable-next-line no-restricted-imports -- the cycle the comment above names
import {
  type DropOutcome,
  findLeaf,
  type LayoutNode,
  moveTab,
  splitLeaf,
} from "@/modules/editor/layout";

import { firstShellLeafId, type ShellKind } from "../../bin/shell/utils/shellPanes";
import { reorderLeafTabs } from "./tabOrder";

/** The map without `kind`, and the map itself where it holds no pane for one. */
export function withoutShellLeaf(
  held: Readonly<Partial<Record<ShellKind, string>>>,
  kind: ShellKind,
): Readonly<Partial<Record<ShellKind, string>>> {
  if (held[kind] === undefined) return held;

  const rest = { ...held };
  delete rest[kind];
  return rest;
}

/** `leafId` when the tree still holds it, and the first leaf when a prune took it. */
export function heldLeafId(tree: LayoutNode, leafId: string): string {
  return findLeaf(tree, leafId) ? leafId : firstShellLeafId(tree);
}

/**
 * One finished pane drag as a tree and the leaf it left the reader on.
 *
 * The document side spends an action per outcome, because each of them also
 * touches the preview tab or the navigation stack. A pane touches neither, so
 * the three collapse into the one place that reads the resolver's verdict.
 */
export function shellDrop(
  tree: LayoutNode,
  outcome: DropOutcome,
): { tree: LayoutNode; leafId: string } {
  switch (outcome.kind) {
    case "reorder":
      return { tree: reorderLeafTabs(tree, outcome.leafId, outcome.ids), leafId: outcome.leafId };
    case "move":
      return {
        tree: moveTab(tree, outcome.documentId, outcome.toLeafId, outcome.index),
        leafId: outcome.toLeafId,
      };
    case "split": {
      const split = splitLeaf(tree, outcome.targetLeafId, outcome.edge, outcome.documentId);
      return { tree: split.tree, leafId: split.leafId };
    }
  }
}
