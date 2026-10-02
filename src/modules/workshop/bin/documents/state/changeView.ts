import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ChangeBaseline } from "@/lib/tauri";
import { keepUnversioned, localJsonStorage } from "@/stores/storage";

interface ChangeViewStore {
  /** Rows and nodes that differ from the baseline carry a mark. */
  marks: boolean;
  toggleMarks: () => void;
  /** What a change is measured from: the file as it was opened, or the game's copy. */
  baseline: ChangeBaseline;
  setBaseline: (baseline: ChangeBaseline) => void;
  /** The inspector lists only changed properties, and the graph fades unchanged nodes. */
  changedOnly: boolean;
  toggleChangedOnly: () => void;
}

export const useChangeViewStore = create<ChangeViewStore>()(
  persist(
    (set) => ({
      marks: true,
      toggleMarks: () => set((state) => ({ marks: !state.marks })),
      baseline: "opened",
      setBaseline: (baseline) => set({ baseline }),
      changedOnly: false,
      toggleChangedOnly: () => set((state) => ({ changedOnly: !state.changedOnly })),
    }),
    {
      name: "bin-change-view",
      version: 1,
      migrate: keepUnversioned<ChangeViewStore>,
      storage: localJsonStorage,
    },
  ),
);

export function useChangeMarks(): boolean {
  return useChangeViewStore((state) => state.marks);
}

export function useChangeBaseline(): ChangeBaseline {
  return useChangeViewStore((state) => state.baseline);
}

export function useChangedOnly(): boolean {
  return useChangeViewStore((state) => state.changedOnly);
}
