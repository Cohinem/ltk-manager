import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";

import { useDebouncedValue } from "@/hooks";
import { api, type AppError, type ObjectFind } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { FIND_DEBOUNCE_MS } from "../gameBrowser/useGameFind";
import { BUILDING_POLL_MS } from "../gameBrowser/useObjectIndex";
import { splitClassTerm } from "../palette/classTerm";
import { objectKeys } from "./useObjectDir";

/**
 * Every object of the install matching the box, in path order.
 *
 * The `class:` term comes off the pattern the way the palette reads it and crosses as its
 * own argument. The previous answer stays on screen while the next one arrives, and an
 * answer the build has not given asks again each second. A pattern that does not parse
 * resolves as an error and leaves the last good answer in `data`.
 */
export function useObjectFind(input: string, regex: boolean) {
  const debounced = useDebouncedValue(input, FIND_DEBOUNCE_MS);
  const term = splitClassTerm(debounced);
  const pattern = term === null ? debounced.trim() : term.rest;
  const cls = term === null ? null : term.value;
  const active = pattern.length > 0 || cls !== null;

  return useQuery<ObjectFind, AppError>({
    queryKey: objectKeys.find(pattern, regex, cls),
    queryFn: active ? queryFnWithArgs(api.findObjects, pattern, regex, cls) : skipToken,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "building" || status === "absent" ? BUILDING_POLL_MS : false;
    },
    staleTime: 0,
    gcTime: 0,
  });
}
