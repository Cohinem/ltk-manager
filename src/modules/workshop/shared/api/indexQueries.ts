import {
  keepPreviousData,
  useQueries,
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useDebouncedValue } from "@/hooks";
import type { AppError, IndexAnswer } from "@/lib/tauri";

/** How often an answer the index has not given whole asks again. */
export const INDEX_POLL_MS = 1000;

/**
 * How long a ranked search waits before it asks the backend.
 *
 * It crosses IPC and walks the whole index, so it waits for the typing to settle.
 */
export const SEARCH_DEBOUNCE_MS = 120;

/**
 * How long a full search waits before it asks the backend.
 *
 * Longer than a ranked search, because it hands back every hit rather than a
 * ranked page, so a keystroke costs more to answer.
 */
export const FIND_DEBOUNCE_MS = 200;

type IndexStatus = IndexAnswer<unknown>["status"];

/** The poll for an answer whose build is running. */
export function pollWhileBuilding(status: IndexStatus | undefined): number | false {
  return status === "building" ? INDEX_POLL_MS : false;
}

/** The poll for an answer the index has not given, built or not. */
export function pollUntilReady(status: IndexStatus | undefined): number | false {
  return status === "building" || status === "absent" ? INDEX_POLL_MS : false;
}

/** The value of a ready answer, and undefined for any other. */
export function readyValue<T>(answer: IndexAnswer<T> | undefined): T | undefined {
  return answer?.status === "ready" ? answer.value : undefined;
}

/** A scan that a newer one on its line overtook, which holds part of an answer. */
export function supersededScan(scan: { superseded: boolean }): boolean {
  return scan.superseded;
}

/** An index answer holding a scan a newer one overtook. */
export function supersededAnswer(answer: IndexAnswer<{ superseded: boolean }>): boolean {
  return answer.status === "ready" && answer.value.superseded;
}

/**
 * The options every live search of an index shares.
 *
 * The previous answer stays on screen while the next one arrives. Nothing is cached across a
 * query, because a scan a later one overtook holds part of an answer, and caching it would hand
 * it back as the whole one. An answer `isPartial` rejects, or one `poll` names a wait for, asks
 * again.
 */
export function liveSearchOptions<TData>(
  isPartial: (data: TData) => boolean,
  poll?: (data: TData) => number | false,
) {
  return {
    placeholderData: keepPreviousData,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: (query: { state: { data: TData | undefined } }) => {
      const data = query.state.data;
      if (data === undefined) return false;
      if (isPartial(data)) return INDEX_POLL_MS;

      return poll?.(data) ?? false;
    },
  };
}

/** What a live search shows. */
export interface LiveSearch<TData> {
  /** The last whole answer, or the one before a partial answer replaced it. */
  data: TData | undefined;
  error: AppError | null;
  /** True from the keystroke, through the debounce, until the answer for the input lands. */
  searching: boolean;
  isFetching: boolean;
}

/**
 * A search of an index that follows a box as it is typed.
 *
 * `options` builds the query for the debounced input. A partial answer, as `isPartial` reads
 * one, never reaches the screen: the last whole answer stays until the one asked again lands.
 */
export function useLiveSearch<TData>(
  input: string,
  delayMs: number,
  options: (debounced: string) => UseQueryOptions<TData, AppError, TData, QueryKey>,
  isPartial: (data: TData) => boolean,
): LiveSearch<TData> {
  const debounced = useDebouncedValue(input, delayMs);
  const query = useQuery(options(debounced));
  const [whole, setWhole] = useState<TData | undefined>(undefined);

  const answer = query.data;
  const partial = answer !== undefined && isPartial(answer);
  if (answer !== undefined && !partial && answer !== whole) {
    setWhole(answer);
  }

  return {
    data: partial ? whole : answer,
    error: query.error,
    searching: debounced !== input || query.isFetching,
    isFetching: query.isFetching,
  };
}

/**
 * Every expanded listing of an index at once, null where one is on its way.
 *
 * A listing that failed reads as `empty`, so a path the index no longer holds, such as an
 * expansion kept across a rebuild, draws as an empty folder rather than a row that spins
 * forever. `paths` must be referentially stable across renders, or the combined map loses its
 * memoization and the whole tree rebuilds.
 */
export function useListings<TQueryFnData, TData, TListing>(
  paths: readonly string[],
  options: (path: string) => UseQueryOptions<TQueryFnData, AppError, TData, QueryKey>,
  listingOf: (data: TData) => TListing | undefined,
  empty: TListing,
): ReadonlyMap<string, TListing | null> {
  const combine = useCallback(
    (results: readonly UseQueryResult[]) => {
      const byPath = new Map<string, TListing | null>();
      paths.forEach((path, index) => {
        const result = results[index];
        if (result?.isError) {
          byPath.set(path, empty);
          return;
        }

        const data = result?.data as TData | undefined;
        byPath.set(path, (data === undefined ? undefined : listingOf(data)) ?? null);
      });
      return byPath;
    },
    [paths, listingOf, empty],
  );

  /* `useQueries` cannot resolve its result types over a generic option, so the
     options cross erased and `combine` restores the data type. */
  return useQueries({ queries: paths.map(options) as unknown as UseQueryOptions[], combine });
}
