import {
  keepPreviousData,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useDebouncedValue } from "@/hooks";
import type { AppError, IndexResponse } from "@/lib/tauri";

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

type IndexStatus = IndexResponse<unknown>["status"];

/** The poll for an answer whose build is running. */
export function pollWhileBuilding(status: IndexStatus | undefined): number | false {
  return status === "building" ? INDEX_POLL_MS : false;
}

/** The poll for an answer the index has not given, built or not. */
export function pollUntilReady(status: IndexStatus | undefined): number | false {
  return status === "building" || status === "absent" ? INDEX_POLL_MS : false;
}

/** The value of a ready answer, and undefined for any other. */
export function readyValue<T>(answer: IndexResponse<T> | undefined): T | undefined {
  return answer?.status === "ready" ? answer.value : undefined;
}

/** A scan that a newer one on its line overtook, which holds part of an answer. */
export function supersededScan(scan: { superseded: boolean }): boolean {
  return scan.superseded;
}

/** An index response holding a scan a newer one overtook. */
export function supersededResponse(answer: IndexResponse<{ superseded: boolean }>): boolean {
  return answer.status === "ready" && answer.value.superseded;
}

/**
 * How long a whole answer of an index stays fresh while something reads it.
 *
 * An index changes when it is rebuilt, which invalidates its answers, so a reader that mounts
 * beside one already on screen asks nothing.
 */
export const SEARCH_STALE_MS = 15 * 60_000;

/**
 * The options every live search of an index shares.
 *
 * The previous answer stays on screen while the next one arrives. An answer `isPartial` rejects,
 * or one `poll` names a wait for, is stale at once and asks again. Nothing outlives its last
 * reader, because a broad pattern holds thousands of rows.
 */
export function liveSearchOptions<TData>(
  isPartial: (data: TData) => boolean,
  poll?: (data: TData) => number | false,
) {
  const wait = (query: { state: { data: TData | undefined } }): number | false => {
    const data = query.state.data;
    if (data === undefined) return false;
    if (isPartial(data)) return INDEX_POLL_MS;

    return poll?.(data) ?? false;
  };

  return {
    placeholderData: keepPreviousData,
    staleTime: (query: { state: { data: TData | undefined } }) =>
      wait(query) === false ? SEARCH_STALE_MS : 0,
    gcTime: 0,
    refetchInterval: wait,
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
 *
 * A search that mounts on an input with no answer held waits out the delay from the empty input,
 * which `options` must build an inactive query for. A view that mounts at the first keystroke
 * would otherwise ask for that one character.
 */
export function useLiveSearch<TData>(
  input: string,
  delayMs: number,
  options: (debounced: string) => UseQueryOptions<TData, AppError, TData, QueryKey>,
  isPartial: (data: TData) => boolean,
): LiveSearch<TData> {
  const client = useQueryClient();
  const [initial] = useState(() =>
    client.getQueryData(options(input).queryKey) === undefined ? "" : input,
  );

  const debounced = useDebouncedValue(input, delayMs, initial);
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
