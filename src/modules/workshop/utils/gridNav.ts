/**
 * Where an arrow key lands in a grid of cards that wraps.
 *
 * Pure, and blind to what a card is: a list answers here too, as a grid one
 * column wide.
 */

/** Where the focus stands, and the shape of the grid it stands in. */
export interface GridPosition {
  readonly index: number;
  readonly count: number;
  /** How many cards the first row holds. One in list mode. */
  readonly columns: number;
}

/**
 * Returns the index an arrow key moves the focus to, or null at an edge.
 *
 * Left and right follow the wrap, so the end of a row leads into the start of
 * the next. A down out of a full row into a short one lands on the last card it
 * holds rather than stopping above a gap.
 */
export function gridStep(key: string, { index, count, columns }: GridPosition): number | null {
  if (count === 0) return null;

  const last = count - 1;
  const width = Math.max(1, columns);

  switch (key) {
    case "ArrowRight":
      return index < last ? index + 1 : null;
    case "ArrowLeft":
      return index > 0 ? index - 1 : null;
    case "ArrowDown": {
      const below = index + width;
      if (below <= last) return below;
      return rowOf(index, width) === rowOf(last, width) ? null : last;
    }
    case "ArrowUp": {
      const above = index - width;
      return above >= 0 ? above : null;
    }
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/** Counts a wrapped grid's columns from its children's distances from the top. */
export function countColumns(tops: readonly number[]): number {
  const first = tops[0];
  if (first === undefined) return 1;

  const wrapped = tops.findIndex((top) => top !== first);
  return wrapped < 0 ? tops.length : wrapped;
}

function rowOf(index: number, columns: number): number {
  return Math.floor(index / columns);
}
