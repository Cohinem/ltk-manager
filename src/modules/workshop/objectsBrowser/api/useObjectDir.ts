import { useQuery } from "@tanstack/react-query";

import type { ObjectDirListing } from "@/lib/tauri";

import { readyValue, useListings } from "../../shared/api/indexQueries";
import { objectTreeQueries } from "./queries";

export { objectKeys } from "./keys";

const EMPTY_LISTING: ObjectDirListing = { prefixes: [], objects: [] };

/**
 * One prefix of the object tree, `""` for the root, in the slot the index is in.
 *
 * An answer the build has not given asks again each second until it lands.
 */
export function useObjectDir(prefix: string) {
  return useQuery(objectTreeQueries.dir(prefix));
}

/**
 * The listing of every expanded prefix, null where one is on its way.
 *
 * `prefixes` must be referentially stable across renders, or the combined map
 * loses its memoization and the whole tree rebuilds.
 */
export function useObjectDirs(
  prefixes: readonly string[],
): ReadonlyMap<string, ObjectDirListing | null> {
  return useListings(prefixes, objectTreeQueries.dir, readyValue, EMPTY_LISTING);
}
