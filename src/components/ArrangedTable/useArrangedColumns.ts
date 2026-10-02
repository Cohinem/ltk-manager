import {
  type ColumnDef,
  columnOrderingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  tableFeatures,
  type Updater,
  useTable,
} from "@tanstack/react-table";
import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import type { TableLayoutStore } from "./layout";
import type { ArrangedColumn } from "./types";

const features = tableFeatures({
  columnSizingFeature,
  columnResizingFeature,
  columnOrderingFeature,
  columnVisibilityFeature,
});

const NO_DATA: Record<string, never>[] = [];

/** A visible column as the header draws it, with its resize controls. */
export interface ArrangedHeaderColumn<Spec extends ArrangedColumn> {
  spec: Spec;
  canResize: boolean;
  isResizing: boolean;
  onResizeStart: (event: unknown) => void;
  onResetSize: () => void;
}

function applyUpdater<T>(updater: Updater<T>, current: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(current) : updater;
}

/** Pinned start columns first and the pinned end column last, whatever order was saved. */
function pinnedOrder<Id extends string>(order: Id[], specs: Record<Id, ArrangedColumn<Id>>): Id[] {
  const start = order.filter((id) => specs[id].pin === "start");
  const end = order.filter((id) => specs[id].pin === "end");
  const middle = order.filter((id) => !specs[id].pin);
  return [...start, ...middle, ...end];
}

interface ArrangedColumnsArgs<Id extends string, Spec extends ArrangedColumn<Id>> {
  /** Every column the table can draw, in its default order. */
  columns: readonly Id[];
  specs: Record<Id, Spec>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: TableLayoutStore<Id, any>;
  scrollerRef: RefObject<HTMLDivElement | null>;
  /** Space between the frame and the rows on each side, in pixels. */
  gutter: number;
}

/**
 * An arranged table's columns as the reader left them, and the grid template that draws them.
 *
 * Order, visibility and widths live in the layout store. The `fill` column
 * takes whatever width the others leave, so the table fills its frame. The
 * returned `style` sets the grid template and the `--sticky-<id>` offsets that
 * `tableCellStyle` reads.
 */
export function useArrangedColumns<Id extends string, Spec extends ArrangedColumn<Id>>({
  columns,
  specs,
  store: useLayout,
  scrollerRef,
  gutter,
}: ArrangedColumnsArgs<Id, Spec>) {
  const columnOrder = useLayout((s) => s.columnOrder);
  const columnVisibility = useLayout((s) => s.columnVisibility);
  const columnSizing = useLayout((s) => s.columnSizing);
  const density = useLayout((s) => s.density);

  const columnDefs = useMemo<ColumnDef<typeof features, Record<string, never>>[]>(
    () =>
      columns.map((id) => {
        const spec = specs[id];
        return {
          id,
          header: spec.header(),
          size: spec.size,
          minSize: spec.minSize ?? spec.size,
          enableResizing: !spec.pin && !spec.fill && !spec.fitted,
          enableHiding: !spec.required,
        };
      }),
    [columns, specs],
  );

  const table = useTable({
    features,
    columns: columnDefs,
    data: NO_DATA,
    columnResizeMode: "onChange",
    state: {
      columnOrder: pinnedOrder(columnOrder, specs),
      columnVisibility,
      columnSizing,
    },
    onColumnSizingChange: (updater) => {
      const layout = useLayout.getState();
      layout.setColumnSizing(applyUpdater(updater, layout.columnSizing));
    },
    onColumnVisibilityChange: (updater) => {
      const layout = useLayout.getState();
      layout.setColumnVisibility(applyUpdater(updater, layout.columnVisibility));
    },
    onColumnOrderChange: (updater) => {
      const layout = useLayout.getState();
      const next = applyUpdater(updater, layout.columnOrder as string[]) as Id[];
      layout.setColumnOrder(pinnedOrder(next, specs));
    },
  });

  const leafColumns = table.getVisibleLeafColumns();
  const visible = useMemo<Spec[]>(
    () => leafColumns.map((column) => specs[column.id as Id]),
    /* The leaf list is rebuilt per render, so its ids are what decide a change. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leafColumns.map((column) => column.id).join(","), specs],
  );

  const [available, setAvailable] = useState(0);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const measure = () => setAvailable(scroller.clientWidth - 2 * gutter);
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    measure();
    return () => observer.disconnect();
  }, [scrollerRef, gutter]);

  const widthOf = (id: string, size: number) => specs[id as Id].fitted?.(density) ?? size;
  const fixedWidth = leafColumns
    .filter((column) => !specs[column.id as Id].fill)
    .reduce((sum, column) => sum + widthOf(column.id, column.getSize()), 0);
  const fillColumn = leafColumns.find((column) => specs[column.id as Id].fill);
  const fillWidth = Math.max(fillColumn?.getSize() ?? 0, available - fixedWidth);
  const widths = leafColumns.map((column) =>
    column === fillColumn ? fillWidth : widthOf(column.id, column.getSize()),
  );
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);

  const style: Record<string, string> = {
    "--table-cols": widths.map((width) => `${width}px`).join(" "),
  };
  let pinnedWidth = 0;
  leafColumns.forEach((column, index) => {
    const spec = specs[column.id as Id];
    if (spec.pin === "start") {
      style[`--sticky-${spec.id}`] = `${pinnedWidth}px`;
      pinnedWidth += widths[index];
    }
  });
  for (const spec of visible) {
    if (spec.sticky) style[`--sticky-${spec.id}`] = `${pinnedWidth}px`;
  }
  style["--sticky-label"] = `${pinnedWidth}px`;

  const headerColumns: ArrangedHeaderColumn<Spec>[] = leafColumns.map((column) => {
    const header = table.getFlatHeaders().find((candidate) => candidate.column.id === column.id);
    return {
      spec: specs[column.id as Id],
      canResize: column.getCanResize(),
      isResizing: column.getIsResizing(),
      onResizeStart: header?.getResizeHandler() ?? (() => {}),
      onResetSize: () => column.resetSize(),
    };
  });

  const moveColumn = useCallback(
    (id: Id, before: Id) => {
      const layout = useLayout.getState();
      const order = layout.columnOrder.filter((candidate) => candidate !== id);
      order.splice(order.indexOf(before), 0, id);
      layout.setColumnOrder(pinnedOrder(order, specs));
    },
    [useLayout, specs],
  );

  return {
    columns: visible,
    headerColumns,
    totalWidth,
    style: style as CSSProperties,
    moveColumn,
  };
}
