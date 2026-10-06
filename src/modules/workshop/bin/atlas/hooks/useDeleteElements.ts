import { useCallback } from "react";

import { deletionOf } from "../engine/edit/deleteElements";
import type { ViewTree } from "../engine/model/tree";
import { useAtlasEdit } from "../state/atlasEdit";
import { useAtlasPreviewActions } from "../state/atlasPreview";
import { useObjectBlock } from "./useObjectBlock";

export interface ElementDeleter {
  /** Whether the scene bin removes an object. */
  readonly available: boolean;
  /** Delete the elements `keys` and everything under each group among them. */
  readonly run: (keys: readonly string[]) => Promise<void>;
}

/**
 * Deleting elements of the view `view`, whose tree is `tree`, per "Interaction" in
 * docs/plans/atlas-ui-editor.md.
 *
 * The groups that stay drop the deleted elements from their `Elements` as one undo step, and
 * each object's removal is a step of its own after it. The selection is cleared.
 */
export function useDeleteElements(view: string, tree: ViewTree | null): ElementDeleter {
  const edit = useAtlasEdit();
  const available = useObjectBlock(view).block === null;
  const { select } = useAtlasPreviewActions();

  const run = useCallback(
    async (keys: readonly string[]) => {
      if (edit === null || tree === null || !available) return;

      const { removed, unlisted } = deletionOf(tree, keys);
      if (removed.length === 0) return;

      select(view, null);
      if (await edit.apply(unlisted)) await edit.remove(removed);
    },
    [edit, tree, available, view, select],
  );

  return { available, run };
}
