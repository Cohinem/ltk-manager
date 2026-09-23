import { useCallback } from "react";

import { filesDocument } from "../../documents";
import { pathAncestors } from "../../shared/utils/pathAncestors";
import { useOpenDocument, useOpenLayerDirs, useRevealInTree } from "../../state";

/**
 * Open a layer's files and focus the row at `path`.
 *
 * "Reveal in Files" in docs/ux/PROJECT_EDITOR.md. The tree it scrolls is the
 * layer's own document, so the document is opened before the request lands.
 */
export function useRevealInLayerFiles(): (layerName: string, path: string) => void {
  const openDocument = useOpenDocument();
  const openDirs = useOpenLayerDirs();
  const reveal = useRevealInTree();

  return useCallback(
    (layerName, path) => {
      openDocument(filesDocument(layerName));
      openDirs(layerName, pathAncestors(path));
      reveal(layerName, path);
    },
    [openDocument, openDirs, reveal],
  );
}
