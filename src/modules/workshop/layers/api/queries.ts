import { queryOptions } from "@tanstack/react-query";

import { api, type AppError, type WorkshopLayerInfo } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { workshopKeys } from "../../shared/api/keys";

export const layerQueries = {
  layerInfo: (projectPath: string, layerNames: string[]) =>
    queryOptions<Record<string, WorkshopLayerInfo>, AppError>({
      queryKey: workshopKeys.layerInfoFor(projectPath, layerNames),
      queryFn: queryFnWithArgs(api.getLayerInfo, projectPath, layerNames),
    }),
} as const;
