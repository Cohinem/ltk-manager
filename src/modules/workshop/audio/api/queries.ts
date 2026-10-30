import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type AssetRef,
  type AudioEventResponse,
  type AudioEventsResponse,
  type BankNode,
  type BankReferencesResponse,
  type BinDocumentId,
  type MediaRow,
  type ResolvedSounds,
  type SandboxRef,
} from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { assetKey } from "../../preview/utils/assetRef";
import { sandboxKey } from "../../sandbox/utils/sandboxRef";
import { pollWhileBuilding } from "../../shared/api/indexQueries";

/** An open event bank document that a read applies the edits of, at one revision. */
export interface BankRevision {
  readonly id: number;
  readonly revision: number;
}

export const audioKeys = {
  all: ["audio"] as const,
  media: (asset: AssetRef, version: number) =>
    [...audioKeys.all, "media", assetKey(asset), version] as const,
  eventBanks: () => [...audioKeys.all, "events"] as const,
  events: (
    sandbox: SandboxRef,
    asset: AssetRef,
    version: number,
    document: BankRevision | null = null,
  ) =>
    [
      ...audioKeys.eventBanks(),
      sandboxKey(sandbox),
      assetKey(asset),
      version,
      document?.id ?? null,
      document?.revision ?? null,
    ] as const,
  event: (
    sandbox: SandboxRef,
    asset: AssetRef,
    version: number,
    event: number,
    document: BankRevision | null = null,
  ) => [...audioKeys.events(sandbox, asset, version, document), event] as const,
  nodes: (document: BankRevision) =>
    [...audioKeys.all, "nodes", document.id, document.revision] as const,
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
  /* Polls while the game's audio index builds, so the names arrive when it lands. Keyed on the
     document's revision, so an edit reads the bank again. */
  events: (
    sandbox: SandboxRef,
    asset: AssetRef,
    version: number,
    document: BankRevision | null = null,
  ) =>
    queryOptions<AudioEventsResponse, AppError>({
      queryKey: audioKeys.events(sandbox, asset, version, document),
      queryFn: queryFnWithArgs(api.readAudioEvents, sandbox, asset, document?.id ?? null),
      placeholderData: (previous) => previous,
      staleTime: Infinity,
      retry: false,
      refetchInterval: (query) => pollWhileBuilding(query.state.data?.index.status),
    }),
  /* Polls while the game's audio index builds, so the media of the game's units arrive. */
  event: (
    sandbox: SandboxRef,
    asset: AssetRef,
    version: number,
    event: number,
    document: BankRevision | null = null,
  ) =>
    queryOptions<AudioEventResponse, AppError>({
      queryKey: audioKeys.event(sandbox, asset, version, event, document),
      queryFn: queryFnWithArgs(api.readAudioEvent, sandbox, asset, event, document?.id ?? null),
      /* The tree before an edit shows while the edited one reads, so a row does not blink. */
      placeholderData: (previous) => (previous?.tree.event === event ? previous : undefined),
      staleTime: Infinity,
      retry: false,
      refetchInterval: (query) => pollWhileBuilding(query.state.data?.index.status),
    }),
  /* The sounds and containers that an added child or a Play target is picked from. */
  nodes: (document: BankRevision) =>
    queryOptions<BankNode[], AppError>({
      queryKey: audioKeys.nodes(document),
      queryFn: queryFnWithArgs(api.audioBankNodes, document.id),
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
  /* Asked once per view for every name its cues contain. A layer file write invalidates every
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
