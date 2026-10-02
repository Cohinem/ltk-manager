import type { CSSProperties } from "react";

import { twMerge } from "@/utils";

import type { ArrangedColumn } from "./types";

type Column = Pick<ArrangedColumn, "id" | "pin" | "sticky" | "align">;

const sticksLeft = (column: Column) => column.pin === "start" || column.sticky === true;

/** A body or header cell's frame for `column`. The row's state paints `--row-bg` under it. */
export function tableCellClass(column: Column, ...extra: (string | false | undefined)[]) {
  return twMerge(
    "relative flex min-w-0 items-center overflow-hidden bg-(--row-bg) px-2.5",
    column.align === "end" && "justify-end",
    column.align === "center" && "justify-center px-0",
    sticksLeft(column) && "sticky z-[1]",
    column.pin === "end" && "sticky right-0 z-[1]",
    ...extra,
  );
}

/**
 * Where a cell sticks on a sideways scroll, from the offsets the table sets on its scroller.
 *
 * `useArrangedColumns` names one `--sticky-<id>` per sticking column.
 */
export function tableCellStyle(column: Column): CSSProperties | undefined {
  if (!sticksLeft(column)) return undefined;
  return { left: `var(--sticky-${column.id})` };
}

/**
 * The rounding a row's fill takes at its two ends, which are its first and last cells.
 *
 * A side joined to a picked neighbour stays square, so a run of picks reads as one block.
 */
export function tableEdgeClass(index: number, count: number, joinTop = false, joinBottom = false) {
  const first = index === 0;
  const last = index === count - 1;

  return twMerge(
    first && !joinTop && "rounded-tl-md",
    first && !joinBottom && "rounded-bl-md",
    last && !joinTop && "rounded-tr-md",
    last && !joinBottom && "rounded-br-md",
  );
}

/**
 * The box a cell's content sits in, which fades on an item that recedes.
 *
 * The fade is on the content rather than the cell, so the row's fill stays one
 * tone across every column. Pinned columns hold the controls and never fade.
 */
export function tableContentClass(column: Column, recedes: boolean) {
  return twMerge(
    "flex min-w-0 items-center transition-[opacity,filter] duration-150 ease-out",
    recedes &&
      !column.pin &&
      "opacity-60 saturate-50 group-hover/row:opacity-100 group-hover/row:saturate-100",
  );
}

/** The fill of an item row: hovered, current and picked. */
export function tableRowFillClass(isCurrent: boolean, isSelected: boolean) {
  return twMerge(
    "[--row-bg:var(--color-surface-900)] hover:[--row-bg:var(--color-surface-800)]",
    isCurrent &&
      "[--row-bg:color-mix(in_oklab,var(--color-accent-500)_12%,var(--color-surface-900))] hover:[--row-bg:color-mix(in_oklab,var(--color-accent-500)_16%,var(--color-surface-800))]",
    isSelected &&
      "[--row-bg:color-mix(in_oklab,var(--color-accent-500)_22%,var(--color-surface-900))] hover:[--row-bg:color-mix(in_oklab,var(--color-accent-500)_26%,var(--color-surface-800))]",
  );
}
