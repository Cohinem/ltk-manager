import { useEffect } from "react";

import { staleMarkerKeys } from "../../bin/vfx/timeline/utils/markers";
import { useProjectContentTree } from "../../content/api/useProjectContentTree";
import { useWorkshopEditorStore } from "../state/workshopEditor";

/**
 * Drop the timeline markers of systems whose file or object is gone from the project.
 *
 * Runs when the project's content tree changes, and reads the store's markers then. A
 * marker added before the tree next reads the disk is therefore never checked against a tree
 * that predates its file. `ready` is the editor's hydration, before which there are no markers.
 */
export function usePruneTimelineMarkers(projectPath: string, ready: boolean): void {
  const { data: tree } = useProjectContentTree(ready ? projectPath : undefined);
  const drop = useWorkshopEditorStore((state) => state.dropTimelineMarkers);

  useEffect(() => {
    if (tree === undefined) return;

    const markers = useWorkshopEditorStore.getState().byProject[projectPath]?.markers;
    if (markers === undefined) return;

    const stale = staleMarkerKeys(markers, tree);
    if (stale.length > 0) drop(projectPath, stale);
  }, [tree, projectPath, drop]);
}
