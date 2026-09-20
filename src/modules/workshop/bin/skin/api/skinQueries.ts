import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  type AnimationGraph,
  api,
  type AppError,
  type AssetRef,
  type BinDocumentId,
  type ClipHeader,
  type MapCharacter,
  type MapParticle,
  type SkinModel,
} from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

/** The reads a skin viewport draws from, keyed on the document as `vfxKeys.system` is. */
export const skinQueries = {
  /** One skin object as a viewport draws it. */
  skin: (document: BinDocumentId, entry: string) =>
    queryOptions<SkinModel, AppError>({
      queryKey: ["skin", document, entry],
      queryFn: async () => unwrapForQuery(await api.bin.readSkin(document, entry)),
      staleTime: Infinity,
      retry: false,
    }),
  /** One animation graph with its maps, and nothing where either is not known yet. */
  graph: (document: BinDocumentId | null, graph: string | null) =>
    queryOptions<AnimationGraph, AppError>({
      queryKey: ["skin-graph", document, graph],
      queryFn:
        document === null || graph === null
          ? skipToken
          : async () => unwrapForQuery(await api.bin.readAnimationGraph(document, graph)),
      staleTime: Infinity,
      retry: false,
    }),
  /** Every particle the open `.materials.bin` under `document` stands in its map. */
  mapParticles: (document: BinDocumentId | null) =>
    queryOptions<MapParticle[], AppError>({
      queryKey: ["skin-map-particles", document],
      queryFn:
        document === null
          ? skipToken
          : async () => unwrapForQuery(await api.bin.readMapParticles(document)),
      staleTime: Infinity,
      retry: false,
    }),
  /** Every character the open `.materials.bin` under `document` stands in its map. */
  mapCharacters: (document: BinDocumentId | null) =>
    queryOptions<MapCharacter[], AppError>({
      queryKey: ["skin-map-characters", document],
      queryFn:
        document === null
          ? skipToken
          : async () => unwrapForQuery(await api.bin.readMapCharacters(document)),
      staleTime: Infinity,
      retry: false,
    }),
  /** Where the install keeps the file at `path`, and null where it keeps none. */
  gameFile: (path: string) =>
    queryOptions<AssetRef | null, AppError>({
      queryKey: ["skin-game-file", path],
      queryFn: async () => {
        const held = unwrapForQuery(await api.objects.locateGameFiles([path]))[path];
        return held === undefined
          ? null
          : { kind: "gameChunk", wad: held.wad, pathHash: held.pathHash };
      },
      staleTime: Infinity,
      retry: false,
    }),
  /** The rate and the length of one `.anm`, and nothing for a clip nothing holds. */
  clipHeader: (asset: AssetRef | null) =>
    queryOptions<ClipHeader, AppError>({
      queryKey: ["skin-clip-header", asset],
      queryFn:
        asset === null
          ? skipToken
          : async () => unwrapForQuery(await api.bin.readClipHeader(asset)),
      staleTime: Infinity,
      retry: false,
    }),
};
