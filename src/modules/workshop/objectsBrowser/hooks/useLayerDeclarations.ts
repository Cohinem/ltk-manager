import { useMemo } from "react";

import { useProjectContentTree } from "../../content/api/useProjectContentTree";
import { useProjectContext } from "../../projects/state/ProjectContext";
import { layerDeclarationsOf, type LayerDeclarations } from "../utils/objectTree";

/** The project's declarations by hash, shared by object browser presentations. */
export function useLayerDeclarations(): LayerDeclarations {
  const project = useProjectContext();
  const { data: tree } = useProjectContentTree(project.path);
  return useMemo(() => layerDeclarationsOf(tree, project), [tree, project]);
}
