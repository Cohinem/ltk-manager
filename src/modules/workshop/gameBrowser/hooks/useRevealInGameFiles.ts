import { useCallback } from "react";

import { useShowSidebarView } from "@/stores";

import { NO_FILTER } from "../../explorer";
import { useExpandGameDirs, useRequestGameReveal, useSetExplorerFilter } from "../../state";
import { EXPLORER_ID } from "../components/GameDocument";
import { ancestorDirs, indexFileId } from "../utils/sourceIndex";

/**
 * Show the game files, open a chunk's directories and focus its row.
 *
 * "Reveal in Files" in docs/ux/PROJECT_EDITOR.md. `path` is the chunk's path
 * inside the install, null for one no hash table names. The tree's filter is
 * cleared, since a row it hides is a reveal that lands on nothing.
 */
export function useRevealInGameFiles(): (pathHash: string, path: string | null) => void {
  const showView = useShowSidebarView();
  const setFilter = useSetExplorerFilter();
  const expand = useExpandGameDirs();
  const request = useRequestGameReveal();

  return useCallback(
    (pathHash, path) => {
      showView("game");
      setFilter(EXPLORER_ID, NO_FILTER);
      expand(ancestorDirs(path));
      request(indexFileId(pathHash));
    },
    [showView, setFilter, expand, request],
  );
}
