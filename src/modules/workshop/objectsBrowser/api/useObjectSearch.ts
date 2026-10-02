import { SEARCH_DEBOUNCE_MS, supersededAnswer, useLiveSearch } from "../../shared/api/indexQueries";
import { objectIndexQueries } from "./indexQueries";

/**
 * Rank every bin object of the install against `query`.
 *
 * The answer carries the slot the index is in, so a query typed while the
 * build runs reads as building rather than as nothing.
 */
export function useObjectSearch(query: string, enabled: boolean) {
  return useLiveSearch(
    query,
    SEARCH_DEBOUNCE_MS,
    (debounced) => objectIndexQueries.search(debounced, enabled && debounced.trim().length > 0),
    supersededAnswer,
  );
}
