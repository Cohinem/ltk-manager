import type { AssetRef, WadSource } from "@/lib/tauri";

import type { ExplorerFileItem, ExplorerItem } from "../../explorer";
import { chunkAsset } from "../state/wadSource";
import { type SourceFileNode, type SourceTreeNode, UNKNOWN_DIR } from "./sourceIndex";

/** A chunk names the archive it came from, which is the route back to its bytes. */
export function itemAsset(source: WadSource, item: ExplorerItem): AssetRef | null {
  if (item.kind === "dir") return null;
  return chunkAsset(source, item.entry.wad, item.entry.pathHash);
}

export function fileNodeOf(item: ExplorerFileItem): SourceFileNode {
  return { type: "file", id: item.id, name: item.name, entry: item.entry };
}

/**
 * The tile the menu opened on, as the node that menu reads.
 *
 * A directory tile carries no children here, and the menu never walks any: it
 * offers the ways out, and those act on the selection the right click aimed.
 */
export function menuNodeOf(item: ExplorerItem | null): SourceTreeNode | null {
  if (item === null) return null;
  if (item.kind === "file") return fileNodeOf(item);
  return {
    type: "dir",
    id: item.id,
    path: item.id,
    name: item.name,
    unknown: item.id === UNKNOWN_DIR,
    fileCount: item.fileCount,
    children: [],
  };
}

export function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
