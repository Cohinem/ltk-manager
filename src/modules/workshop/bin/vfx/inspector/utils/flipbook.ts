import type { Flipbook } from "../../engine/model/model";

/** A flipbook's grid as whole numbers: its columns, rows and cells, at least one of each. */
export interface FlipbookGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cells: number;
  /** The cells one run plays, at least one. */
  readonly frames: number;
  /** The cell the run opens on, inside the grid. */
  readonly start: number;
}

/** Returns `book`'s grid, rounded as the renderer rounds it. */
export function flipbookGrid(book: Flipbook): FlipbookGrid {
  const columns = Math.max(Math.round(book.divisions[0]), 1);
  const rows = Math.max(Math.round(book.divisions[1]), 1);
  const cells = columns * rows;
  return {
    columns,
    rows,
    cells,
    frames: Math.max(Math.round(book.frames), 1),
    start: wrap(Math.trunc(book.start), cells),
  };
}

/**
 * Returns the position in play order of each cell, 0 for the first frame, and null for a cell
 * that the run does not play. A run longer than the grid wraps, so a cell keeps its first
 * position.
 */
export function playOrder(grid: FlipbookGrid): (number | null)[] {
  const order: (number | null)[] = Array.from({ length: grid.cells }, () => null);
  for (let at = Math.min(grid.frames, grid.cells) - 1; at >= 0; at -= 1) {
    order[wrap(grid.start + at, grid.cells)] = at;
  }
  return order;
}

/**
 * Returns the cell that a particle of `age` seconds draws at `rate` cells a second, as the
 * renderer places it. A rate at or under zero holds the start cell.
 */
export function cellAt(grid: FlipbookGrid, rate: number, age: number): number {
  const played = rate > 0 ? wrap(age * rate, grid.frames) : 0;
  return wrap(grid.start + Math.trunc(played), grid.cells);
}

/** Returns how many runs a particle that lives `lifetime` seconds plays, or null if it holds. */
export function runsPerLifetime(grid: FlipbookGrid, rate: number, lifetime: number): number | null {
  if (rate <= 0 || lifetime <= 0) return null;
  return (rate * lifetime) / grid.frames;
}

/** Returns the cell under the point `x`, `y`, each a fraction of the sheet's width and height. */
export function cellAtPoint(grid: FlipbookGrid, x: number, y: number): number {
  const column = Math.min(Math.max(Math.floor(x * grid.columns), 0), grid.columns - 1);
  const row = Math.min(Math.max(Math.floor(y * grid.rows), 0), grid.rows - 1);
  return row * grid.columns + column;
}

/** Returns the `numFrames` of a run from the start cell through `end`, wrapping past the grid. */
export function framesThrough(grid: FlipbookGrid, end: number): number {
  return wrap(end - grid.start, grid.cells) + 1;
}

function wrap(value: number, span: number): number {
  return ((value % span) + span) % span;
}
