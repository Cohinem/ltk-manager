import { create } from "zustand";

interface PackRunsStore {
  /** Paths of the projects a pack is writing now. */
  packing: ReadonlySet<string>;
  start: (paths: string[]) => string[];
  finish: (path: string) => void;
}

/**
 * The projects being packed, wherever the pack was started.
 *
 * A pack outlives the menu or the card that started it, so every Pack control reads its
 * busy state here rather than from a mutation of its own.
 */
export const usePackRunsStore = create<PackRunsStore>()((set, get) => ({
  packing: new Set(),
  /* Answers the paths it claimed, so a second press on a project already packing is
     dropped rather than writing the same archive twice at once. */
  start: (paths) => {
    const claimed = paths.filter((path) => !get().packing.has(path));
    if (claimed.length > 0) {
      set((state) => ({ packing: new Set([...state.packing, ...claimed]) }));
    }

    return claimed;
  },
  finish: (path) =>
    set((state) => {
      const packing = new Set(state.packing);
      packing.delete(path);
      return { packing };
    }),
}));

export function useIsPacking(projectPath: string): boolean {
  return usePackRunsStore((state) => state.packing.has(projectPath));
}
