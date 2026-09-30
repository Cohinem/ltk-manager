import { useMemo } from "react";

import { type Board, boardOf } from "../engine/layout/board";
import type { Screen } from "../engine/layout/solve";
import type { ViewTree } from "../engine/model/tree";
import { useFrameSettings, useViewPreview } from "../state/atlasPreview";
import { useHiddenScenes } from "./useHiddenScenes";

/**
 * The frames the canvas of `view` draws its scenes on, which the canvas and the scene menu share.
 * `stacked` draws every scene on one screen whatever the toolbar says.
 */
export function useBoard(
  tree: ViewTree | null,
  screen: Screen,
  view: string,
  stacked = false,
): Board | null {
  const hiddenScenes = useHiddenScenes(tree, view);
  const { stackScenes } = useFrameSettings();
  const { frames } = useViewPreview(view);

  return useMemo(
    () =>
      tree === null ? null : boardOf(tree, screen, hiddenScenes, stacked || stackScenes, frames),
    [tree, screen, hiddenScenes, stacked, stackScenes, frames],
  );
}
