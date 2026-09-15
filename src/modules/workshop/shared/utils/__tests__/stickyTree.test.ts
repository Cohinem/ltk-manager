import { describe, expect, it } from "vitest";

import { type DepthRow, stickyTreeRows } from "../stickyTree";

const H = 24;

interface Row extends DepthRow {
  name: string;
  open: boolean;
}

function dir(name: string, depth: number, open = true): Row {
  return { name, depth, open };
}

function file(name: string, depth: number): Row {
  return { name, depth, open: false };
}

function pin(rows: readonly Row[], scrollTop: number, max = 5) {
  return stickyTreeRows(rows, { scrollTop, rowHeight: H, max, isOpenBranch: (row) => row.open });
}

function names(rows: readonly Row[], scrollTop: number, max = 5): string[] {
  return pin(rows, scrollTop, max).map((sticky) => sticky.row.name);
}

function tops(rows: readonly Row[], scrollTop: number, max = 5): number[] {
  return pin(rows, scrollTop, max).map((sticky) => sticky.top);
}

/*  0 data           1 characters        2 Samira
    3   skin0.bin    4   skin1.bin       5   skin2.bin
    6 shaders                                          */
const TREE: Row[] = [
  dir("data", 0),
  dir("characters", 1),
  dir("Samira", 2),
  file("skin0.bin", 3),
  file("skin1.bin", 3),
  file("skin2.bin", 3),
  dir("shaders", 0),
];

describe("stickyTreeRows", () => {
  it("pins nothing at the top of the tree", () => {
    expect(pin(TREE, 0)).toEqual([]);
  });

  it("pins every directory enclosing the row the scroll reached", () => {
    expect(names(TREE, 3 * H)).toEqual(["data", "characters", "Samira"]);
  });

  it("stacks the pins one row height apart", () => {
    expect(tops(TREE, 3 * H)).toEqual([0, H, 2 * H]);
  });

  it("addresses the real row, so a click can reach it", () => {
    expect(pin(TREE, 3 * H).map((sticky) => sticky.index)).toEqual([0, 1, 2]);
  });

  it("pins a directory the band reaches, rather than hiding it under its parent", () => {
    /* `characters` is the row the scroll reached, so `data` alone would pin and
       cover it. It has to pin in turn, and `Samira` under it after that. */
    expect(names(TREE, 1 * H)).toEqual(["data", "characters", "Samira"]);
  });

  it("hands a row over to its pin as it scrolls away", () => {
    /* A single pixel in, the pins sit where the rows they stand for already
       are, so the handover shows as nothing at all. */
    expect(tops(TREE, 1)).toEqual([0, H, 2 * H]);
    expect(names(TREE, 1)).toEqual(["data", "characters", "Samira"]);
  });

  it("leaves a shut directory out of the walk", () => {
    /* Nothing follows a shut row that it stands for, so pinning it would only
       cost the band a row. */
    const shut = [dir("data", 0), dir("characters", 1, false), dir("shaders", 0)];
    expect(names(shut, 1 * H)).toEqual(["data"]);
  });

  it("keeps the outermost directories once the nesting outruns the band", () => {
    expect(names(TREE, 3 * H, 2)).toEqual(["data", "characters"]);
  });

  it("pins nothing when the pane is too short to hold a row", () => {
    expect(pin(TREE, 3 * H, 0)).toEqual([]);
  });

  it("rides the whole nest up together as its last files leave the band", () => {
    /* Half a row past `skin2.bin`, so the three pins have 36px of their own
       rows left and a resting band of 72px. */
    expect(tops(TREE, 5 * H - H / 2)).toEqual([0, H / 2, H / 2]);
  });

  it("holds the pins still while the rows they stand for still fill the band", () => {
    expect(tops(TREE, 2 * H)).toEqual([0, H, 2 * H]);
  });

  it("carries the nest off the top rather than dropping it", () => {
    /* The row after the nest is one pixel from the top, so the pins are one
       pixel from gone. */
    expect(tops(TREE, 6 * H - 1)).toEqual([-23, -23, -23]);
  });

  it("drops the pins once the nest is behind the scroll", () => {
    expect(pin(TREE, 6 * H)).toEqual([]);
  });

  it("pins nothing for a flat tree", () => {
    const flat = [file("a", 0), file("b", 0), file("c", 0)];
    expect(pin(flat, 2 * H)).toEqual([]);
  });
});
