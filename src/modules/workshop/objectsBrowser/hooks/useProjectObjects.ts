import { useMemo } from "react";

import { useProjectContentTree } from "../../content/api/useProjectContentTree";
import { useProjectContext } from "../../projects/state/ProjectContext";
import { useObjectDeclarations } from "../api/useObjectIndex";
import {
  NO_PROJECT_OBJECTS,
  type ProjectObject,
  projectOnlyObjects,
} from "../utils/projectObjects";

/**
 * The objects the project's layers declare and the install does not.
 *
 * Empty until the index answers which of the project's objects the install declares, since an
 * object listed before that would be listed twice once it does.
 */
export function useProjectObjects(): readonly ProjectObject[] {
  const project = useProjectContext();
  const { data: tree } = useProjectContentTree(project.path);
  const hashes = useMemo(() => {
    const declared = new Set<string>();
    for (const layer of tree?.layers ?? []) {
      for (const entry of layer.entries) {
        for (const object of entry.objects) declared.add(object.objectHash);
      }
    }

    return [...declared].sort();
  }, [tree]);
  const { data } = useObjectDeclarations(hashes);

  return useMemo(() => {
    if (data?.index.status !== "ready") return NO_PROJECT_OBJECTS;

    return projectOnlyObjects(tree, new Set(Object.keys(data.objects)));
  }, [tree, data]);
}
