import { useQuery } from "@tanstack/react-query";

import { api, type AppError, type HashtableUpdateCheck } from "@/lib/tauri";
import { queryFn } from "@/utils/query";

import { settingsKeys } from "./keys";

/** How long a check stands before opening the card asks GitHub again. */
const STALE_MS = 30 * 60 * 1000;

/**
 * Compare the shared hashtable cache against the latest published release.
 *
 * Reaches the network, so it is paced: one answer stands for half an hour and
 * no refetch follows a focus or a reconnect. A failure resolves to an error
 * and is not retried — the card falls back to what the cache holds, which is
 * the answer it gave before this existed.
 */
export function useHashtableUpdateCheck() {
  return useQuery<HashtableUpdateCheck, AppError>({
    queryKey: settingsKeys.hashtableUpdates(),
    queryFn: queryFn(api.checkHashtableUpdates),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: STALE_MS,
  });
}
