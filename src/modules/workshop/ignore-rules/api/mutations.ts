import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import { api, type AppError, type IgnoreRules } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { workshopKeys } from "../../shared/api/keys";

export interface SaveIgnoreRulesVariables {
  projectPath: string;
  /** The file's project-relative path, null for the project's root rules. */
  at: string | null;
  text: string;
}

/**
 * Put the rules a write answered with over the cached ones.
 *
 * The tree reads the same file, so a write that changed what ships invalidates
 * it rather than patching it: what a rule excludes is the backend's to decide.
 */
function putIgnoreRules(
  client: QueryClient,
  projectPath: string,
  at: string | null,
  saved: IgnoreRules,
): void {
  client.setQueryData(workshopKeys.ignoreRules(projectPath, at), saved);
  client.invalidateQueries({ queryKey: workshopKeys.contentTree(projectPath) });
}

/** Writes against a project's `.modignore`. */
export const ignoreRuleMutations = {
  /* The document reports a blocked save on the line it names, so a toast over
     the top of it would say the same thing twice. */
  save: (client: QueryClient) =>
    mutationOptions<IgnoreRules, AppError, SaveIgnoreRulesVariables>({
      meta: { silentError: true },
      mutationFn: async ({ projectPath, at, text }) =>
        unwrapForQuery(await api.ignoreRules.save(projectPath, at, text)),
      onSuccess: (saved, { projectPath, at }) => putIgnoreRules(client, projectPath, at, saved),
    }),

  addRecommended: (client: QueryClient) =>
    mutationOptions<IgnoreRules, AppError, string>({
      mutationFn: async (projectPath) =>
        unwrapForQuery(await api.ignoreRules.addRecommended(projectPath)),
      onSuccess: (saved, projectPath) => putIgnoreRules(client, projectPath, null, saved),
    }),
} as const;
