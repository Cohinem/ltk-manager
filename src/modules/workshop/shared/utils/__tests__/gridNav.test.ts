import { describe, expect, it } from "vitest";

import { countColumns, gridStep } from "../gridNav";

/* Seven cards over three columns, so the last row is short by two:
     0 1 2
     3 4 5
     6 */
const SEVEN = { count: 7, columns: 3 };

describe("gridStep", () => {
  it("steps one card sideways", () => {
    expect(gridStep("ArrowRight", { index: 0, ...SEVEN })).toBe(1);
    expect(gridStep("ArrowLeft", { index: 1, ...SEVEN })).toBe(0);
  });

  it("follows the wrap rather than stopping at the edge of a row", () => {
    expect(gridStep("ArrowRight", { index: 2, ...SEVEN })).toBe(3);
    expect(gridStep("ArrowLeft", { index: 3, ...SEVEN })).toBe(2);
  });

  it("holds at the ends of the grid", () => {
    expect(gridStep("ArrowLeft", { index: 0, ...SEVEN })).toBeNull();
    expect(gridStep("ArrowRight", { index: 6, ...SEVEN })).toBeNull();
  });

  it("steps a whole row vertically", () => {
    expect(gridStep("ArrowDown", { index: 1, ...SEVEN })).toBe(4);
    expect(gridStep("ArrowUp", { index: 4, ...SEVEN })).toBe(1);
  });

  it("lands on the last card of a short row rather than above the gap", () => {
    expect(gridStep("ArrowDown", { index: 4, ...SEVEN })).toBe(6);
    expect(gridStep("ArrowDown", { index: 5, ...SEVEN })).toBe(6);
  });

  it("holds where there is no row to reach", () => {
    expect(gridStep("ArrowUp", { index: 1, ...SEVEN })).toBeNull();
    expect(gridStep("ArrowDown", { index: 6, ...SEVEN })).toBeNull();
  });

  it("walks a list as one column", () => {
    const list = { count: 3, columns: 1 };
    expect(gridStep("ArrowDown", { index: 0, ...list })).toBe(1);
    expect(gridStep("ArrowUp", { index: 1, ...list })).toBe(0);
    expect(gridStep("ArrowDown", { index: 2, ...list })).toBeNull();
  });

  it("takes Home and End to the two ends", () => {
    expect(gridStep("Home", { index: 5, ...SEVEN })).toBe(0);
    expect(gridStep("End", { index: 5, ...SEVEN })).toBe(6);
  });

  it("moves nowhere over an empty grid, or for a key it does not answer", () => {
    expect(gridStep("ArrowDown", { index: 0, count: 0, columns: 3 })).toBeNull();
    expect(gridStep("End", { index: 0, count: 0, columns: 3 })).toBeNull();
    expect(gridStep("PageDown", { index: 0, ...SEVEN })).toBeNull();
  });
});

describe("countColumns", () => {
  it("counts the cards sharing the first row's top", () => {
    expect(countColumns([0, 0, 0, 220, 220, 220, 440])).toBe(3);
  });

  it("counts one column where every card has a top of its own", () => {
    expect(countColumns([0, 72, 144])).toBe(1);
  });

  it("counts a single row as every card it holds", () => {
    expect(countColumns([0, 0])).toBe(2);
  });

  it("counts one column over an empty grid", () => {
    expect(countColumns([])).toBe(1);
  });
});
