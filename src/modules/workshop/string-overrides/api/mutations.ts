import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import { api, type AppError, type WorkshopProject } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { replaceProject } from "../../projects/api/cache";
export interface SaveStringOverridesVariables {
  projectPath: string;
  layerName: string;
  stringOverrides: Record<string, Record<string, string>>;
}

export const stringOverrideMutations = {
  saveStringOverrides: (client: QueryClient) =>
    mutationOptions<WorkshopProject, AppError, SaveStringOverridesVariables>({
      mutationFn: async ({ projectPath, layerName, stringOverrides }) =>
        unwrapForQuery(await api.saveLayerStringOverrides(projectPath, layerName, stringOverrides)),
      onSuccess: (updated) => replaceProject(client, updated),
    }),
} as const;
