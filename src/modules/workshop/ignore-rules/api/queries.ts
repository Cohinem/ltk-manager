import { queryOptions, skipToken } from "@tanstack/react-query";

import { api, type AppError, type IgnoreRules } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { CONTENT_SCAN_STALE_MS } from "../../shared/api/freshness";
import { workshopKeys } from "../../shared/api/keys";

export const ignoreRuleQueries = {
  /* Refetched on focus the way the content tree is, because the file is as
     editable from outside the app as the layer beside it. */
  ignoreRules: (projectPath: string | undefined, at: string | null = null) =>
    queryOptions<IgnoreRules, AppError>({
      queryKey: workshopKeys.ignoreRules(projectPath ?? "", at),
      queryFn: projectPath
        ? async () => unwrapForQuery(await api.ignoreRules.read(projectPath, at))
        : skipToken,
      refetchOnWindowFocus: true,
      staleTime: CONTENT_SCAN_STALE_MS,
    }),

  /* A constant the backend owns, so one fetch a session is the whole cost. */
  recommendedIgnoreRules: () =>
    queryOptions<string, AppError>({
      queryKey: workshopKeys.recommendedIgnoreRules(),
      queryFn: async () => unwrapForQuery(await api.ignoreRules.recommended()),
      staleTime: Infinity,
    }),
} as const;
