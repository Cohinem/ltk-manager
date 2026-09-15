import { useQuery } from "@tanstack/react-query";

import { projectDetailsQueries } from "./queries";

/** One workshop project by path. */
export function useWorkshopProject(projectPath: string) {
  return useQuery(projectDetailsQueries.byPath(projectPath));
}
