import type { SearchPreference } from "@/lib/tauri";

import { SEARCH_DEBOUNCE_MS, supersededScan, useLiveSearch } from "../../shared/api/indexQueries";
import { gameQueries } from "./queries";

/**
 * The installed game's files ranked for a path field, with the files `preference` names first.
 *
 * `searching` is true from the keystroke, through the debounce, until the answer for `query` lands.
 */
export function useGamePathSearch(query: string, preference: SearchPreference, enabled: boolean) {
  const search = useLiveSearch(
    query,
    SEARCH_DEBOUNCE_MS,
    (debounced) => gameQueries.paths(debounced, preference, enabled && debounced.trim().length > 0),
    supersededScan,
  );

  return { data: search.data, searching: enabled && query.trim().length > 0 && search.searching };
}
