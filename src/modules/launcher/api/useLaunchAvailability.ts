import { useQuery } from "@tanstack/react-query";

import { api, type AppError, type LaunchAvailability } from "@/lib/tauri";
import { queryFn } from "@/utils/query";

import { launcherKeys } from "./keys";

/**
 * Whether a launch is possible right now. Polled rather than fetched once: the
 * answer changes when the user opens or closes the Riot Client, and the button
 * should not need a page revisit to notice.
 */
export function useLaunchAvailability() {
  return useQuery<LaunchAvailability, AppError>({
    queryKey: launcherKeys.availability(),
    queryFn: queryFn(api.getLaunchAvailability),
    refetchInterval: 5000,
  });
}
