import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import type { Settings } from "@/lib/tauri";

import { settingsKeys } from "./keys";
import { settingsQueries } from "./queries";
import { useSaveSettings } from "./useSaveSettings";

/** The settings, for a view drawn only once they have loaded, as the Settings page is. */
export function useLoadedSettings(): Settings {
  return useSuspenseQuery(settingsQueries.current()).data;
}

/** A change to some keys, or one computed from the settings as they stand when it lands. */
export type SettingsPatch = Partial<Settings> | ((current: Settings) => Partial<Settings>);

/**
 * Save a change to some settings, merged onto the latest settings rather than the ones the
 * caller last rendered, so two quick changes both land.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const { mutate } = useSaveSettings();

  return useCallback(
    (patch: SettingsPatch, options?: { onSuccess?: () => void }) => {
      const current = queryClient.getQueryData<Settings>(settingsKeys.settings());
      if (!current) return;

      const change = typeof patch === "function" ? patch(current) : patch;
      mutate({ ...current, ...change }, options);
    },
    [mutate, queryClient],
  );
}
