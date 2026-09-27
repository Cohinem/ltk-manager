import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { bumpAssetVersions } from "@/lib/assetVersions";
import { api, type LayerFilesChanged } from "@/lib/tauri";
import { useTauriEvent } from "@/lib/useTauriEvent";

import { infoChangedBy, LAYER_FILES_CHANGED } from "../utils/layerChanges";

/**
 * Previews of a project's layer files that follow the files on disk while the project is open.
 *
 * The hook acquires a watch on the project's layers. Each change counts a new version for the
 * files it names, which gives their previews new URLs, and marks their header facts stale. See
 * "A layer file saved from outside" in docs/ux/PROJECT_EDITOR.md.
 */
export function useLayerFileReload(projectPath: string): void {
  const client = useQueryClient();

  useEffect(() => {
    void api.layerWatch.acquire(projectPath).then((result) => {
      if (!result.ok) console.warn("Layer file watch failed:", result.error);
    });

    return () => {
      void api.layerWatch.release(projectPath);
    };
  }, [projectPath]);

  useTauriEvent<LayerFilesChanged>(LAYER_FILES_CHANGED, (change) => {
    bumpAssetVersions(change);
    void client.invalidateQueries({ predicate: (query) => infoChangedBy(query.queryKey, change) });
  });
}
