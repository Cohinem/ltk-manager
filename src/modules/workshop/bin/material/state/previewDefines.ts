import { useMemo } from "react";
import { create } from "zustand";

import type { BinDocumentId, PreviewMaterial } from "@/lib/tauri";

/** The value of each define a shader def's preview sets, by define name. */
type Picked = Readonly<Record<string, string>>;

interface PreviewDefinesStore {
  /** What each open shader def's preview sets, by `previewKey`. */
  picked: Readonly<Record<string, Picked>>;
  /**
   * The material each open shader def's preview draws through, by `previewKey`. Null draws the
   * def's defaults, and an absent key draws the first material that links the def.
   */
  materials: Readonly<Record<string, PreviewMaterial | null>>;
  /** Sets `name` to `value` in the preview of `key`, or clears it if `value` is null. */
  pick: (key: string, name: string, value: string | null) => void;
  /** Clears every define the preview of `key` sets. */
  clear: (key: string) => void;
  /** Draws the preview of `key` through `material`, or with the defaults if it is null. */
  drawThrough: (key: string, material: PreviewMaterial | null) => void;
}

const NONE: Picked = {};

/**
 * The preview material and preview defines of each open shader def, held for the session and
 * never written to the bin. "The material shell" in docs/ux/BIN_EDITOR.md.
 */
export const usePreviewDefinesStore = create<PreviewDefinesStore>()((set) => ({
  picked: {},
  materials: {},
  pick: (key, name, value) =>
    set((state) => {
      const { [name]: _, ...rest } = state.picked[key] ?? NONE;
      const next = value === null ? rest : { ...rest, [name]: value };
      return { picked: { ...state.picked, [key]: next } };
    }),
  clear: (key) =>
    set((state) => {
      const { [key]: _, ...rest } = state.picked;
      return { picked: rest };
    }),
  drawThrough: (key, material) =>
    set((state) => ({ materials: { ...state.materials, [key]: material } })),
}));

/** Returns the key a shader def's preview state is held under. */
export function previewKey(document: BinDocumentId, entry: string): string {
  return `${document}:${entry}`;
}

/** Returns `picked` as `NAME=VALUE` entries sorted by name. */
export function definesOf(picked: Picked): string[] {
  return Object.keys(picked)
    .sort()
    .map((name) => `${name}=${picked[name]}`);
}

/** Returns what the preview of `entry` sets, by define name. */
export function usePickedDefines(document: BinDocumentId, entry: string | null): Picked {
  return usePreviewDefinesStore((state) =>
    entry === null ? NONE : (state.picked[previewKey(document, entry)] ?? NONE),
  );
}

/** Returns the defines the preview of `entry` sets, as `definesOf` lists them. */
export function usePreviewDefines(document: BinDocumentId, entry: string | null): string[] {
  const picked = usePickedDefines(document, entry);
  return useMemo(() => definesOf(picked), [picked]);
}

/**
 * Returns the material that the reader chose for the preview of `entry`. Returns null for the
 * defaults, and undefined if the reader has not chosen.
 */
export function usePickedMaterial(
  document: BinDocumentId,
  entry: string | null,
): PreviewMaterial | null | undefined {
  return usePreviewDefinesStore((state) =>
    entry === null ? undefined : state.materials[previewKey(document, entry)],
  );
}
