import { useMemo } from "react";

import { useObjectFind } from "../api/useObjectFind";
import { withCreatedHits } from "../utils/moduleObjects";
import { useModuleObjects } from "./useModuleObjects";

/**
 * Every object of the install matching the box, then every object the project's game data
 * declarations create that it matches.
 */
export function useObjectFindWithModules(input: string, regex: boolean) {
  const find = useObjectFind(input, regex);
  const modules = useModuleObjects();
  const data = useMemo(
    () => withCreatedHits(find.data, modules, input, regex),
    [find.data, modules, input, regex],
  );

  return { ...find, data };
}
