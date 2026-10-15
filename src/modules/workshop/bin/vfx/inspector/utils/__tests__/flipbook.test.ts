import { describe, expect, it } from "vitest";

import type { Flipbook } from "../../../engine/model/model";
import {
  cellAt,
  cellAtPoint,
  flipbookGrid,
  framesThrough,
  playOrder,
  runsPerLifetime,
} from "../flipbook";

function book(over: Partial<Flipbook>): Flipbook {
  return {
    divisions: [4, 2],
    frames: 8,
    start: 0,
    rate: 8,
    birthRate: { constant: [1], keys: [], tables: [] },
    randomStart: false,
    ...over,
  };
}

describe("flipbookGrid", () => {
  it("rounds the divisions and keeps at least one cell", () => {
    expect(flipbookGrid(book({ divisions: [0, 2.6], frames: 0 }))).toMatchObject({
      columns: 1,
      rows: 3,
      cells: 3,
      frames: 1,
    });
  });
});

describe("playOrder", () => {
  it("numbers the cells of a run from the start cell and wraps past the grid", () => {
    const grid = flipbookGrid(book({ start: 6, frames: 3 }));

    expect(playOrder(grid)).toEqual([2, null, null, null, null, null, 0, 1]);
  });
});

describe("cellAt", () => {
  it("returns the cell a particle draws at its age", () => {
    const grid = flipbookGrid(book({ start: 2, frames: 4 }));

    expect(cellAt(grid, 8, 0)).toBe(2);
    expect(cellAt(grid, 8, 0.25)).toBe(4);
    expect(cellAt(grid, 8, 0.5)).toBe(2);
  });

  it("holds the start cell if the rate is zero", () => {
    expect(cellAt(flipbookGrid(book({ start: 5 })), 0, 3)).toBe(5);
  });
});

describe("runsPerLifetime", () => {
  it("returns the runs a lifetime plays, and null if the book holds", () => {
    const grid = flipbookGrid(book({}));

    expect(runsPerLifetime(grid, 8, 1.5)).toBe(1.5);
    expect(runsPerLifetime(grid, 0, 1.5)).toBeNull();
  });
});

describe("cellAtPoint", () => {
  it("returns the cell under a point of the sheet", () => {
    const grid = flipbookGrid(book({}));

    expect(cellAtPoint(grid, 0.1, 0.1)).toBe(0);
    expect(cellAtPoint(grid, 0.8, 0.9)).toBe(7);
    expect(cellAtPoint(grid, 1, 1)).toBe(7);
  });
});

describe("framesThrough", () => {
  it("returns the run length from the start cell through an end cell, wrapping", () => {
    const grid = flipbookGrid(book({ start: 6 }));

    expect(framesThrough(grid, 7)).toBe(2);
    expect(framesThrough(grid, 1)).toBe(4);
  });
});
