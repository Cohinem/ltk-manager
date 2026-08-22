import { queryOptions, skipToken, useQuery } from "@tanstack/react-query";

import { api, type AppError, type Run } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { workshopKeys } from "./keys";

/**
 * Query options for every problem one run found in a project.
 *
 * A run is a fact about the files as they were at one moment, so nothing
 * refreshes it on its own. The panel's re-run button is how a user asks for a
 * newer one, and a fix or an undo invalidates this key.
 */
export function projectProblemsOptions(projectPath: string | undefined) {
  return queryOptions<Run, AppError>({
    queryKey: workshopKeys.problems(projectPath ?? ""),
    queryFn: projectPath ? queryFnWithArgs(api.analyzeProject, projectPath) : skipToken,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to run every rule over a project.
 *
 * The run starts as soon as a path arrives and a user asks for nothing,
 * because a modder who has to press a button to learn their mod is broken
 * learns it from the game instead. The backend answers a large real project in
 * around 260ms, so there is no progress to report and nothing to gate on.
 */
export function useProjectProblems(projectPath: string | undefined) {
  return useQuery(projectProblemsOptions(projectPath));
}
