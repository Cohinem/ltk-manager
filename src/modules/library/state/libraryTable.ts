import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import {
  mergeTableLayout,
  type RowDensity,
  TABLE_LAYOUT_KEYS,
  type TableLayoutState,
  tableLayoutSlice,
} from "@/components";
import { keepUnversioned, localJsonStorage } from "@/stores/storage";

/** A column the library table can draw, in its default order. */
export const TABLE_COLUMNS = [
  "select",
  "enabled",
  "priority",
  "art",
  "name",
  "categories",
  "author",
  "version",
  "layers",
  "health",
  "installed",
  "folder",
  "format",
  "storage",
  "license",
  "menu",
] as const;

export type TableColumnId = (typeof TABLE_COLUMNS)[number];

export type { RowDensity };

/** The field the table groups its rows by. */
export type TableGroupBy =
  | "none"
  | "folder"
  | "champion"
  | "map"
  | "tag"
  | "author"
  | "health"
  | "enabled"
  | "installed"
  | "format"
  | "storage"
  | "license";

const LAYOUT_DEFAULTS = {
  columns: TABLE_COLUMNS,
  hidden: ["installed", "folder", "format", "storage", "license"],
  groupBy: "folder",
} as const;

/** The width the dock opens at before anyone drags it. */
export const DEFAULT_DOCK_WIDTH = 420;

/** The narrowest a drag may leave the dock. */
const MIN_DOCK_WIDTH = 320;

/** What the dock always leaves the table beside it. */
const TABLE_KEPT = 560;

/** What a drag may leave the dock, given the room `available` holds for table and dock. */
export function clampDockWidth(next: number, available: number): number {
  const ceiling = Math.max(MIN_DOCK_WIDTH, available - TABLE_KEPT);
  return Math.round(Math.max(MIN_DOCK_WIDTH, Math.min(next, ceiling)));
}

/** The library table's layout. Folders keep their folds in `expandedFolders` rather than here. */
interface LibraryTableStore extends TableLayoutState<TableColumnId, TableGroupBy> {
  dockWidth: number;
  dockCollapsed: boolean;
  setDockWidth: (width: number) => void;
  setDockCollapsed: (collapsed: boolean) => void;
}

/**
 * How the reader arranged the library table, and the dock beside it.
 *
 * Per machine rather than per profile, because a profile is an enabled-set and a
 * layout that changed with it would move columns under the reader.
 */
export const useLibraryTableStore = create<LibraryTableStore>()(
  persist(
    (set) => ({
      ...tableLayoutSlice<TableColumnId, TableGroupBy>(LAYOUT_DEFAULTS, set),
      dockWidth: DEFAULT_DOCK_WIDTH,
      dockCollapsed: false,
      setDockWidth: (dockWidth) => set({ dockWidth }),
      setDockCollapsed: (dockCollapsed) => set({ dockCollapsed }),
    }),
    {
      name: "ltk-library-table",
      version: 1,
      migrate: keepUnversioned,
      merge: mergeTableLayout<TableColumnId, LibraryTableStore>(TABLE_COLUMNS),
      storage: localJsonStorage,
      partialize: (state) => ({
        ...Object.fromEntries(TABLE_LAYOUT_KEYS.map((key) => [key, state[key]])),
        dockWidth: state.dockWidth,
        dockCollapsed: state.dockCollapsed,
      }),
    },
  ),
);

export const useTableDensity = () => useLibraryTableStore((s) => s.density);
export const useTableGroupBy = () => useLibraryTableStore((s) => s.groupBy);
export const useTableDockCollapsed = () => useLibraryTableStore((s) => s.dockCollapsed);
export const useLibraryTableActions = () =>
  useLibraryTableStore(
    useShallow((s) => ({
      setColumnOrder: s.setColumnOrder,
      setColumnVisibility: s.setColumnVisibility,
      setColumnSizing: s.setColumnSizing,
      setDensity: s.setDensity,
      setGroupBy: s.setGroupBy,
      toggleGroupCollapsed: s.toggleGroupCollapsed,
      setDockWidth: s.setDockWidth,
      setDockCollapsed: s.setDockCollapsed,
      resetLayout: s.resetLayout,
    })),
  );
