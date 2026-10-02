import type { SearchPreference, WadSource } from "@/lib/tauri";

/* The install only changes when Riot patches it, so a listing stays good for
   a long stretch of a session. */
export const GAME_STALE_MS = 15 * 60_000;

/* Each source under keys of its own, so a rebuild of one never refetches the other. The
   game's are the bare `game-*` keys other modules already file under. */
export const gameKeys = {
  wads: (source: WadSource) => [`${source}-wads`] as const,
  wad: (source: WadSource, wadName: string) => [`${source}-wad`, wadName] as const,
  index: (source: WadSource) => [`${source}-index`] as const,
  dirs: ["game-dir"] as const,
  sourceDirs: (source: WadSource) => [`${source}-dir`] as const,
  dir: (source: WadSource, path: string) => [`${source}-dir`, path] as const,
  search: (query: string) => ["game-search", query] as const,
  paths: (query: string, preference: SearchPreference) =>
    ["game-paths", query, preference.extensions, preference.archive] as const,
  objectSearches: ["object-search"] as const,
  objectSearch: (query: string) => ["object-search", query] as const,
  /* Under the searches, so the invalidation that follows a warm or a drop
     refetches this answer with them. */
  declaredObjects: (objectHashes: readonly string[]) =>
    ["object-search", "declared", objectHashes] as const,
  find: (source: WadSource, pattern: string, regex: boolean) =>
    [`${source}-find`, pattern, regex] as const,
};
