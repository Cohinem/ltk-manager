import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type AssetRef,
  type BinDocumentId,
  type MapCharacter,
  type MapChunk,
  type MapFiles,
  type MapParticle,
  type MapPath,
  type MapVariant,
} from "@/lib/tauri";
import { MAP_FILES_NEAR_ROOT, MAP_FILES_ROOT } from "@/modules/viewport";
import { unwrapForQuery } from "@/utils/query";

/** The reads a map's scene draws from, each keyed on the open document it asks. */
export const mapQueries = {
  /** The maps the `Map`, `MapSkin` or `MapContainer` at `entry` draws. */
  variants: (document: BinDocumentId | null, entry: string | null) =>
    queryOptions<MapVariant[], AppError>({
      queryKey: ["map-variants", document, entry],
      queryFn:
        document === null || entry === null
          ? skipToken
          : async () => unwrapForQuery(await api.bin.readMapVariants(document, entry)),
      staleTime: Infinity,
      retry: false,
    }),
  /** Every particle the open `.materials.bin` under `document` stands in its map. */
  particles: (document: BinDocumentId | null) =>
    queryOptions<MapParticle[], AppError>({
      queryKey: ["map-particles", document],
      queryFn:
        document === null
          ? skipToken
          : async () => unwrapForQuery(await api.bin.readMapParticles(document)),
      staleTime: Infinity,
      retry: false,
    }),
  /** Every character the open `.materials.bin` under `document` stands in its map. */
  characters: (document: BinDocumentId | null) =>
    queryOptions<MapCharacter[], AppError>({
      queryKey: ["map-characters", document],
      queryFn:
        document === null
          ? skipToken
          : async () => unwrapForQuery(await api.bin.readMapCharacters(document)),
      staleTime: Infinity,
      retry: false,
    }),
  /** Every chunk the open `.materials.bin` under `document` declares, and what each holds. */
  outline: (document: BinDocumentId | null) =>
    queryOptions<MapChunk[], AppError>({
      queryKey: ["map-outline", document],
      queryFn:
        document === null
          ? skipToken
          : async () => unwrapForQuery(await api.bin.readMapOutline(document)),
      staleTime: Infinity,
      retry: false,
    }),
  /** Where the two files of `map` live, the project `near` sits in answering first. */
  files: (near: AssetRef, map: MapPath | null) =>
    queryOptions<MapFiles, AppError>({
      queryKey: [...MAP_FILES_ROOT, near, map],
      queryFn:
        map === null
          ? skipToken
          : async () => unwrapForQuery(await api.bin.locateMapFiles(near, map)),
      staleTime: Infinity,
      retry: false,
    }),
  /**
   * Where each of `paths` lives, the project `near` sits in answering first, asked in one
   * call because finding a project's files walks its layers. A path nothing holds is absent.
   */
  filesNear: (near: AssetRef, paths: readonly string[]) =>
    queryOptions<Partial<Record<string, AssetRef>>, AppError>({
      queryKey: [...MAP_FILES_NEAR_ROOT, near, paths],
      queryFn: async () =>
        paths.length === 0 ? {} : unwrapForQuery(await api.bin.locateFilesNear(near, paths)),
      staleTime: Infinity,
      retry: false,
    }),
};
