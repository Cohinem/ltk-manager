import { useQuery } from "@tanstack/react-query";

import { api, type AppError, type Settings } from "@/lib/tauri";
import { queryFn } from "@/utils/query";

import { settingsKeys } from "./keys";

/**
 * What a fresh install shows, for the rows that offer to put it back.
 *
 * A fresh install's values cannot change while the app runs, so this is a
 * fetch-once table rather than a cache.
 */
export function useSettingDefaults() {
  return useQuery<Settings, AppError>({
    queryKey: settingsKeys.defaults(),
    queryFn: queryFn(api.getDefaultSettings),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
