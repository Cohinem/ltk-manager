import { useMemo } from "react";

import type { ViewTree } from "../engine/model/tree";
import { hiddenScenesOf } from "../engine/model/visibility";
import { useAtlasPreviewStore, useViewPreview } from "../state/atlasPreview";

const NONE: ReadonlySet<string> = new Set();

/** The scenes the preview of `view` draws off, which the canvas and the layers pane share. */
export function useHiddenScenes(tree: ViewTree | null, view: string): ReadonlySet<string> {
  const { flippedScenes } = useViewPreview(view);
  const showDisabled = useAtlasPreviewStore((state) => state.showDisabled);

  return useMemo(
    () => (tree === null ? NONE : hiddenScenesOf(tree, flippedScenes, showDisabled)),
    [tree, flippedScenes, showDisabled],
  );
}
