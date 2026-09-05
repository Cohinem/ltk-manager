import { useQueries, type UseQueryOptions } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  type AppError,
  type AssetRef,
  type BinDocumentHandle,
  type BinDocumentId,
  type BinRows,
} from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { assetKey } from "../preview/assetRef";
import { type LoadedChildren, mergePages, PAGE_SIZE, splitKey } from "./binRows";

export type BinOpenState =
  | { readonly status: "opening" }
  | { readonly status: "open"; readonly handle: BinDocumentHandle }
  | { readonly status: "failed"; readonly error: AppError };

/**
 * One asset held open as a bin document for as long as the caller is mounted.
 *
 * The open and the close are explicit over IPC (ADR-0026). `reopen` asks for a fresh
 * handle and keeps the old one on screen until it answers. A document the store
 * evicted is reopened this way.
 */
export function useBinDocument(asset: AssetRef): { state: BinOpenState; reopen: () => void } {
  const key = assetKey(asset);
  const latest = useRef(asset);
  latest.current = asset;

  const [generation, setGeneration] = useState(0);
  const [state, setState] = useState<BinOpenState>({ status: "opening" });

  /* Keyed by what the reference names. A new object for the same asset is not a reopen. */
  useEffect(() => {
    let live = true;
    let opened: BinDocumentId | null = null;
    setState((previous) => (previous.status === "open" ? previous : { status: "opening" }));

    void api.binOpen(latest.current).then((result) => {
      if (!live) {
        if (result.ok) void api.binClose(result.value.document);
        return;
      }
      if (result.ok) {
        opened = result.value.document;
        setState({ status: "open", handle: result.value });
        return;
      }
      setState({ status: "failed", error: result.error });
    });

    return () => {
      live = false;
      if (opened !== null) void api.binClose(opened);
    };
  }, [key, generation]);

  const reopen = useCallback(() => setGeneration((count) => count + 1), []);
  return { state, reopen };
}

export const binKeys = {
  children: (document: BinDocumentId, key: string, page: number) =>
    ["bin-children", document, key, page] as const,
};

/** One expanded node, and how many pages of it the list wants. */
export interface ChildrenRequest {
  readonly key: string;
  readonly pages: number;
}

/** What the queries answered for every expanded node, and whether the document is gone. */
export interface BinChildren {
  readonly loaded: ReadonlyMap<string, LoadedChildren>;
  /** The backend holds no document with this id. The caller reopens it. */
  readonly notOpen: boolean;
}

type ChildrenQuery = UseQueryOptions<
  BinRows,
  AppError,
  BinRows,
  ReturnType<typeof binKeys.children>
>;

/**
 * The children of every expanded node, one query per page, merged per node.
 *
 * A page that has not answered ends the node's rows at the page before it, and the
 * node reads as pending. The queries never go stale. A reopen changes the document id
 * and with it every key.
 */
export function useBinChildren(
  document: BinDocumentId,
  requests: readonly ChildrenRequest[],
): BinChildren {
  const queries: ChildrenQuery[] = requests.flatMap((request) => {
    const [entry, path] = splitKey(request.key);
    return Array.from({ length: request.pages }, (_, page) => ({
      queryKey: binKeys.children(document, request.key, page),
      queryFn: async () =>
        unwrapForQuery(await api.binChildren(document, entry, path, page * PAGE_SIZE, PAGE_SIZE)),
      staleTime: Infinity,
      retry: false,
    }));
  });
  const results = useQueries({ queries });

  const loaded = new Map<string, LoadedChildren>();
  let notOpen = false;
  let at = 0;
  for (const request of requests) {
    const merged = mergePages(results.slice(at, at + request.pages));
    at += request.pages;
    if (!merged) continue;
    loaded.set(request.key, merged);
    if (merged.error?.code === "BIN_NOT_OPEN") notOpen = true;
  }

  return { loaded, notOpen };
}
