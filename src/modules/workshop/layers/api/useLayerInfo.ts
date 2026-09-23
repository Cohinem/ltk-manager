import { useQuery } from "@tanstack/react-query";

import { layerQueries } from "./queries";

/** What each named layer of a project holds. */
export function useLayerInfo(projectPath: string, layerNames: string[]) {
  return useQuery(layerQueries.layerInfo(projectPath, layerNames));
}
