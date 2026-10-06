import type { PropertyEdit } from "@/lib/tauri";

import { subtreeOf, type ViewTree } from "../model/tree";
import { unlistEdit } from "./elementEdits";

/** What deleting a selection takes out of a view. */
export interface Deletion {
  /** The objects removed: each selected element of the file, and everything under a group. */
  readonly removed: readonly string[];
  /** The edits that take the removed elements out of the `Elements` of every group that stays. */
  readonly unlisted: readonly PropertyEdit[];
}

/**
 * The deletion of `selection`, per "Interaction" in docs/plans/atlas-ui-editor.md. A group goes
 * with everything under it, as it moves with it. A copy the controller makes at run time is no
 * object of the file, so it is left out.
 */
export function deletionOf(tree: ViewTree, selection: readonly string[]): Deletion {
  const removed = new Set<string>();
  for (const key of selection) {
    if (!tree.elements.has(key)) continue;

    for (const each of subtreeOf(tree, key)) removed.add(each);
  }

  const unlisted: PropertyEdit[] = [];
  for (const group of tree.elements.values()) {
    if (group.look.kind !== "group" || removed.has(group.key)) continue;

    const gone = group.look.children.flatMap((child, at) => (removed.has(child) ? [at] : []));
    if (gone.length > 0) unlisted.push(unlistEdit(group.key, gone));
  }
  return { removed: [...removed], unlisted };
}
