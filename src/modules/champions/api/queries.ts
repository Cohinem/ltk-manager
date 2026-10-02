import { queryOptions } from "@tanstack/react-query";

import { api, type AppError, type Champion } from "@/lib/tauri";
import { queryFn } from "@/utils/query";

export const championKeys = {
  roster: (leaguePath: string) => ["champions", leaguePath] as const,
};

export const championQueries = {
  /* The champions change only with a patch, so they stay fresh for an hour, keyed on the path
     they were read from. */
  roster: (leaguePath: string | null | undefined) =>
    queryOptions<Champion[], AppError>({
      queryKey: championKeys.roster(leaguePath ?? ""),
      queryFn: queryFn(api.readChampions),
      enabled: !!leaguePath,
      staleTime: 60 * 60 * 1000,
      retry: false,
    }),
};
