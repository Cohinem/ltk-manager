import type { QueryClient } from "@tanstack/react-query";

/** The backdrop's own lookups: the map list, the sky, and each map's two files. */
export const BACKDROP_ROOT = ["viewport-backdrop"] as const;

/** Where one map's geometry and materials live. */
export const MAP_FILES_ROOT = ["map-files"] as const;

/** Where a batch of a scene's files live, asked in one call. */
export const MAP_FILES_NEAR_ROOT = ["map-files-near"] as const;

/**
 * The query roots holding where a file lives rather than what it held.
 *
 * Each answers with an `AssetRef` read out of the game index, and each is kept for the
 * app's life, so an index rebuilt under them leaves them naming an archive and a chunk
 * nothing looks for again.
 */
const PLACEMENT_ROOTS: readonly (readonly string[])[] = [
  BACKDROP_ROOT,
  MAP_FILES_ROOT,
  MAP_FILES_NEAR_ROOT,
];

/**
 * Drop every placement, so the next read asks the index that has just been rebuilt.
 *
 * The decoded buffers are left alone: they are keyed on the asset a placement answered,
 * so one that moved is a new key and one that did not is still the bytes that arrived.
 */
export function dropPlacements(client: QueryClient): void {
  for (const queryKey of PLACEMENT_ROOTS) void client.invalidateQueries({ queryKey });
}
