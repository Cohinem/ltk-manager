import { queryOptions } from "@tanstack/react-query";

import { api, type AppError, type AssetRef, type MediaRow } from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { assetKey } from "../../preview/utils/assetRef";

export const audioKeys = {
  all: ["audio"] as const,
  media: (asset: AssetRef, version: number) =>
    [...audioKeys.all, "media", assetKey(asset), version] as const,
};

/** The reads of an audio file document. */
export const audioQueries = {
  /* Keyed on the file's version, so a layer file changed on disk lists again. */
  media: (asset: AssetRef, version: number) =>
    queryOptions<MediaRow[], AppError>({
      queryKey: audioKeys.media(asset, version),
      queryFn: queryFnWithArgs(api.readAudioMedia, asset),
      staleTime: Infinity,
      retry: false,
    }),
} as const;
