import { useEffect } from "react";
import { create } from "zustand";

import type { BinDocumentId } from "@/lib/tauri";

/** What a bin or object tab holds open: the id its rows are read under, and its object. */
export interface OpenBin {
  readonly document: BinDocumentId;
  /** The object an object tab is over, `0x` and eight hex digits. Null for a file tab. */
  readonly entry: string | null;
}

interface OpenBinsStore {
  /** By the editor's id for the tab. */
  byTab: Readonly<Record<string, OpenBin>>;
  hold: (tabId: string, bin: OpenBin) => void;
  /** Forget the tab's bin, unless a newer open replaced `document` already. */
  release: (tabId: string, document: BinDocumentId) => void;
}

/**
 * The open bin behind each bin and object tab, which the project bar's `@` scope searches.
 *
 * A tab's handle lives in the component that opened it, so the tab lends it here for as
 * long as it is mounted.
 */
export const useOpenBinsStore = create<OpenBinsStore>()((set) => ({
  byTab: {},
  hold: (tabId, bin) => set((state) => ({ byTab: { ...state.byTab, [tabId]: bin } })),
  release: (tabId, document) =>
    set((state) => {
      if (state.byTab[tabId]?.document !== document) return state;
      return {
        byTab: Object.fromEntries(Object.entries(state.byTab).filter(([id]) => id !== tabId)),
      };
    }),
}));

/** The open bin behind the tab `tabId`, or null for a tab that holds none. */
export function useOpenBin(tabId: string | null): OpenBin | null {
  return useOpenBinsStore((s) => (tabId === null ? null : (s.byTab[tabId] ?? null)));
}

/** Lend the tab `tabId`'s open bin to the `@` scope while the caller is mounted. */
export function useLendOpenBin(tabId: string, document: BinDocumentId, entry: string | null) {
  const hold = useOpenBinsStore((s) => s.hold);
  const release = useOpenBinsStore((s) => s.release);
  useEffect(() => {
    hold(tabId, { document, entry });
    return () => release(tabId, document);
  }, [tabId, document, entry, hold, release]);
}
