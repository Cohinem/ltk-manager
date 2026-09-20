import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Texture } from "three";

import {
  api,
  type AssetRef,
  type BinDocumentId,
  type MapPath,
  type MaterialPreview,
} from "@/lib/tauri";

import { viewportQueries } from "../../assets/api/queries";
import type { MapGeometry } from "../../assets/parsing/mapBuffer";
import { useAssetTextures } from "../../shared/hooks/useAssetTextures";

/** Where the install keeps every map's geometry, one directory per map. */
const MAP_GEOMETRY_DIR = "data/maps/mapgeometry";

/** The prefix under which a map's files sit, which mirrors `MapPath` in core. */
const DATA_PREFIX = "data/";

/** The suffix a map's geometry carries, which mirrors `MapPath::geometry` in core. */
const GEOMETRY_SUFFIX = ".mapgeo";

/**
 * The width a map's textures land at before the whole ones replace them.
 *
 * 183 textures at full size is seconds of grey, and a mip this wide is a few kilobytes
 * each, so the map draws at once and sharpens after.
 */
const PREVIEW_WIDTH = 64;

/** Which map a backdrop draws, and the project whose layer answers before the install. */
export interface BackdropSource {
  readonly map: MapPath;
  /** Any open document of that project, and null outside one. */
  readonly document: BinDocumentId | null;
}

/** One map the install can draw a backdrop from. */
export interface BackdropChoice {
  readonly map: MapPath;
  /** The directory the geometry sits in, `map11`, which is what names the map. */
  readonly folder: string;
  /** The geometry's own file name without its suffix, `base_srx`. */
  readonly geometry: string;
}

/**
 * The file a map's geometry lives in, which mirrors `MapPath::geometry` in core.
 *
 * An entry path names no file of its own: each of a map's files is that path lowercased
 * under the data prefix with the file's own suffix.
 */
function geometryPath(map: MapPath): string {
  return `${DATA_PREFIX}${map.toLowerCase()}${GEOMETRY_SUFFIX}`;
}

/** Where the install keeps a map's files, which nothing invalidates for the app's life. */
const backdropQueries = {
  /* The index answers a directory as a lookup rather than a walk, so enumerating every
     map is one read of the geometry root and one of each map under it. */
  maps: () =>
    queryOptions<readonly BackdropChoice[]>({
      queryKey: ["viewport-backdrop", "maps"],
      queryFn: async () => {
        const root = await api.readGameDir(MAP_GEOMETRY_DIR);
        if (!root.ok) return [];
        const listings = await Promise.all(
          root.value.dirs.map(async (dir) => ({ dir, read: await api.readGameDir(dir.path) })),
        );
        const found: BackdropChoice[] = [];
        for (const { dir, read } of listings) {
          if (!read.ok) continue;
          for (const file of read.value.files) {
            const path = file.path;
            if (path === null) continue;
            if (!path.startsWith(DATA_PREFIX) || !path.endsWith(GEOMETRY_SUFFIX)) continue;
            const map = path.slice(DATA_PREFIX.length, -GEOMETRY_SUFFIX.length);
            found.push({
              map,
              folder: dir.name,
              geometry: map.slice(map.lastIndexOf("/") + 1),
            });
          }
        }
        found.sort((a, b) => a.map.localeCompare(b.map, undefined, { numeric: true }));
        return found;
      },
      staleTime: Infinity,
      retry: false,
    }),

  chunk: (map: MapPath | null) =>
    queryOptions<AssetRef | null>({
      queryKey: ["viewport-backdrop", map],
      queryFn: async () => {
        if (map === null) return null;
        const path = geometryPath(map);
        const answer = await api.objects.locateGameFiles([path]);
        if (!answer.ok) return null;
        const held = answer.value[path];
        if (held === undefined) return null;
        return { kind: "gameChunk", wad: held.wad, pathHash: held.pathHash };
      },
      staleTime: Infinity,
      retry: false,
    }),

  /* Each input is named rather than reached through a source object, so the key holds
     exactly what the read closes over. The paths are the buffer's own string table, so
     their identity is stable for as long as the answer is. */
  materials: (
    map: MapPath | null,
    document: BinDocumentId | null,
    paths: readonly string[] | null,
  ) =>
    queryOptions({
      queryKey: ["viewport-backdrop", "materials", map, document, paths],
      queryFn: async () => {
        if (map === null || paths === null) return [];
        const answer = await api.bin.readMap(document, map, [...paths]);
        if (!answer.ok) return [];
        return answer.value.materials;
      },
      enabled: map !== null && paths !== null,
      staleTime: Infinity,
      retry: false,
    }),
};

/** A map backdrop's geometry and materials, and what it is doing while there is none. */
export interface Backdrop {
  readonly geometry: MapGeometry | null;
  /** One per entry of `geometry.materials`, and null where the map declares none. */
  readonly materials: readonly (MaterialPreview | null)[];
  /** Each material's base texture, under the material's own entry path. */
  readonly textures: ReadonlyMap<string, Texture>;
  /** The bytes are on their way. One map is 73 to 93 MiB, so this is seconds. */
  readonly loading: boolean;
  /** Why there is nothing to draw, for the one line a disabled option carries. */
  readonly failure: string | null;
}

const NO_MATERIALS: readonly (MaterialPreview | null)[] = [];
const NO_TEXTURES: ReadonlyMap<string, Texture> = new Map();

/** Every map this install can draw a backdrop from, in map order. */
export function useBackdropMaps() {
  return useQuery(backdropQueries.maps());
}

/**
 * The map `source` names, fetched once and decoded once.
 *
 * The geometry arrives whole in one buffer, so nothing streams as the camera moves
 * (ADR-0044). The materials follow it over IPC, because they join the buffer's own
 * string table and so cannot be asked for until it has landed.
 */
export function useMapBackdrop(source: BackdropSource | null): Backdrop {
  const located = useQuery(backdropQueries.chunk(source?.map ?? null));
  const geometry = useQuery(viewportQueries.map(located.data ?? null));
  const materials = useQuery(
    backdropQueries.materials(
      source?.map ?? null,
      source?.document ?? null,
      geometry.data?.materials ?? null,
    ),
  );

  const assets = useMemo(() => {
    const held = new Map<string, AssetRef>();
    const paths = geometry.data?.materials ?? [];
    for (const [at, slots] of (materials.data ?? []).entries()) {
      const asset = slots?.base?.texture.asset;
      const path = paths[at];
      if (asset != null && path !== undefined) held.set(path, asset);
    }
    return held;
  }, [geometry.data, materials.data]);
  const textures = useAssetTextures(assets, { previewWidth: PREVIEW_WIDTH });

  if (source === null) {
    return {
      geometry: null,
      materials: NO_MATERIALS,
      textures: NO_TEXTURES,
      loading: false,
      failure: null,
    };
  }
  if (located.isPending || geometry.isPending) {
    return {
      geometry: null,
      materials: NO_MATERIALS,
      textures: NO_TEXTURES,
      loading: true,
      failure: null,
    };
  }
  if (located.data === null || located.data === undefined) {
    return {
      geometry: null,
      materials: NO_MATERIALS,
      textures: NO_TEXTURES,
      loading: false,
      failure: "This install has no geometry for that map",
    };
  }
  if (geometry.error !== null) {
    return {
      geometry: null,
      materials: NO_MATERIALS,
      textures: NO_TEXTURES,
      loading: false,
      failure: geometry.error.message,
    };
  }
  return {
    geometry: geometry.data ?? null,
    materials: materials.data ?? NO_MATERIALS,
    textures,
    loading: false,
    failure: null,
  };
}
