import { useEffect, useRef } from "react";
import { create } from "zustand";

/** The four closes of one editor group, each asking before it loses edits. */
export interface LeafCloses {
  closeOne: (id: string) => void;
  closeOthers: (id: string) => void;
  closeToRight: (id: string) => void;
  closeAll: () => void;
}

interface LeafCloseStore {
  closes: Readonly<Record<string, LeafCloses>>;
  publish: (leafId: string, closes: LeafCloses) => void;
  withdraw: (leafId: string) => void;
}

/*
 * Published by the mounted surface, the way a document's save and its find
 * are. The question a dirty document asks stands inside one group, and that
 * group's own queue holds it.
 */
const useLeafCloseStore = create<LeafCloseStore>()((set) => ({
  closes: {},
  publish: (leafId, closes) => set((state) => ({ closes: { ...state.closes, [leafId]: closes } })),
  withdraw: (leafId) =>
    set((state) => {
      if (!(leafId in state.closes)) return state;

      const closes = { ...state.closes };
      delete closes[leafId];
      return { closes };
    }),
}));

/**
 * Offer this group's guarded closes while its surface is mounted.
 *
 * A command outside the strip closes what the strip's own menu closes, through
 * the same unsaved-edits question. `closes` is read at call time. A fresh queue
 * each render publishes once.
 */
export function useLeafCloses(leafId: string, closes: LeafCloses): void {
  const current = useRef(closes);
  useEffect(() => {
    current.current = closes;
  });

  useEffect(() => {
    useLeafCloseStore.getState().publish(leafId, {
      closeOne: (id) => current.current.closeOne(id),
      closeOthers: (id) => current.current.closeOthers(id),
      closeToRight: (id) => current.current.closeToRight(id),
      closeAll: () => current.current.closeAll(),
    });
    return () => useLeafCloseStore.getState().withdraw(leafId);
  }, [leafId]);
}

/** The closes `leafId` offers, or null for a group no surface draws. */
export function leafCloses(leafId: string): LeafCloses | null {
  return useLeafCloseStore.getState().closes[leafId] ?? null;
}
