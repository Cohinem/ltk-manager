import { CaretDownIcon } from "@phosphor-icons/react";
import type { ReactElement, ReactNode } from "react";

import { m } from "@/i18n";
import { twMerge } from "@/utils";

import { tableCellClass, tableCellStyle, tableEdgeClass } from "./cellClass";
import type { ArrangedColumn } from "./types";

/** Height of a group heading, which does not follow the row density. */
export const ARRANGED_GROUP_HEIGHT = 40;

interface ArrangedGroupHeadingProps {
  columns: ArrangedColumn[];
  label: string;
  /** The heading's count, such as "4 mods". */
  count: string;
  expanded: boolean;
  /** Whether a press folds the group, which a search or a filter holds open. */
  foldable: boolean;
  isCurrent: boolean;
  isDropTarget?: boolean;
  /** Offset from the top of the rows, from the virtualizer. */
  top: number;
  /** What the first pinned column draws, such as a checkbox over the group. */
  pick?: ReactNode;
  /** What the second pinned column draws, such as a folder's switch. */
  control?: ReactNode;
  /** A glyph before the label. */
  mark?: ReactNode;
  /** What follows the count. */
  extra?: ReactNode;
  onPress: () => void;
  /** Wraps the heading's row, such as in a context menu. */
  wrap?: (row: ReactElement) => ReactNode;
}

/**
 * A group heading in an arranged table, across every column.
 *
 * A press on anything marked `data-no-row` inside it is that control's alone.
 * The label sticks beside the pinned columns on a sideways scroll.
 */
export function ArrangedGroupHeading({
  columns,
  label,
  count,
  expanded,
  foldable,
  isCurrent,
  isDropTarget = false,
  top,
  pick,
  control,
  mark,
  extra,
  onPress,
  wrap,
}: ArrangedGroupHeadingProps) {
  const labelStart = columns.findIndex((column) => !column.pin) + 1;
  const labelEnd = columns.findIndex((column) => column.pin === "end") + 1 || columns.length + 1;
  const pinnedStart = columns.filter((column) => column.pin === "start");
  const last = columns.at(-1);

  function handleClick(event: React.MouseEvent) {
    if ((event.target as HTMLElement).closest("[data-no-row]")) return;
    onPress();
  }

  const row = (
    <div
      role="row"
      aria-expanded={expanded}
      onClick={handleClick}
      className={twMerge(
        "group/row relative grid h-full items-stretch text-row select-none [--row-bg:var(--color-surface-900)] hover:[--row-bg:var(--color-surface-800)]",
        foldable && "cursor-pointer",
        isDropTarget &&
          "[--row-bg:color-mix(in_oklab,var(--color-accent-500)_18%,var(--color-surface-900))] hover:[--row-bg:color-mix(in_oklab,var(--color-accent-500)_18%,var(--color-surface-900))]",
      )}
      style={{ gridTemplateColumns: "var(--table-cols)" }}
    >
      {pinnedStart.map((column, index) => (
        <div
          key={column.id}
          role="gridcell"
          style={tableCellStyle(column)}
          className={tableCellClass(column, tableEdgeClass(index, columns.length))}
        >
          {index === 0 && pick}
          {index === 1 && control}
        </div>
      ))}
      <div
        role="gridcell"
        style={{ gridColumn: `${labelStart} / ${labelEnd}` }}
        className={twMerge(
          "flex min-w-0 bg-(--row-bg) px-2.5",
          pinnedStart.length === 0 && "rounded-l-md",
          !last?.pin && "rounded-r-md",
        )}
      >
        <span
          style={{ left: "calc(var(--sticky-label) + 10px)" }}
          className="sticky flex min-w-0 items-center gap-2"
        >
          {foldable && (
            <CaretDownIcon
              weight="bold"
              aria-label={m.common_table_group_toggle_label({ group: label })}
              className={twMerge(
                "size-3.5 shrink-0 text-surface-500 transition-transform group-hover/row:text-surface-300",
                !expanded && "-rotate-90",
              )}
            />
          )}
          {mark}
          <span className="truncate text-sm font-semibold text-surface-100">{label}</span>
          <span className="shrink-0 text-surface-500 tabular-nums">{count}</span>
          {extra}
        </span>
      </div>
      {last?.pin === "end" && (
        <div
          role="gridcell"
          className={tableCellClass(last, tableEdgeClass(columns.length - 1, columns.length))}
        />
      )}
      {isCurrent && <ArrangedCurrentRing />}
      {isDropTarget && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[3] rounded-md ring-2 ring-accent-400 ring-inset"
        />
      )}
    </div>
  );

  return (
    <div
      style={{ height: ARRANGED_GROUP_HEIGHT, transform: `translateY(${top}px)` }}
      className="absolute inset-x-0 top-0 pt-1.5"
    >
      {wrap && wrap(row)}
      {!wrap && row}
    </div>
  );
}

/** The ring around the current row, drawn while the table holds keyboard focus. */
export function ArrangedCurrentRing({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={twMerge(
        "pointer-events-none absolute inset-0 z-[3] hidden rounded-md ring-1 ring-accent-400 ring-inset group-focus-visible/table:block",
        className,
      )}
    />
  );
}
