import { create } from "zustand";
import { persist } from "zustand/middleware";

import { keepUnversioned, sessionJsonStorage } from "@/stores/storage";

interface WorkshopSelectionStore {
  selectedPaths: Set<string>;
  /** The project a shift range runs from: the last one picked without shift. */
  anchorId: string | null;
  /** The selection a shift range adds to, so a second shift-click moves the range's far end. */
  rangeBase: Set<string> | null;
  toggle: (path: string) => void;
  /** Drops the rest and keeps this one, which is what a right click outside the selection does. */
  selectOnly: (path: string) => void;
  selectAll: (paths: string[]) => void;
  setAnchor: (path: string | null) => void;
  /** Picks one project where no anchor stands to range from, and anchors there. */
  selectRangeTo: (path: string) => void;
  /** Pick `paths` as the range from the anchor, replacing the range drawn before it. */
  selectRange: (paths: string[]) => void;
  addMany: (paths: string[]) => void;
  removeMany: (paths: string[]) => void;
  clear: () => void;
}

export const useWorkshopSelectionStore = create<WorkshopSelectionStore>()(
  persist(
    (set) => ({
      selectedPaths: new Set(),
      anchorId: null,
      rangeBase: null,
      toggle: (path) =>
        set((state) => {
          const next = new Set(state.selectedPaths);
          if (next.has(path)) {
            next.delete(path);
          } else {
            next.add(path);
          }
          return { selectedPaths: next, anchorId: path, rangeBase: null };
        }),
      selectOnly: (path) =>
        set({ selectedPaths: new Set([path]), anchorId: path, rangeBase: null }),
      selectAll: (paths) => set({ selectedPaths: new Set(paths), rangeBase: null }),
      setAnchor: (path) => set({ anchorId: path, rangeBase: null }),
      selectRangeTo: (path) =>
        set((state) => ({
          selectedPaths: new Set(state.selectedPaths).add(path),
          anchorId: path,
          rangeBase: null,
        })),
      selectRange: (paths) =>
        set((state) => {
          const base = state.rangeBase ?? state.selectedPaths;
          const next = new Set(base);
          for (const path of paths) next.add(path);
          return { selectedPaths: next, rangeBase: base };
        }),
      addMany: (paths) =>
        set((state) => {
          const next = new Set(state.selectedPaths);
          for (const path of paths) next.add(path);
          return { selectedPaths: next, rangeBase: null };
        }),
      removeMany: (paths) =>
        set((state) => {
          const next = new Set(state.selectedPaths);
          for (const path of paths) next.delete(path);
          return { selectedPaths: next, rangeBase: null };
        }),
      clear: () => set({ selectedPaths: new Set(), anchorId: null, rangeBase: null }),
    }),
    {
      name: "workshop-selection",
      version: 1,
      migrate: keepUnversioned<WorkshopSelectionStore>,
      storage: sessionJsonStorage,
      partialize: (state) => ({ selectedPaths: state.selectedPaths }),
    },
  ),
);
