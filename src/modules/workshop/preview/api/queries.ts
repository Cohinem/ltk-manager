import { queryOptions } from "@tanstack/react-query";

import { api, type AppError, type AssetInfo, type AssetRef } from "@/lib/tauri";
import { queryFn, queryFnWithArgs } from "@/utils/query";

import { assetKey } from "../utils/assetRef";

export const previewKeys = {
  info: (asset: AssetRef) => ["asset-info", assetKey(asset)] as const,
  text: (url: string) => ["asset-text", url] as const,
};

/**
 * The most of a file the text viewer decodes.
 *
 * The client's largest JSON files are a few megabytes, and Save a copy reaches whatever
 * lies past this.
 */
export const MAX_TEXT_BYTES = 4 * 1024 * 1024;

/** A file's text, as much of it as the viewer decodes. */
export interface SourceText {
  text: string;
  sizeBytes: number;
  truncated: boolean;
}

async function readText(url: string): Promise<SourceText> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await response.text());

  const bytes = new Uint8Array(await response.arrayBuffer());
  const truncated = bytes.length > MAX_TEXT_BYTES;
  const text = new TextDecoder().decode(truncated ? bytes.subarray(0, MAX_TEXT_BYTES) : bytes);

  return { text, sizeBytes: bytes.length, truncated };
}

export const ritobinKeys = {
  integration: () => ["ritobin", "integration"] as const,
};

/** What an asset holds, beside the image the protocol draws. */
export const previewQueries = {
  /* The info and the pixels are separate requests on purpose. An `<img>` reports
     its pixel dimensions and nothing else, so the container, the block format and
     the mipmap count come over IPC while the pixels come over the protocol.

     A game chunk cannot change under a session, and a layer file that does is
     refetched by the tree that noticed. */
  assetInfo: (asset: AssetRef) =>
    queryOptions<AssetInfo, AppError>({
      queryKey: previewKeys.info(asset),
      queryFn: queryFnWithArgs(api.readAssetInfo, asset),
      staleTime: 5 * 60_000,
      retry: false,
    }),

  /* Keyed on the file URL, which names the file's version, so a layer file edited on disk
     reads again and a chunk is read once. */
  text: (url: string) =>
    queryOptions<SourceText, Error>({
      queryKey: previewKeys.text(url),
      queryFn: () => readText(url),
      staleTime: Infinity,
      retry: false,
    }),
} as const;

/** What VS Code's ritobin integration reports about itself. */
export const ritobinQueries = {
  /* The Explorer verb the ritobin-lsp extension installs, read out of the registry,
     so a user who installs it while the app is open gets the action on the next
     refetch rather than on the next launch. */
  integration: () =>
    queryOptions<boolean, AppError>({
      queryKey: ritobinKeys.integration(),
      queryFn: queryFn(api.detectRitobinIntegration),
      retry: false,
    }),
} as const;
