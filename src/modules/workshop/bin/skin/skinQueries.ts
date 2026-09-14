import { queryOptions, skipToken } from "@tanstack/react-query";

import {
  type AnimationGraph,
  api,
  type AppError,
  type AssetRef,
  type BinDocumentId,
  type ClipHeader,
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
