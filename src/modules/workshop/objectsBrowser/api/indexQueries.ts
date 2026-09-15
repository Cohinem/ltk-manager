import { keepPreviousData, queryOptions, skipToken } from "@tanstack/react-query";

import { api, type AppError, type DeclaredObjects, type ObjectSearch } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { BUILDING_POLL_MS, gameKeys } from "../../gameBrowser/api/keys";

/** What the object index answers, and how it reports a build still running. */
export const objectIndexQueries = {
  /* Asked whatever the Objects switch says, and asked again each second while a
     build runs. A ready answer never refetches on its own, and a warm or a drop
     settling asks again. */
  declarations: (objectHashes: readonly string[]) =>
    queryOptions<DeclaredObjects, AppError>({
      queryKey: gameKeys.declaredObjects(objectHashes),
      queryFn:
        objectHashes.length > 0
          ? queryFnWithArgs(api.objects.declared, [...objectHashes])
          : skipToken,
      staleTime: Infinity,
      refetchInterval: (query) =>
        query.state.data?.index.status === "building" ? BUILDING_POLL_MS : false,
    }),

  /* The answer carries the slot the index is in, so a query typed while the build
     runs reads as building rather than as nothing, and asks again until the build
     lands. Nothing is cached across a query, for the reason `gameQueries.search`
     gives. */
  search: (query: string, active: boolean) =>
    queryOptions<ObjectSearch, AppError>({
      queryKey: gameKeys.objectSearch(query),
      queryFn: active ? queryFnWithArgs(api.objects.search, query) : skipToken,
      placeholderData: keepPreviousData,
      refetchInterval: (result) => {
        const status = result.state.data?.status;
        return status === "building" || status === "absent" ? BUILDING_POLL_MS : false;
      },
      staleTime: 0,
      gcTime: 0,
    }),
} as const;
