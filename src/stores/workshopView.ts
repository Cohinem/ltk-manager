import { create } from "zustand";

/** How the workshop draws its projects, as cards or as rows. */
export type ViewMode = "grid" | "list";

interface WorkshopViewStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useWorkshopViewStore = create<WorkshopViewStore>((set) => ({
  viewMode: "grid",
  setViewMode: (mode) => set({ viewMode: mode }),
  searchQuery: "",
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
