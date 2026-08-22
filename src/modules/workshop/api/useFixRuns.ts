import { queryOptions, skipToken, useQuery } from "@tanstack/react-query";

import { api, type AppError, type FixRunSummary } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { workshopKeys } from "./keys";

/**
 * Query options for the restore points a project holds, newest first.
 */
export function fixRunsOptions(projectPath: string | undefined) {
  return queryOptions<FixRunSummary[], AppError>({
    queryKey: workshopKeys.fixRuns(projectPath ?? ""),
    queryFn: projectPath ? queryFnWithArgs(api.fixRuns, projectPath) : skipToken,
  });
}

/**
 * Hook to read the restore points a project holds, newest first.
 *
 * This is what the Undo affordance draws. The backend orders the list, so the
 * most recent fix run is the first entry.
 */
export function useFixRuns(projectPath: string | undefined) {
  return useQuery(fixRunsOptions(projectPath));
}
