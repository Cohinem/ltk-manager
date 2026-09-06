import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { api, type AppError, type ObjectDir, type ObjectDirListing } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

/* The leaves rather than the browser's barrel. The barrel reaches this module back
   through the documents registry mid-evaluation, its keys unbound. */
import { gameKeys } from "../gameBrowser/useGameWads";
import { BUILDING_POLL_MS } from "../gameBrowser/useObjectIndex";

export const objectKeys = {
  /* Under the object searches. The invalidation of a warm or a drop refetches every
     listing with them. */
  dirs: [...gameKeys.objectSearches, "dir"] as const,
  dir: (prefix: string) => [...gameKeys.objectSearches, "dir", prefix] as const,
  find: (pattern: string, regex: boolean, cls: string | null) =>
    [...gameKeys.objectSearches, "find", pattern, regex, cls] as const,
};

const EMPTY_LISTING: ObjectDirListing = { prefixes: [], objects: [] };

function objectDirOptions(prefix: string) {
  return queryOptions<ObjectDir, AppError>({
    queryKey: objectKeys.dir(prefix),
    queryFn: queryFnWithArgs(api.objectDir, prefix),
    /* The install's for the session. A warm or a drop settling asks again. */
    staleTime: Infinity,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "building" || status === "absent" ? BUILDING_POLL_MS : false;
    },
  });
}

/**
 * One prefix of the object tree, `""` for the root, in the slot the index is in.
 *
 * An answer the build has not given asks again each second until it lands.
 */
export function useObjectDir(prefix: string) {
  return useQuery(objectDirOptions(prefix));
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
  const combine = useCallback(
    (results: ReadonlyArray<{ data?: ObjectDir; isError: boolean }>) => {
      const byPrefix = new Map<string, ObjectDirListing | null>();
      prefixes.forEach((prefix, index) => {
        const result = results[index];
        /* A prefix the index no longer holds - a rebuild under an expansion the
           store kept - reads as empty rather than as a row that spins forever. */
        if (result?.isError) {
          byPrefix.set(prefix, EMPTY_LISTING);
          return;
        }
        byPrefix.set(prefix, result?.data?.status === "ready" ? result.data : null);
      });
      return byPrefix;
    },
    [prefixes],
  );

  return useQueries({ queries: prefixes.map(objectDirOptions), combine });
}
