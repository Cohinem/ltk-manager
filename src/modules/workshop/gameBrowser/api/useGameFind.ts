import { FIND_DEBOUNCE_MS, supersededScan, useLiveSearch } from "../../shared/api/indexQueries";
import { useWadSource } from "../state/wadSource";
import { gameQueries } from "./queries";

/**
 * Every file of the enclosing browser's source matching `pattern`, in tree order.
 *
 * `regex` reads the pattern as a regular expression, and either way the match
 * is case-insensitive.
 */
export function useGameFind(pattern: string, regex: boolean) {
  const source = useWadSource();

  return useLiveSearch(
    pattern,
    FIND_DEBOUNCE_MS,
    (debounced) => gameQueries.find(source, debounced, regex, debounced.length > 0),
    supersededScan,
  );
}
