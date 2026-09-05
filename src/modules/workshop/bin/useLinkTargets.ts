import { useQueries, type UseQueryOptions } from "@tanstack/react-query";
import { createContext, use, useMemo } from "react";

import {
  api,
  type AppError,
  type AssetRef,
  type BinDocumentId,
  type BinRow,
  type DeclaredObject,
  type DeclaredObjects,
  type GameFileEntry,
  type ObjectIndexStatus,
} from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { useProjectContentTree } from "../api/useProjectContentTree";
import { useProjectContext } from "../components/ProjectContext";
import { layerTitle } from "../documents/contentDocument";
import { gameKeys } from "../gameBrowser";
import type { LayerCopy } from "./linkDecision";

/** How often a check the build has not answered yet asks again. */
const BUILDING_POLL_MS = 1000;

/** One group of rows checked together: a node's rows, or the tab's roots. */
export interface RowGroup {
  readonly key: string;
  readonly rows: readonly BinRow[];
}

/** What a page's checks answered for the links and hashes in it. */
export interface LinkTargets {
  /** The slot the index is in, as the latest check reports it. Absent before one answers. */
  readonly index: ObjectIndexStatus | null;
  /** By object hash, `0x` and eight hex digits: what declares it, in resolution order. */
  readonly declared: ReadonlyMap<string, DeclaredObject>;
  /** By resolved chunk path: the install's copy. A path the install lacks is absent. */
  readonly located: ReadonlyMap<string, GameFileEntry>;
  /** A check is on its way for some page. */
  readonly pending: boolean;
}

export const NO_LINK_TARGETS: LinkTargets = {
  index: null,
  declared: new Map(),
  located: new Map(),
  pending: false,
};

/** The checks the tree ran, read by every chip in it. */
export const LinkTargetsContext = createContext<LinkTargets>(NO_LINK_TARGETS);

/** The checks of the enclosing tree. A chip outside one reads nothing as resolved. */
export function useLinkTargets(): LinkTargets {
  return use(LinkTargetsContext);
}

export const linkKeys = {
  declared: (document: BinDocumentId, key: string, hashes: readonly string[]) =>
    [...gameKeys.objectSearches, "links", document, key, hashes] as const,
  located: (key: string, paths: readonly string[]) => ["game-files", key, paths] as const,
};

/** The object hashes a group's `link` and `hash` values name, sorted, each once. */
export function linkHashes(rows: readonly BinRow[]): string[] {
  const hashes = new Set<string>();
  for (const { value } of rows) {
    if (value.type === "objectLink" || value.type === "hash") hashes.add(value.hash);
  }
  return [...hashes].sort();
}

/** The chunk paths a group's `file` values resolve to, sorted, each once. */
export function linkPaths(rows: readonly BinRow[]): string[] {
  const paths = new Set<string>();
  for (const { value } of rows) {
    if (value.type === "wadChunkLink" && value.path !== null) paths.add(value.path);
  }
  return [...paths].sort();
}

type DeclaredQuery = UseQueryOptions<
  DeclaredObjects,
  AppError,
  DeclaredObjects,
  ReturnType<typeof linkKeys.declared>
>;

type LocatedQuery = UseQueryOptions<
  Record<string, GameFileEntry>,
  AppError,
  Record<string, GameFileEntry>,
  ReturnType<typeof linkKeys.located>
>;

/**
 * Check every group's link and hash targets against the index, and its `file` targets
 * against the install, one call per group and per kind.
 *
 * "Links" in docs/ux/BIN_EDITOR.md. The declared checks sit under the object searches,
 * and a warm or a drop settling asks them again. A check the build has not answered
 * asks again each second.
 */
export function useCheckLinkTargets(
  document: BinDocumentId,
  groups: readonly RowGroup[],
): LinkTargets {
  const targets = useMemo(
    () =>
      groups.map((group) => ({
        key: group.key,
        hashes: linkHashes(group.rows),
        paths: linkPaths(group.rows),
      })),
    [groups],
  );

  const declaredQueries: DeclaredQuery[] = targets
    .filter((group) => group.hashes.length > 0)
    .map((group) => ({
      queryKey: linkKeys.declared(document, group.key, group.hashes),
      queryFn: async () => unwrapForQuery(await api.declaredObjects(group.hashes, document)),
      staleTime: Infinity,
      retry: false,
      refetchInterval: (query) =>
        query.state.data?.index.status === "building" ? BUILDING_POLL_MS : false,
    }));
  const declaredResults = useQueries({ queries: declaredQueries });

  const locatedQueries: LocatedQuery[] = targets
    .filter((group) => group.paths.length > 0)
    .map((group) => ({
      queryKey: linkKeys.located(group.key, group.paths),
      queryFn: async () => unwrapForQuery(await api.locateGameFiles(group.paths)),
      staleTime: Infinity,
      retry: false,
    }));
  const locatedResults = useQueries({ queries: locatedQueries });

  const declared = new Map<string, DeclaredObject>();
  let index: ObjectIndexStatus | null = null;
  let pending = false;
  for (const result of declaredResults) {
    if (result.isPending) pending = true;
    if (!result.data) continue;
    index = result.data.index;
    for (const [hash, object] of Object.entries(result.data.objects)) declared.set(hash, object);
  }

  const located = new Map<string, GameFileEntry>();
  for (const result of locatedResults) {
    if (result.isPending) pending = true;
    if (!result.data) continue;
    for (const [path, entry] of Object.entries(result.data)) located.set(path, entry);
  }

  return { index, declared, located, pending };
}

/** The tree's asset, for the layer side of a `file` link. Null outside a tree. */
export const LinkAssetContext = createContext<AssetRef | null>(null);

/**
 * The layer's copy of `path`, where the tree's asset sits in a layer that holds one.
 *
 * Matched without regard to case: a layer spells a path as its author did, and the
 * tables spell it lowercase.
 */
export function useLayerCopy(path: string | null): LayerCopy | null {
  const asset = use(LinkAssetContext);
  const project = useProjectContext();
  const { data } = useProjectContentTree(asset?.kind === "layer" ? project.path : undefined);

  return useMemo(() => {
    if (path === null || asset?.kind !== "layer" || !data) return null;
    const layer = data.layers.find((candidate) => candidate.name === asset.layer);
    const wanted = path.toLowerCase();
    const entry = layer?.entries.find(
      (candidate) => candidate.relativePath.toLowerCase() === wanted,
    );
    if (!layer || !entry) return null;
    return {
      asset: { kind: "layer", project: project.path, layer: layer.name, path: entry.relativePath },
      title: layerTitle(project, layer.name),
    };
  }, [asset, data, path, project]);
}
