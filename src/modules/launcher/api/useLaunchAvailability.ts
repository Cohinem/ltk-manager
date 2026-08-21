import { useQuery } from "@tanstack/react-query";

import { api, type AppError, type LaunchAvailability } from "@/lib/tauri";
import { queryFn } from "@/utils/query";

import { launcherKeys } from "./keys";

/** A backstop for the Riot Client being opened or closed on its own. */
const POLL_INTERVAL_MS = 30_000;

/**
 * Whether a launch is possible right now.
 *
 * Half of the answer - whether League is up - arrives as a session event, and
 * `useLeagueSession` refetches this the moment one starts or ends. The poll left
 * behind covers only the other half, so it can be slow.
 */
export function useLaunchAvailability() {
  return useQuery<LaunchAvailability, AppError>({
    queryKey: launcherKeys.availability(),
    queryFn: queryFn(api.getLaunchAvailability),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}
