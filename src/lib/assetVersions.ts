import { useSyncExternalStore } from "react";

import type { AssetRef, LayerFilesChanged } from "@/lib/tauri";

/** How many times each layer file changed on disk this session, by `layerFileKey`. */
export type AssetVersions = ReadonlyMap<string, number>;

/** The query parameter a preview URL names its asset's version on. */
const VERSION_PARAMETER = "v";

/** What opens a URL's query, and what joins a further parameter onto an open one. */
const QUERY_START = "?";
const QUERY_JOIN = "&";

let versions: AssetVersions = new Map();

const listeners = new Set<() => void>();

/**
 * What one layer file's version counts under.
 *
 * Folded to one spelling. Windows opens `Icon.TEX` and `icon.tex` as one file, and a link
 * spells its path either way.
 */
export function layerFileKey(project: string, layer: string, path: string): string {
  return [project, layer, path].map(foldPath).join("|");
}

function foldPath(part: string): string {
  return part.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** How many changes on disk `versions` counts for `asset`, 0 for a file never seen changing. */
export function assetVersion(versions: AssetVersions, asset: AssetRef): number {
  if (asset.kind !== "layer") return 0;

  return versions.get(layerFileKey(asset.project, asset.layer, asset.path)) ?? 0;
}

/** `url` naming `version`, and `url` itself for an asset that never changed. */
export function versionedUrl(url: string, version: number): string {
  if (version === 0) return url;

  const separator = url.includes(QUERY_START) ? QUERY_JOIN : QUERY_START;
  return `${url}${separator}${VERSION_PARAMETER}=${version}`;
}

/** Count one more change on disk for each file `change` names. */
export function bumpAssetVersions(change: LayerFilesChanged): void {
  if (change.files.length === 0) return;

  const next = new Map(versions);
  for (const { layer, path } of change.files) {
    const key = layerFileKey(change.project, layer, path);
    next.set(key, (next.get(key) ?? 0) + 1);
  }
  versions = next;

  for (const listener of listeners) listener();
}

/** Every layer file's version. Each change replaces the map. */
export function currentAssetVersions(): AssetVersions {
  return versions;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Every layer file's version, for a hook that builds the URLs of many assets. */
export function useAssetVersions(): AssetVersions {
  return useSyncExternalStore(subscribe, currentAssetVersions);
}

/** `asset`'s version, which re-renders the caller only when that file changes on disk. */
export function useAssetVersion(asset: AssetRef | null): number {
  return useSyncExternalStore(subscribe, () =>
    asset === null ? 0 : assetVersion(versions, asset),
  );
}
