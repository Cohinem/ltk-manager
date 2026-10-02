import { create } from "zustand";

interface OpenedFilesStore {
  paths: string[];
  enqueue: (paths: string[]) => void;
  take: () => string[];
}

/** Mod files opened from Explorer that the library has not installed yet. */
export const useOpenedFilesStore = create<OpenedFilesStore>()((set, get) => ({
  paths: [],
  enqueue: (paths) => set((state) => ({ paths: [...state.paths, ...paths] })),
  take: () => {
    const { paths } = get();
    set({ paths: [] });
    return paths;
  },
}));
