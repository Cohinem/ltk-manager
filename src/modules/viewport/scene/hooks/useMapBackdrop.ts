import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, type AssetRef } from "@/lib/tauri";

import { viewportQueries } from "../../assets/api/queries";
import type { MapGeometry } from "../../assets/parsing/mapBuffer";

/**
 * The maps a backdrop can be drawn from, by the path their geometry lives at.
 *
 * A picker enumerated from the built game index is its own issue. Until it exists the
 * list is the one map the effort is measured against.
 */
export const BACKDROP_MAPS = {
  summonersRift: "data/maps/mapgeometry/map11/base_srx.mapgeo",
} as const;

/** Which map a backdrop draws. */
export type BackdropMap = keyof typeof BACKDROP_MAPS;

/** Where the install keeps a map's geometry, which nothing invalidates for the app's life. */
const backdropQueries = {
  chunk: (map: BackdropMap | null) =>
    queryOptions<AssetRef | null>({
      queryKey: ["viewport-backdrop", map],
      queryFn: async () => {
        if (map === null) return null;
        const path = BACKDROP_MAPS[map];
        const answer = await api.objects.locateGameFiles([path]);
        if (!answer.ok) return null;
        const held = answer.value[path];
        if (held === undefined) return null;
        return { kind: "gameChunk", wad: held.wad, pathHash: held.pathHash };
      },
      staleTime: Infinity,
      retry: false,
    }),
};

/** A map backdrop's geometry, and what it is doing while there is none to draw. */
export interface Backdrop {
  readonly geometry: MapGeometry | null;
  /** The bytes are on their way. One map is 73 to 93 MiB, so this is seconds. */
  readonly loading: boolean;
  /** Why there is nothing to draw, for the one line a disabled option carries. */
  readonly failure: string | null;
}

/**
 * The map `map` names, fetched once and decoded once.
 *
 * The whole map arrives in one buffer, so there is nothing to stream and nothing enters
 * or leaves as the camera moves (ADR-0044).
 */
export function useMapBackdrop(map: BackdropMap | null): Backdrop {
  const located = useQuery(backdropQueries.chunk(map));
  const geometry = useQuery(viewportQueries.map(located.data ?? null));

  if (map === null) return { geometry: null, loading: false, failure: null };
  if (located.isPending || geometry.isPending) {
    return { geometry: null, loading: true, failure: null };
  }
  if (located.data === null || located.data === undefined) {
    return { geometry: null, loading: false, failure: "This install has no geometry for that map" };
  }
  if (geometry.error !== null) {
    return { geometry: null, loading: false, failure: geometry.error.message };
  }
  return { geometry: geometry.data ?? null, loading: false, failure: null };
}
