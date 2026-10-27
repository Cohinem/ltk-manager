import { queryOptions } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type OwnedModPost,
  type PublishingContext,
  type Release,
  type RuneforgeStatus,
} from "@/lib/tauri";
import { queryFn, queryFnWithArgs } from "@/utils/query";

import { runeforgeKeys } from "./keys";

/** What the app reads from RuneForge, and the connection it reads it through. */
export const runeforgeQueries = {
  /** The stored account. Sends no request to RuneForge. */
  status: () =>
    queryOptions<RuneforgeStatus, AppError>({
      queryKey: runeforgeKeys.status(),
      queryFn: queryFn(api.runeforge.status),
    }),

  ownedMods: () =>
    queryOptions<OwnedModPost[], AppError>({
      queryKey: runeforgeKeys.ownedMods(),
      queryFn: queryFn(api.runeforge.ownedMods),
    }),

  /** The game versions and categories. They change with a patch, so a read holds for an hour. */
  context: () =>
    queryOptions<PublishingContext, AppError>({
      queryKey: runeforgeKeys.context(),
      queryFn: queryFn(api.runeforge.context),
      staleTime: 60 * 60 * 1000,
    }),

  release: (modId: string, releaseId: string) =>
    queryOptions<Release, AppError>({
      queryKey: runeforgeKeys.release(modId, releaseId),
      queryFn: queryFnWithArgs(api.runeforge.release, modId, releaseId),
    }),
} as const;
