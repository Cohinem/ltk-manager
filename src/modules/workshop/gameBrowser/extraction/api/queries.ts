import { queryOptions } from "@tanstack/react-query";

import { api, type AppError, type ExtractPlan, type ExtractTarget } from "@/lib/tauri";
import { queryFn } from "@/utils/query";

import { workshopKeys } from "../../../shared/api/keys";

export const extractQueries = {
  /* The install changes only when Riot patches it, and the dialog is shut and
     reopened often enough that a refetch per open is pure latency. */
  extractPlan: (targets: readonly ExtractTarget[] | null) =>
    queryOptions<ExtractPlan, AppError>({
      queryKey: workshopKeys.gameExtractPlan(targets),
      queryFn: queryFn(() => api.planGameExtract([...(targets ?? [])], null)),
      enabled: targets !== null && targets.length > 0,
      staleTime: 60_000,
    }),
} as const;
