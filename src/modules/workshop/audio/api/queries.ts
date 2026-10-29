import { queryOptions } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type AssetRef,
  type AudioEventsResponse,
  type EventTree,
  type MediaRow,
  type SandboxRef,
} from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { assetKey } from "../../preview/utils/assetRef";
import { sandboxKey } from "../../sandbox/utils/sandboxRef";
import { pollWhileBuilding } from "../../shared/api/indexQueries";

export const audioKeys = {
  all: ["audio"] as const,
  media: (asset: AssetRef, version: number) =>
    [...audioKeys.all, "media", assetKey(asset), version] as const,
  events: (sandbox: SandboxRef, asset: AssetRef, version: number) =>
    [...audioKeys.all, "events", sandboxKey(sandbox), assetKey(asset), version] as const,
  event: (sandbox: SandboxRef, asset: AssetRef, version: number, event: number) =>
    [...audioKeys.events(sandbox, asset, version), event] as const,
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
  /* Polls while the game's audio index builds, so the names arrive when it lands. */
  events: (sandbox: SandboxRef, asset: AssetRef, version: number) =>
    queryOptions<AudioEventsResponse, AppError>({
      queryKey: audioKeys.events(sandbox, asset, version),
      queryFn: queryFnWithArgs(api.readAudioEvents, sandbox, asset),
      staleTime: Infinity,
      retry: false,
      refetchInterval: (query) => pollWhileBuilding(query.state.data?.index.status),
    }),
  event: (sandbox: SandboxRef, asset: AssetRef, version: number, event: number) =>
    queryOptions<EventTree, AppError>({
      queryKey: audioKeys.event(sandbox, asset, version, event),
      queryFn: queryFnWithArgs(api.readAudioEvent, sandbox, asset, event),
      staleTime: Infinity,
      retry: false,
    }),
} as const;
