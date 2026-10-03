import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  mergeTableLayout,
  TABLE_LAYOUT_KEYS,
  type TableLayoutState,
  tableLayoutSlice,
} from "@/components";
import { keepUnversioned, localJsonStorage } from "@/stores/storage";

/** A column the project table can draw, in its default order. */
export const PROJECT_COLUMNS = [
  "select",
  "art",
  "name",
  "categories",
  "author",
  "version",
  "layers",
  "location",
  "modified",
  "opened",
  "actions",
  "menu",
] as const;

export type ProjectColumnId = (typeof PROJECT_COLUMNS)[number];

/** The field the project table groups its rows by. */
export type ProjectGroupBy = "none" | "location" | "champion" | "map" | "tag" | "author";

const LAYOUT_DEFAULTS = {
  columns: PROJECT_COLUMNS,
  hidden: ["layers", "location", "modified"],
  groupBy: "none",
} as const;

type ProjectTableStore = TableLayoutState<ProjectColumnId, ProjectGroupBy>;

/** How the reader arranged the workshop's project table. Per machine, like the library's. */
export const useProjectTableStore = create<ProjectTableStore>()(
  persist((set) => tableLayoutSlice<ProjectColumnId, ProjectGroupBy>(LAYOUT_DEFAULTS, set), {
    name: "ltk-workshop-table",
    version: 1,
    migrate: keepUnversioned,
    merge: mergeTableLayout<ProjectColumnId, ProjectTableStore>(PROJECT_COLUMNS),
    storage: localJsonStorage,
    partialize: (state) =>
      Object.fromEntries(
        TABLE_LAYOUT_KEYS.map((key) => [key, state[key]]),
      ) as Partial<ProjectTableStore>,
  }),
);
