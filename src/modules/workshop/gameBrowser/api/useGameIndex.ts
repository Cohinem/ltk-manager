import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { api, type AppError } from "@/lib/tauri";
import { dropPlacements } from "@/modules/viewport";
import { useSearchObjects } from "@/stores";
import { mutationFn } from "@/utils/query";

import { useWarmObjectIndex } from "../../objectsBrowser/api/useObjectIndex";
import { useListings } from "../../shared/api/indexQueries";
import { useWadSource } from "../state/wadSource";
import type { SourceDirListing } from "../utils/sourceIndex";
import { gameKeys } from "./keys";
import { gameQueries } from "./queries";

const EMPTY_LISTING: SourceDirListing = { dirs: [], files: [] };

/**
 * One directory of the enclosing browser's folded index, `""` for the root.
 *
 * The first read of a session builds the index, which walks every archive the
 * source carries. Every read after it answers from what that built.
 */
export function useGameDir(path: string) {
  return useQuery(gameQueries.dir(useWadSource(), path));
}

/**
 * Every expanded directory at once, null where a listing is still in flight.
 *
 * `paths` must be referentially stable across renders, or the combined map
 * loses its memoization and the whole tree rebuilds.
 */
export function useGameDirs(
  paths: readonly string[],
): ReadonlyMap<string, SourceDirListing | null> {
  const source = useWadSource();
  const options = useCallback((path: string) => gameQueries.dir(source, path), [source]);

  return useListings(paths, options, asListing, EMPTY_LISTING);
}

function asListing(listing: SourceDirListing): SourceDirListing {
  return listing;
}

/** What the enclosing browser's folded index holds, once it is built. */
export function useGameIndex() {
  return useQuery(gameQueries.index(useWadSource()));
}

/**
 * Drop the enclosing browser's built index, so the next read walks the install again.
 *
 * For the game, the object index goes with it, and is warmed again while the
 * Objects switch is on, because the game index it is fed by has just been
 * declared stale.
 */
export function useRefreshGameIndex() {
  const source = useWadSource();
  const queryClient = useQueryClient();
  const searchObjects = useSearchObjects();
  const warmObjects = useWarmObjectIndex();
  const warmMutate = warmObjects.mutate;

  return useMutation<null, AppError, void>({
    mutationFn: mutationFn(() => api.refreshGameIndex(source)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: gameKeys.index(source) });
      queryClient.invalidateQueries({ queryKey: gameKeys.sourceDirs(source) });
      queryClient.invalidateQueries({ queryKey: gameKeys.wads(source) });
      if (source !== "game") return;

      queryClient.invalidateQueries({ queryKey: gameKeys.objectSearches });
      /* A viewport holds where a file lived, which the index it was read out of no
         longer answers. */
      dropPlacements(queryClient);
      if (searchObjects) warmMutate();
    },
  });
}
