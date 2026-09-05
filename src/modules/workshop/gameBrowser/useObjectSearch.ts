import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/hooks";
import { api, type AppError, type ObjectSearch } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { SEARCH_DEBOUNCE_MS } from "./useGameSearch";
import { gameKeys } from "./useGameWads";

/** How often a query the build has not answered yet asks again. */
const BUILDING_POLL_MS = 1000;

/**
 * Rank every bin object of the install against `query`.
 *
 * The answer carries the slot the index is in, so a query typed while the
 * build runs reads as building rather than as nothing, and asks again until
 * the build lands. The previous answer stays on screen while the next one
 * arrives, and nothing is cached across a query, for the reasons
 * `useGameSearch` gives.
 */
export function useObjectSearch(query: string, enabled: boolean) {
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const active = enabled && debounced.trim().length > 0;

  return useQuery<ObjectSearch, AppError>({
    queryKey: gameKeys.objectSearch(debounced),
    queryFn: active ? queryFnWithArgs(api.searchObjectIndex, debounced) : skipToken,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "building" || status === "absent" ? BUILDING_POLL_MS : false;
    },
    staleTime: 0,
    gcTime: 0,
  });
}
