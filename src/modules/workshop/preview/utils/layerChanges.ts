import type { QueryKey } from "@tanstack/react-query";

import type { LayerFilesChanged } from "@/lib/tauri";

import { assetKey } from "./assetRef";

/** The event a watch on a project's layers announces a change on. */
export const LAYER_FILES_CHANGED = "layer-files-changed";

/** The first element of every query key `previewKeys.info` writes. */
const INFO_KEY = "asset-info";

/**
 * Whether `queryKey` is an asset's info that `change` made stale.
 *
 * The key carries `assetKey`, which names no project. The same file of another project
 * matches too. Case is folded as `layerFileKey` folds it.
 */
export function infoChangedBy(queryKey: QueryKey, change: LayerFilesChanged): boolean {
  const [scope, key] = queryKey;
  if (scope !== INFO_KEY || typeof key !== "string") return false;

  const folded = key.toLowerCase();
  return change.files.some(
    ({ layer, path }) =>
      assetKey({ kind: "layer", project: change.project, layer, path }).toLowerCase() === folded,
  );
}
