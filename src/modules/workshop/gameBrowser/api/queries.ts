import { keepPreviousData, queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type GameDirListing,
  type GameFindResult,
  type GameIndexStats,
  type GameSearchResult,
  type GameWadEntry,
  type GameWadSummary,
  type SearchPreference,
  type WadSource,
} from "@/lib/tauri";
import { queryFnWithArgs } from "@/utils/query";

import { extractQueries } from "../extraction/api/queries";
import type { SourceDirListing, SourceEntry } from "../utils/sourceIndex";
import { GAME_STALE_MS, gameKeys } from "./keys";

/* Directory rows arrive sorted and folded, which is the index's work. */

function toSourceListing(listing: GameDirListing): SourceDirListing {
  return {
    dirs: listing.dirs,
    files: listing.files.map((file) => ({
      pathHash: file.pathHash,
      path: file.path,
      sizeBytes: file.sizeBytes,
      wad: file.wad,
    })),
  };
}

/* A scoped read names one archive, so its entries take the archive from the
   request rather than from a field the chunk list lacks. */
function toSourceEntries(entries: GameWadEntry[], wad: string): SourceEntry[] {
  return entries.map((entry) => ({
    pathHash: entry.pathHash,
    path: entry.path,
    sizeBytes: entry.sizeBytes,
    wad,
  }));
}

/** The installed game, or the installed League client, as the folded index reads it. */
export const gameQueries = {
  /** Every WAD archive of one source. Errors when no League path is set. */
  wads: (source: WadSource) =>
    queryOptions<GameWadSummary[], AppError>({
      queryKey: gameKeys.wads(source),
      queryFn: queryFnWithArgs(api.getGameWads, source),
      staleTime: GAME_STALE_MS,
    }),

  /** What the folded index of one source holds, once it is built. */
  index: (source: WadSource) =>
    queryOptions<GameIndexStats, AppError>({
      queryKey: gameKeys.index(source),
      queryFn: queryFnWithArgs(api.getGameIndex, source),
      staleTime: GAME_STALE_MS,
    }),

  /* The first read of a session builds the index, which walks every archive the
     source carries. Every read after it answers from what that built. */
  dir: (source: WadSource, path: string) =>
    queryOptions<GameDirListing, AppError, SourceDirListing>({
      queryKey: gameKeys.dir(source, path),
      queryFn: queryFnWithArgs(api.readGameDir, source, path),
      staleTime: GAME_STALE_MS,
      select: toSourceListing,
    }),

  /** One archive's entries as source entries. Null while the archive is unresolved. */
  wadEntries: (source: WadSource, wadName: string | null) =>
    queryOptions<GameWadEntry[], AppError, SourceEntry[]>({
      queryKey: gameKeys.wad(source, wadName ?? ""),
      queryFn: wadName ? queryFnWithArgs(api.readGameWad, source, wadName) : skipToken,
      staleTime: GAME_STALE_MS,
      select: (entries) => toSourceEntries(entries, wadName ?? ""),
    }),

  /* Nothing is cached across a query: a scan that a later one overtook returns
     part of an answer, and holding that under its query would hand it back as
     though it were the whole one. */
  search: (query: string, active: boolean) =>
    queryOptions<GameSearchResult, AppError>({
      queryKey: gameKeys.search(query),
      queryFn: active ? queryFnWithArgs(api.searchGameIndex, query) : skipToken,
      placeholderData: keepPreviousData,
      staleTime: 0,
      gcTime: 0,
    }),

  /** A path field's search, which ranks the files `preference` names first. */
  paths: (query: string, preference: SearchPreference, active: boolean) =>
    queryOptions<GameSearchResult, AppError>({
      queryKey: gameKeys.paths(query, preference),
      queryFn: active ? queryFnWithArgs(api.objects.searchGamePaths, query, preference) : skipToken,
      placeholderData: keepPreviousData,
      staleTime: 0,
      gcTime: 0,
    }),

  /* A pattern that does not parse resolves as an error and leaves the last good
     answer in `data`, which is what lets the box report the parse error under
     the input without blanking the results. */
  find: (source: WadSource, pattern: string, regex: boolean, active: boolean) =>
    queryOptions<GameFindResult, AppError>({
      queryKey: gameKeys.find(source, pattern, regex),
      queryFn: active ? queryFnWithArgs(api.findInGameIndex, source, pattern, regex) : skipToken,
      placeholderData: keepPreviousData,
      staleTime: 0,
      gcTime: 0,
    }),
  extractPlan: extractQueries.extractPlan,
} as const;

export { objectIndexQueries } from "../../objectsBrowser/api/indexQueries";
