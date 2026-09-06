import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/hooks";
import { api, type AppError, type GameFindResult } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { gameKeys } from "./useGameWads";

/**
 * How long the box waits before it asks the backend.
 *
 * Longer than the palette's 120ms, because a full search hands back every hit
 * rather than a ranked page, so a keystroke costs more to answer.
 */
export const FIND_DEBOUNCE_MS = 200;

/**
 * Every file of the installed game matching `pattern`, in tree order.
 *
 * `regex` reads the pattern as a regular expression, and either way the match
 * is case-insensitive. The previous answer stays on screen while the next one
 * arrives, so the list does not empty and refill under the cursor between
 * keystrokes. A pattern that does not parse resolves as an error and leaves
 * the last good answer in `data`, which is what lets the box report the parse
 * error under the input without blanking the results.
 */
export function useGameFind(pattern: string, regex: boolean) {
  const debounced = useDebouncedValue(pattern, FIND_DEBOUNCE_MS);
  const active = debounced.length > 0;

  return useQuery<GameFindResult, AppError>({
    queryKey: gameKeys.find(debounced, regex),
    queryFn: active ? queryFnWithArgs(api.findInGameIndex, debounced, regex) : skipToken,
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
  });
}
