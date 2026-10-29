import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type AssetRef,
  type AudioEventsResponse,
  type BankReferencesResponse,
  type BinDocumentId,
  type EventTree,
  type MediaRow,
  type ResolvedSounds,
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
  references: () => [...audioKeys.all, "references"] as const,
  referencesOf: (sandbox: SandboxRef, asset: AssetRef, version: number) =>
    [...audioKeys.references(), sandboxKey(sandbox), assetKey(asset), version] as const,
  sounds: () => [...audioKeys.all, "sounds"] as const,
  soundsOf: (document: BinDocumentId, names: readonly string[], bankPaths: readonly string[]) =>
    [...audioKeys.sounds(), document, names, bankPaths] as const,
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
  /* Polls while the game's audio index builds, so the game's units arrive when it lands. A
     layer file write invalidates every answer, since a project bin may declare a unit. */
  references: (sandbox: SandboxRef, asset: AssetRef, version: number) =>
    queryOptions<BankReferencesResponse, AppError>({
      queryKey: audioKeys.referencesOf(sandbox, asset, version),
      queryFn: queryFnWithArgs(api.readBankReferences, sandbox, asset),
      staleTime: Infinity,
      retry: false,
      refetchInterval: (query) => pollWhileBuilding(query.state.data?.index.status),
    }),
  /* Asked once per view for every name its cues hold. A layer file write invalidates every
     answer, and the answer polls while the game's audio index builds. */
  sounds: (document: BinDocumentId, names: readonly string[], bankPaths: readonly string[] = []) =>
    queryOptions<ResolvedSounds, AppError>({
      queryKey: audioKeys.soundsOf(document, names, bankPaths),
      queryFn:
        names.length === 0
          ? skipToken
          : queryFnWithArgs(api.resolveSounds, document, [...names], [...bankPaths]),
      staleTime: Infinity,
      retry: false,
      refetchInterval: (query) => pollWhileBuilding(query.state.data?.index.status),
    }),
} as const;
