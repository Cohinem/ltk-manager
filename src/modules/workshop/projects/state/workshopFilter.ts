import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import {
  facetFilterActions,
  facetFilterSlice,
  type FacetFilterState,
  hasActiveFacets,
  type SortConfig as FacetSortConfig,
  type SortDirection,
} from "@/stores/facetFilter";
import { keepUnversioned, localJsonStorage } from "@/stores/storage";

/** How the workshop draws its projects, as cards or as a table. */
export type ViewMode = "grid" | "table";

export type WorkshopSortField = "name" | "lastModified" | "lastOpened";

/** Which projects the grid lists by where they live. */
export type WorkshopLocationFilter = "all" | "workshop" | "opened";
export type WorkshopSortDirection = SortDirection;
export type WorkshopSortConfig = FacetSortConfig<WorkshopSortField>;

interface WorkshopFilterStore extends FacetFilterState<WorkshopSortField> {
  viewMode: ViewMode;
  searchQuery: string;
  location: WorkshopLocationFilter;
  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  setLocation: (location: WorkshopLocationFilter) => void;
}

/** The sort the grid opens on, and the one a table header's menu goes back to. */
export const DEFAULT_WORKSHOP_SORT: WorkshopSortConfig = { field: "lastOpened", direction: "desc" };

/* The view mode outlives a restart. The query and the filters are the session's. */
export const useWorkshopFilterStore = create<WorkshopFilterStore>()(
  persist(
    (set) => {
      const facets = facetFilterSlice<WorkshopSortField>(DEFAULT_WORKSHOP_SORT, set);

      return {
        ...facets,
        /* The location is a facet like the others, so clearing them clears it too. */
        clearFilters: () => {
          facets.clearFilters();
          set({ location: "all" });
        },

        viewMode: "grid",
        searchQuery: "",
        location: "all",
        setViewMode: (mode) => set({ viewMode: mode }),
        setSearchQuery: (query) => set({ searchQuery: query }),
        setLocation: (location) => set({ location }),
      };
    },
    {
      name: "ltk-workshop-view",
      version: 1,
      migrate: keepUnversioned,
      storage: localJsonStorage,
      partialize: (state) => ({ viewMode: state.viewMode }),
    },
  ),
);

export function useHasActiveWorkshopFilters() {
  return useWorkshopFilterStore((s) => hasActiveFacets(s) || s.location !== "all");
}

export const useWorkshopViewMode = () => useWorkshopFilterStore((s) => s.viewMode);
export const useSetWorkshopViewMode = () => useWorkshopFilterStore((s) => s.setViewMode);
export const useWorkshopSearchQuery = () => useWorkshopFilterStore((s) => s.searchQuery);
export const useSetWorkshopSearchQuery = () => useWorkshopFilterStore((s) => s.setSearchQuery);
export const useWorkshopSelectedTags = () => useWorkshopFilterStore((s) => s.selectedTags);
export const useWorkshopSelectedChampions = () =>
  useWorkshopFilterStore((s) => s.selectedChampions);
export const useWorkshopSelectedMaps = () => useWorkshopFilterStore((s) => s.selectedMaps);
export const useWorkshopSort = () => useWorkshopFilterStore((s) => s.sort);
export const useWorkshopLocation = () => useWorkshopFilterStore((s) => s.location);
export const useSetWorkshopLocation = () => useWorkshopFilterStore((s) => s.setLocation);
export const useWorkshopFilterActions = () =>
  useWorkshopFilterStore(useShallow(facetFilterActions<WorkshopSortField>));
