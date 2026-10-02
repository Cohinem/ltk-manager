import { SEARCH_DEBOUNCE_MS, supersededScan, useLiveSearch } from "../../shared/api/indexQueries";
import { gameQueries } from "./queries";

/**
 * Rank every file of the installed game against `query`.
 *
 * The previous answer stays on screen while the next one arrives, so the group
 * does not empty and refill under the cursor between keystrokes.
 */
export function useGameSearch(query: string, enabled: boolean) {
  return useLiveSearch(
    query,
    SEARCH_DEBOUNCE_MS,
    (debounced) => gameQueries.search(debounced, enabled && debounced.trim().length > 0),
    supersededScan,
  );
}
