import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/hooks";
import { api, type AppError, type GameSearchResult } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { gameKeys } from "./useGameWads";

/**
 * How long the box waits before it asks the backend.
 *
 * The project's own rows render on the keystroke. This one crosses IPC and
 * walks the whole install, so it waits for the typing to settle.
 */
const SEARCH_DEBOUNCE_MS = 120;

/**
 * Rank every file of the installed game against `query`.
 *
 * The previous answer stays on screen while the next one arrives, so the group
 * does not empty and refill under the cursor between keystrokes.
 *
 * Nothing is cached across a query: a scan that a later one overtook returns
 * part of an answer, and holding that under its query would hand it back as
 * though it were the whole one.
 */
export function useGameSearch(query: string, enabled: boolean) {
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const active = enabled && debounced.trim().length > 0;

  return useQuery<GameSearchResult, AppError>({
    queryKey: gameKeys.search(debounced),
    queryFn: active ? queryFnWithArgs(api.searchGameIndex, debounced) : skipToken,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
  });
}
