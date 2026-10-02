import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  EyeSlashIcon,
  ListNumbersIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  StackIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { ContextMenu } from "../ContextMenu";
import { tableCellClass, tableCellStyle } from "./cellClass";
import type { TableLayoutStore } from "./layout";
import type { ArrangedColumn, ArrangedSort } from "./types";
import type { ArrangedHeaderColumn } from "./useArrangedColumns";
import { useColumnDrag } from "./useColumnDrag";

/** Height of the sticky header row. */
export const ARRANGED_HEADER_HEIGHT = 36;

/** How the header sorts, and the sort it falls back to. */
export interface ArrangedSorting<Field extends string> {
  sort: ArrangedSort<Field>;
  onSort: (sort: ArrangedSort<Field>) => void;
  /** The sort a header menu offers as the way back, under `defaultLabel`. */
  defaultSort: ArrangedSort<Field>;
  defaultLabel: string;
  /** A field with one direction of its own, such as load order, which a click only switches to. */
  natural?: Field;
}

interface ArrangedTableHeaderProps<
  Id extends string,
  Field extends string,
  Group extends string,
  Spec extends ArrangedColumn<Id, Field, Group>,
> {
  columns: ArrangedHeaderColumn<Spec>[];
  store: TableLayoutStore<Id, Group>;
  sorting: ArrangedSorting<Field>;
  groupLabels: Record<Group, () => string>;
  /** The grouping that draws no headings. */
  ungrouped: Group;
  onMoveColumn: (id: Id, before: Id) => void;
  /** What a column draws in place of its header text, such as a Select all checkbox. */
  renderCell?: (spec: Spec) => ReactNode;
}

/** Where a header click takes the sort: ascending, then descending, then back to the default. */
function nextSort<Field extends string>(
  { sort, defaultSort, natural }: ArrangedSorting<Field>,
  field: Field,
): ArrangedSort<Field> {
  if (field === natural)
    return defaultSort.field === field ? defaultSort : { field, direction: "asc" };
  if (sort.field !== field) return { field, direction: "asc" };
  if (field === defaultSort.field) {
    return { field, direction: sort.direction === "asc" ? "desc" : "asc" };
  }
  if (sort.direction === "asc") return { field, direction: "desc" };
  return defaultSort;
}

/**
 * An arranged table's sticky header: sort, resize, reorder and a menu per column.
 *
 * A press that does not travel sorts, and one that does moves the column, so
 * the two share the header without a handle.
 */
export function ArrangedTableHeader<
  Id extends string,
  Field extends string,
  Group extends string,
  Spec extends ArrangedColumn<Id, Field, Group>,
>({
  columns,
  store,
  sorting,
  groupLabels,
  ungrouped,
  onMoveColumn,
  renderCell,
}: ArrangedTableHeaderProps<Id, Field, Group, Spec>) {
  const { sort, onSort, natural } = sorting;

  const movable = columns.filter((column) => !column.spec.pin).map((column) => column.spec.id);
  const tail = columns.find((column) => column.spec.pin === "end")?.spec.id ?? movable.at(-1);
  const { drag, rowRef, cellRef, consumeClick, handlers } = useColumnDrag<Id>(
    movable,
    tail as Id,
    onMoveColumn,
  );

  /** Moves a column one place along, or nowhere at either end. */
  function shift(id: Id, step: -1 | 1) {
    const at = movable.indexOf(id);
    if (at + step < 0 || at + step >= movable.length) return undefined;

    const before = step === -1 ? movable[at - 1] : (movable[at + 2] ?? tail);
    return () => onMoveColumn(id, before as Id);
  }

  return (
    <div
      ref={rowRef}
      role="row"
      data-ui="ArrangedTableHeader"
      style={{ gridTemplateColumns: "var(--table-cols)", height: ARRANGED_HEADER_HEIGHT }}
      className="group/header sticky top-0 z-[4] grid border-b border-surface-700 bg-surface-900 px-2 text-xs font-medium text-surface-400 select-none [--row-bg:var(--color-surface-900)]"
    >
      {columns.map((column) => {
        const { spec } = column;
        const custom = renderCell?.(spec);
        if (custom !== undefined) {
          return (
            <div
              key={spec.id}
              role="columnheader"
              style={tableCellStyle(spec)}
              className={tableCellClass(spec)}
            >
              {custom}
            </div>
          );
        }

        const sorted = spec.sortField !== undefined && sort.field === spec.sortField;
        const canMove = !spec.pin;
        const lifted = drag?.id === spec.id;
        const isNatural = spec.sortField !== undefined && spec.sortField === natural;

        const cell = (
          <div
            ref={canMove ? cellRef(spec.id) : undefined}
            role="columnheader"
            aria-sort={ariaSort(sorted, isNatural ? "asc" : sort.direction)}
            onPointerDown={canMove ? (event) => handlers.onPointerDown(event, spec.id) : undefined}
            onPointerMove={canMove ? handlers.onPointerMove : undefined}
            onPointerUp={canMove ? handlers.onPointerUp : undefined}
            onPointerCancel={canMove ? handlers.onPointerCancel : undefined}
            onClick={() => {
              if (consumeClick()) return;
              if (spec.sortField) onSort(nextSort(sorting, spec.sortField));
            }}
            style={{
              ...tableCellStyle(spec),
              ...(lifted && { transform: `translateX(${drag.offset}px)` }),
            }}
            className={tableCellClass(
              spec,
              "group/head gap-1 whitespace-nowrap transition-colors",
              spec.sortField && "cursor-pointer hover:text-surface-200",
              sorted && "text-surface-100",
              lifted &&
                "z-[3] cursor-grabbing rounded-md text-surface-100 shadow-md transition-none [--row-bg:var(--color-surface-800)]",
            )}
          >
            {isNatural && sorted && <SortMark direction="asc" />}
            <span className="truncate">{spec.header()}</span>
            {!isNatural && sorted && <SortMark direction={sort.direction} />}
            {spec.sortField && !isNatural && !sorted && (
              <CaretUpDownIcon
                weight="bold"
                className="size-3 shrink-0 text-surface-500 opacity-0 transition-opacity group-hover/head:opacity-100"
              />
            )}
            {column.canResize && <ResizeHandle column={column} />}
          </div>
        );

        return (
          <ContextMenu.Root key={spec.id}>
            <ContextMenu.Trigger render={cell} />
            <ContextMenu.Content>
              <HeaderMenuItems
                column={column}
                store={store}
                sorting={sorting}
                groupLabels={groupLabels}
                ungrouped={ungrouped}
                onMoveLeft={canMove ? shift(spec.id, -1) : undefined}
                onMoveRight={canMove ? shift(spec.id, 1) : undefined}
              />
            </ContextMenu.Content>
          </ContextMenu.Root>
        );
      })}
      {drag && !drag.idle && (
        <span
          aria-hidden="true"
          style={{ left: drag.indicator - 1 }}
          className="pointer-events-none absolute inset-y-1.5 z-[5] w-0.5 rounded-full bg-accent-400"
        />
      )}
    </div>
  );
}

function ariaSort(sorted: boolean, direction: "asc" | "desc") {
  if (!sorted) return "none";
  return direction === "asc" ? "ascending" : "descending";
}

function SortMark({ direction }: { direction: "asc" | "desc" }) {
  const Icon = direction === "asc" ? CaretUpIcon : CaretDownIcon;
  return <Icon weight="bold" className="size-3.5 shrink-0 text-accent-400" />;
}

function ResizeHandle<Spec extends ArrangedColumn>({
  column,
}: {
  column: ArrangedHeaderColumn<Spec>;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={column.spec.name()}
      onMouseDown={column.onResizeStart}
      onTouchStart={column.onResizeStart}
      onDoubleClick={column.onResetSize}
      onClick={(event) => event.stopPropagation()}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      className="group/resize absolute inset-y-0 right-0 z-[2] w-2 cursor-col-resize"
    >
      <span
        className={twMerge(
          "absolute inset-y-2.5 right-0 w-px bg-surface-600 opacity-0 transition-[opacity,background-color] group-hover/header:opacity-100 group-hover/resize:inset-y-1 group-hover/resize:w-0.5 group-hover/resize:bg-accent-400",
          column.isResizing && "inset-y-1 w-0.5 bg-accent-400 opacity-100",
        )}
      />
    </span>
  );
}

interface HeaderMenuItemsProps<
  Id extends string,
  Field extends string,
  Group extends string,
  Spec extends ArrangedColumn<Id, Field, Group>,
> {
  column: ArrangedHeaderColumn<Spec>;
  store: TableLayoutStore<Id, Group>;
  sorting: ArrangedSorting<Field>;
  groupLabels: Record<Group, () => string>;
  ungrouped: Group;
  /** Moves the column one place left, absent where it cannot move that way. */
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}

function HeaderMenuItems<
  Id extends string,
  Field extends string,
  Group extends string,
  Spec extends ArrangedColumn<Id, Field, Group>,
>({
  column,
  store: useLayout,
  sorting,
  groupLabels,
  ungrouped,
  onMoveLeft,
  onMoveRight,
}: HeaderMenuItemsProps<Id, Field, Group, Spec>) {
  const { spec } = column;
  const { sort, onSort, defaultSort, defaultLabel, natural } = sorting;
  const groupBy = useLayout((s) => s.groupBy);
  const setGroupBy = useLayout((s) => s.setGroupBy);
  const visibility = useLayout((s) => s.columnVisibility);
  const setVisibility = useLayout((s) => s.setColumnVisibility);
  const resetLayout = useLayout((s) => s.resetLayout);
  const field = spec.sortField;
  const isDefault = sort.field === defaultSort.field && sort.direction === defaultSort.direction;

  return (
    <>
      {field && field !== natural && (
        <>
          <ContextMenu.Item
            icon={<SortAscendingIcon weight="bold" className="size-4" />}
            onClick={() => onSort({ field, direction: "asc" })}
          >
            {m.common_table_sort_asc_action()}
          </ContextMenu.Item>
          <ContextMenu.Item
            icon={<SortDescendingIcon weight="bold" className="size-4" />}
            onClick={() => onSort({ field, direction: "desc" })}
          >
            {m.common_table_sort_desc_action()}
          </ContextMenu.Item>
        </>
      )}
      {!isDefault && (
        <ContextMenu.Item
          icon={<ListNumbersIcon weight="bold" className="size-4" />}
          onClick={() => onSort(defaultSort)}
        >
          {defaultLabel}
        </ContextMenu.Item>
      )}
      {spec.groupBy && <ContextMenu.Separator />}
      {spec.groupBy?.map((option) => (
        <ContextMenu.Item
          key={option}
          icon={<StackIcon weight="bold" className="size-4" />}
          onClick={() => setGroupBy(groupBy === option ? ungrouped : option)}
        >
          {groupBy === option
            ? m.common_table_ungroup_action()
            : m.common_table_group_by_action({ field: groupLabels[option]() })}
        </ContextMenu.Item>
      ))}
      <ContextMenu.Separator />
      {!spec.pin && (
        <>
          <ContextMenu.Item
            icon={<ArrowLeftIcon weight="bold" className="size-4" />}
            disabled={!onMoveLeft}
            onClick={onMoveLeft}
          >
            {m.common_table_move_left_action()}
          </ContextMenu.Item>
          <ContextMenu.Item
            icon={<ArrowRightIcon weight="bold" className="size-4" />}
            disabled={!onMoveRight}
            onClick={onMoveRight}
          >
            {m.common_table_move_right_action()}
          </ContextMenu.Item>
        </>
      )}
      {column.canResize && (
        <ContextMenu.Item onClick={column.onResetSize}>
          {m.common_table_reset_width_action()}
        </ContextMenu.Item>
      )}
      {!spec.required && (
        <ContextMenu.Item
          icon={<EyeSlashIcon weight="bold" className="size-4" />}
          onClick={() => setVisibility({ ...visibility, [spec.id]: false })}
        >
          {m.common_table_hide_column_action()}
        </ContextMenu.Item>
      )}
      <ContextMenu.Item
        icon={<ArrowCounterClockwiseIcon weight="bold" className="size-4" />}
        onClick={resetLayout}
      >
        {m.common_table_reset_action()}
      </ContextMenu.Item>
    </>
  );
}
