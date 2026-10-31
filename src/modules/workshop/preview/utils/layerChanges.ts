import type { QueryKey } from "@tanstack/react-query";

import type { AssetRef, LayerFilesChanged } from "@/lib/tauri";

import { assetKey } from "./assetRef";

/** The event a watch on a project's layers announces a change on. */
export const LAYER_FILES_CHANGED = "layer-files-changed";

/** The first element of every query key `previewKeys.info` writes. */
const INFO_KEY = "asset-info";

/** The viewport's decoded buffers that a changed file makes stale. */
const VIEWPORT_ASSETS: ReadonlySet<unknown> = new Set(["mesh", "skeleton", "clip", "colliders"]);

/** The first element of the key of a `.anm`'s header. */
const CLIP_HEADER_KEY = "skin-clip-header";

function isLayerAsset(value: unknown): value is Extract<AssetRef, { kind: "layer" }> {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "layer";
}

/**
 * Returns `true` if `queryKey` reads a layer file that `change` names, as a viewport buffer or a
 * `.anm`'s header. Case is folded as `layerFileKey` folds it.
 */
export function assetReadChangedBy(queryKey: QueryKey, change: LayerFilesChanged): boolean {
  const [scope, kind, asset] = queryKey;
  const read = scope === CLIP_HEADER_KEY ? kind : VIEWPORT_ASSETS.has(kind) ? asset : null;
  if ((scope !== "viewport" && scope !== CLIP_HEADER_KEY) || !isLayerAsset(read)) return false;
  if (read.project !== change.project) return false;

  return change.files.some(
    ({ layer, path }) => layer === read.layer && path.toLowerCase() === read.path.toLowerCase(),
  );
}

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
