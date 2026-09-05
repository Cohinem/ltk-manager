/**
 * The two-level tree the References document draws over one query's answer.
 *
 * Pure, and read off the backend's groups. "The References document" in
 * docs/ux/PROJECT_EDITOR.md.
 */

import type { AssetRef, ReferenceGroup } from "@/lib/tauri";

import { assetKey } from "../preview/assetRef";

export type ReferenceNode = ReferenceFileNode | ReferenceObjectNode;

/** One declaring file, over the objects it declares. */
export interface ReferenceFileNode {
  readonly type: "file";
  /** The asset's key, which keys the group's expansion. */
  readonly id: string;
  readonly asset: AssetRef;
  /** The file's path, or its hash when no table names it. */
  readonly file: string;
  readonly children: readonly ReferenceObjectNode[];
}

/** One object of a group, which opens the declaration the group is. */
export interface ReferenceObjectNode {
  readonly type: "object";
  /** The file's key and the object's hash, which no two rows share. */
  readonly id: string;
  /** `0x` and eight hex digits. */
  readonly objectHash: string;
  readonly path: string;
  /** The last segment, or the hash where no table names the object. */
  readonly name: string;
  /** The path above the name, empty where the path is one segment. */
  readonly prefix: string;
  /** The path is a hash no table names. */
  readonly unnamed: boolean;
  /** `0x` and eight hex digits. */
  readonly classHash: string;
  /** The class as the tables name it, or null where no table does. */
  readonly class: string | null;
  /** The declaring file, which the row's tab opens. */
  readonly asset: AssetRef;
  readonly file: string;
}

/** The rows of one answer: a file, then the objects it declares. */
export function buildReferenceTree(groups: readonly ReferenceGroup[]): ReferenceFileNode[] {
  return groups.map((group) => {
    const key = assetKey(group.asset);
    return {
      type: "file",
      id: key,
      asset: group.asset,
      file: group.file,
      children: group.objects.map((object) => {
        const cut = object.path.lastIndexOf("/");
        return {
          type: "object",
          id: `${key}:${object.objectHash}`,
          objectHash: object.objectHash,
          path: object.path,
          name: cut < 0 ? object.path : object.path.slice(cut + 1),
          prefix: cut < 0 ? "" : object.path.slice(0, cut),
          unnamed: object.path === object.objectHash,
          classHash: object.classHash,
          class: object.class === object.classHash ? null : object.class,
          asset: group.asset,
          file: group.file,
        };
      }),
    };
  });
}

export interface ReferenceRow {
  readonly node: ReferenceNode;
  readonly depth: number;
}

/** Walk the tree into the rows to render, for the virtualizer. */
export function flattenReferences(
  nodes: readonly ReferenceFileNode[],
  isShut: (node: ReferenceFileNode) => boolean,
): ReferenceRow[] {
  const out: ReferenceRow[] = [];
  for (const file of nodes) {
    out.push({ node: file, depth: 0 });
    if (isShut(file)) continue;
    for (const object of file.children) out.push({ node: object, depth: 1 });
  }
  return out;
}

/** How many objects the groups hold in all. */
export function countReferences(groups: readonly ReferenceGroup[]): number {
  return groups.reduce((sum, group) => sum + group.objects.length, 0);
}
