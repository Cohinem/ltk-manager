import { mutationOptions, type QueryClient } from "@tanstack/react-query";

import { api, type AppError, type HashtableSyncReport, type Settings } from "@/lib/tauri";
import { dropPlacements } from "@/modules/viewport";
import { mutationFn } from "@/utils/query";

import { settingsKeys } from "./keys";

/** Writes against the app settings. */
export const settingsMutations = {
  /* Saves run one at a time and show at once, so a second change merged onto the
     first reaches the backend after it rather than racing it. A refused save reads
     the settings back. */
  save: (client: QueryClient) =>
    mutationOptions<null, AppError, Settings>({
      mutationFn: mutationFn(api.saveSettings),
      scope: { id: "settings" },
      onMutate: (settings) => {
        client.setQueryData(settingsKeys.settings(), settings);
      },
      onError: () => {
        client.invalidateQueries({ queryKey: settingsKeys.settings() });
      },
      onSuccess: () => {
        client.invalidateQueries({ queryKey: settingsKeys.setupRequired() });
      },
    }),

  /** Finding nothing answers `null` rather than rejecting. */
  autoDetectLeaguePath: () =>
    mutationOptions<string | null, AppError, void>({
      mutationFn: mutationFn(api.autoDetectLeaguePath),
    }),
} as const;

/** Writes against the shared hashtable cache. */
export const hashtableMutations = {
  /* `true` re-downloads every table. A failed sync can still have installed
     some, so the cache is refreshed either way. */
  sync: (client: QueryClient) =>
    mutationOptions<HashtableSyncReport, AppError, boolean>({
      mutationFn: mutationFn(api.syncHashtables),
      onSettled: () => {
        client.invalidateQueries({ queryKey: settingsKeys.hashtableCache() });
        client.invalidateQueries({ queryKey: settingsKeys.hashtableUpdates() });
        /* The sync drops the game index behind it, so every placement read out of the
           old one now names a file by a name that install no longer resolves. */
        dropPlacements(client);
      },
    }),
} as const;

/** Writes against the diagnostics identity the Privacy card shows. */
export const telemetryMutations = {
  /* The answer is the new pseudonym, so it seeds the query rather than
     invalidating it and asking the backend what it just answered. */
  resetSecret: (client: QueryClient) =>
    mutationOptions<string | null, AppError, void>({
      mutationFn: mutationFn(api.diagnostics.resetTelemetrySecret),
      onSuccess: (identity) => {
        client.setQueryData(settingsKeys.telemetryIdentity(), identity);
      },
    }),
} as const;
