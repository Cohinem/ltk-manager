import { queryOptions, skipToken } from "@tanstack/react-query";

import { api, type AppError, type Run, type ValidationResult } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { workshopKeys } from "../../shared/api/keys";

export const problemQueries = {
  /* A run is a fact about the files as they were at one moment, so nothing
     refreshes it on its own. The panel's re-run button is how a user asks for a
     newer one, and a fix or an undo invalidates this key. */
  problems: (projectPath: string | undefined) =>
    queryOptions<Run, AppError>({
      queryKey: workshopKeys.problems(projectPath ?? ""),
      queryFn: projectPath ? queryFnWithArgs(api.analyzeProject, projectPath) : skipToken,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    }),

  validation: (projectPath: string | undefined) =>
    queryOptions<ValidationResult, AppError>({
      queryKey: workshopKeys.validation(projectPath ?? ""),
      queryFn: projectPath ? queryFnWithArgs(api.validateProject, projectPath) : skipToken,
    }),
} as const;
