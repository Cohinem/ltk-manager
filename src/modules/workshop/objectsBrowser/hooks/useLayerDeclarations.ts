import { useMemo } from "react";

import { useProjectContentTree } from "../../content/api/useProjectContentTree";
import { useProjectContext } from "../../projects/state/ProjectContext";
import { withModuleDeclarations } from "../utils/moduleObjects";
import { layerDeclarationsOf, type LayerDeclarations } from "../utils/objectTree";
import { useModuleObjects } from "./useModuleObjects";

/**
 * The project's declarations by hash, shared by object browser presentations: the layer files',
 * then what each module of the game data declarations does.
 */
export function useLayerDeclarations(): LayerDeclarations {
  const project = useProjectContext();
  const { data: tree } = useProjectContentTree(project.path);
  const modules = useModuleObjects();

  return useMemo(
    () => withModuleDeclarations(layerDeclarationsOf(tree, project), modules, project),
    [tree, project, modules],
  );
}
