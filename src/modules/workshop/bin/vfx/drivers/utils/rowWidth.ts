import type { StructRow } from "./graphItems";

/** How wide a value of one to four components draws, by its count. */
export const VALUE_WIDTH = [0, 120, 170, 230, 290] as const;

/**
 * The value column one row of a struct node needs: a vector's components with their steppers
 * and mode buttons, or a keyed value's curve strip, toggle and pop-out, as a master's rows have.
 */
export function rowValueWidth(row: StructRow): number {
  if (row.draws === "curve") return CURVE_ROW_WIDTH;
  if (row.draws === "cell") return 0;
  return (VALUE_WIDTH[row.draws] ?? 0) + ROW_CONTROLS_WIDTH;
}

/** A keyed value's line: its curve strip, mode toggle and pop-out, as wide as a master gives it. */
const CURVE_ROW_WIDTH = 296;

/** A vector row's mode buttons and the gaps around them, beside its components. */
const ROW_CONTROLS_WIDTH = 56;
