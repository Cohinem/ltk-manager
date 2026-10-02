import { splitClassTerm } from "../../palette/utils/classTerm";
import { FIND_DEBOUNCE_MS, supersededResponse, useLiveSearch } from "../../shared/api/indexQueries";
import { objectTreeQueries } from "./queries";

/**
 * Every object of the install matching the box, in path order.
 *
 * The `class:` term comes off the pattern the way the palette reads it and crosses
 * as its own argument.
 */
export function useObjectFind(input: string, regex: boolean) {
  return useLiveSearch(
    input,
    FIND_DEBOUNCE_MS,
    (debounced) => findQuery(debounced, regex),
    supersededResponse,
  );
}

function findQuery(input: string, regex: boolean) {
  const term = splitClassTerm(input);
  const pattern = term === null ? input.trim() : term.rest;
  const cls = term === null ? null : term.value;

  return objectTreeQueries.find(pattern, regex, cls, pattern.length > 0 || cls !== null);
}
