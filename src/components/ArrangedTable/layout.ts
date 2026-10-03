import type { RowDensity } from "./types";

/** How a reader arranged one table: its columns, row height and grouping. */
export interface TableLayoutState<Id extends string, Group extends string> {
  columnOrder: Id[];
  columnVisibility: Record<string, boolean>;
  columnSizing: Record<string, number>;
  density: RowDensity;
  groupBy: Group;
  /** Groups the reader folded, as `groupBy:key`. */
  collapsedGroups: Set<string>;

  setColumnOrder: (order: Id[]) => void;
  setColumnVisibility: (visibility: Record<string, boolean>) => void;
  setColumnSizing: (sizing: Record<string, number>) => void;
  setDensity: (density: RowDensity) => void;
  setGroupBy: (groupBy: Group) => void;
  toggleGroupCollapsed: (key: string) => void;
  resetLayout: () => void;
}

/**
 * A store holding a table layout, read by selector or all at once.
 *
 * A component takes it under a `use` name, as `store: useLayout`, or React
 * Compiler caches the read as a pure call and the component never updates.
 */
export interface TableLayoutStore<Id extends string, Group extends string> {
  <U>(selector: (state: TableLayoutState<Id, Group>) => U): U;
  getState: () => TableLayoutState<Id, Group>;
}

export interface TableLayoutDefaults<Id extends string, Group extends string> {
  /** Every column the table can draw, in its default order. */
  columns: readonly Id[];
  hidden: readonly Id[];
  groupBy: Group;
}

/** The layout fields a persisted table writes to disk. */
export const TABLE_LAYOUT_KEYS = [
  "columnOrder",
  "columnVisibility",
  "columnSizing",
  "density",
  "groupBy",
  "collapsedGroups",
] as const;

function initialLayout<Id extends string, Group extends string>(
  defaults: TableLayoutDefaults<Id, Group>,
) {
  return {
    columnOrder: [...defaults.columns],
    columnVisibility: Object.fromEntries(defaults.hidden.map((id) => [id, false])),
    columnSizing: {},
    density: "default" as RowDensity,
    groupBy: defaults.groupBy,
  };
}

/** The state and actions of a table layout, for a zustand store to spread into its own. */
export function tableLayoutSlice<Id extends string, Group extends string>(
  defaults: TableLayoutDefaults<Id, Group>,
  set: (
    partial:
      | Partial<TableLayoutState<Id, Group>>
      | ((state: TableLayoutState<Id, Group>) => Partial<TableLayoutState<Id, Group>>),
  ) => void,
): TableLayoutState<Id, Group> {
  return {
    ...initialLayout(defaults),
    collapsedGroups: new Set<string>(),

    setColumnOrder: (columnOrder) => set({ columnOrder }),
    setColumnVisibility: (columnVisibility) => set({ columnVisibility }),
    setColumnSizing: (columnSizing) => set({ columnSizing }),
    setDensity: (density) => set({ density }),
    setGroupBy: (groupBy) => set({ groupBy }),
    toggleGroupCollapsed: (key) =>
      set((state) => {
        const next = new Set(state.collapsedGroups);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return { collapsedGroups: next };
      }),
    resetLayout: () => set(initialLayout(defaults)),
  };
}

/**
 * Restore a saved layout over the current one.
 *
 * A column added after the layout was saved joins the end of the saved order,
 * and a column the table no longer draws drops out of it.
 */
export function mergeTableLayout<Id extends string, S extends { columnOrder: Id[] }>(
  columns: readonly Id[],
) {
  return (persisted: unknown, current: S): S => {
    const saved = (persisted ?? {}) as Partial<S> & { collapsedGroups?: Iterable<string> };
    const order = (saved.columnOrder ?? []).filter((id) => columns.includes(id));
    const missing = columns.filter((id) => !order.includes(id));

    return {
      ...current,
      ...saved,
      columnOrder: [...order, ...missing],
      collapsedGroups: new Set(saved.collapsedGroups ?? []),
    };
  };
}
