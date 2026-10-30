import { create } from "zustand";

import type { AssetRef } from "@/lib/tauri";

import { assetKey } from "../../preview/utils/assetRef";

/** A request to select one media row of the document of one audio file. */
export interface MediaFocusRequest {
  /** The `assetKey` of the file. */
  readonly asset: string;
  readonly source: number;
  /** Distinct per request, so a second request for the same row still lands. */
  readonly serial: number;
}

interface MediaFocusState {
  readonly request: MediaFocusRequest | null;
  readonly focus: (asset: AssetRef, source: number) => void;
}

/**
 * The media row that the event tree's "Show media" asks the document of `asset` to select.
 *
 * The event tree opens the document and writes the request, and the document's media panel
 * reads it, so neither knows the other's tab.
 */
export const useMediaFocusStore = create<MediaFocusState>((set) => ({
  request: null,
  focus: (asset, source) =>
    set((state) => ({
      request: { asset: assetKey(asset), source, serial: (state.request?.serial ?? 0) + 1 },
    })),
}));

/** The request that targets `asset`, or `null`. */
export function useMediaFocus(asset: AssetRef): MediaFocusRequest | null {
  const key = assetKey(asset);
  return useMediaFocusStore((state) => (state.request?.asset === key ? state.request : null));
}

/** Asks the document of `asset` to select the media row `source`. */
export function useFocusMedia(): (asset: AssetRef, source: number) => void {
  return useMediaFocusStore((state) => state.focus);
}
