import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { api, type AppError, type StringKeySearchResult } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { workshopKeys } from "../../shared/api/keys";

/** The stringtable index, as the override editor reads it. */
export const stringQueries = {
  /* The first request builds the backend index, downloading the key list when
     needed, so it can take a few seconds. */
  keySearch: (query: string) =>
    queryOptions<StringKeySearchResult, AppError>({
      queryKey: workshopKeys.stringKeySearch(query),
      queryFn: async () => unwrapForQuery(await api.searchStringKeys(query, 50)),
      staleTime: Infinity,
      placeholderData: keepPreviousData,
      retry: false,
    }),

  /* A key the game does not resolve is absent, and the editor shows no original
     line for it. The backend shares the suggestion index, so the first call of a
     session can take a few seconds while that index builds. */
  values: (keys: readonly string[]) =>
    queryOptions<Record<string, string>, AppError>({
      queryKey: workshopKeys.stringValues(keys),
      queryFn: async () => unwrapForQuery(await api.lookupStringValues([...keys])),
      enabled: keys.length > 0,
      staleTime: Infinity,
      placeholderData: keepPreviousData,
      retry: false,
    }),
} as const;
