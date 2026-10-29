import { useQuery } from "@tanstack/react-query";

import type { ModuleObject } from "@/lib/tauri";

import { useDeclarationsOn } from "../../bin/documents/hooks/useDeclared";
import { useOptionalProjectContext } from "../../projects/state/ProjectContext";
import { useObjectsDisplay } from "../../state";
import { objectTreeQueries } from "../api/queries";
import { NO_MODULE_OBJECTS } from "../utils/moduleObjects";

/**
 * Whether the objects views list what the project's game data declarations create, remove or
 * edit: the Declared objects switch, while the project's "Use game data declarations" is on.
 *
 * Null outside a project and while the project's choice is unread.
 */
export function useModuleObjectsShown(): boolean | null {
  const project = useOptionalProjectContext();
  const declaring = useDeclarationsOn(project?.path);
  const { declaredObjects } = useObjectsDisplay();
  if (declaring === null) return null;

  return declaring && declaredObjects;
}

/**
 * The objects that the open project's game data declarations create, remove or edit, in build
 * order. Empty outside a project, while the list is hidden and until the index answers.
 */
export function useModuleObjects(): readonly ModuleObject[] {
  const project = useOptionalProjectContext();
  const shown = useModuleObjectsShown() === true;
  const { data } = useQuery({
    ...objectTreeQueries.moduleObjects(project?.path),
    enabled: shown,
  });
  if (!shown || data?.status !== "ready") return NO_MODULE_OBJECTS;

  return data.value;
}
