import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  api,
  type AppError,
  type AssetRef,
  type BinDocumentId,
  type MapCharacter,
  type MapParticle,
  type MapVariant,
} from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

/** The reads a map's scene draws from, each keyed on the open document it asks. */
export const mapQueries = {
  /** The maps the `Map`, `MapSkin` or `MapContainer` at `entry` draws. */
  variants: (document: BinDocumentId, entry: string) =>
    queryOptions<MapVariant[], AppError>({
      queryKey: ["map-variants", document, entry],
      queryFn: async () => unwrapForQuery(await api.bin.readMapVariants(document, entry)),
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
  /** Where the install keeps the file at `path`, and null where it keeps none. */
  gameFile: (path: string) =>
    queryOptions<AssetRef | null, AppError>({
      queryKey: ["map-game-file", path],
      queryFn: async () => {
        const held = unwrapForQuery(await api.objects.locateGameFiles([path]))[path];
        return held === undefined
          ? null
          : { kind: "gameChunk", wad: held.wad, pathHash: held.pathHash };
      },
      staleTime: Infinity,
      retry: false,
    }),
};
