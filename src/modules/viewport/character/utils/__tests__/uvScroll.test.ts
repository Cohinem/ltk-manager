import { describe, expect, it } from "vitest";

import { scrollAt } from "../uvScroll";

describe("scrollAt", () => {
  it("stands at the tile's origin before the clock has moved", () => {
    expect(scrollAt(0.5, 0)).toBe(0);
  });

  it("moves a tile a second for a rate of one", () => {
    expect(scrollAt(1, 0.25)).toBe(0.25);
    expect(scrollAt(2, 0.125)).toBe(0.25);
  });

  it("answers the same offset however many times it is asked", () => {
    expect(scrollAt(0.3, 1.5)).toBe(scrollAt(0.3, 1.5));
  });

  it("folds a whole turn back to the tile's origin", () => {
    expect(scrollAt(1, 3)).toBe(0);
    expect(scrollAt(2, 1.75)).toBe(0.5);
  });

  it("folds a backwards scroll forwards rather than negative", () => {
    const back = scrollAt(-1, 0.25);
    expect(back).toBeCloseTo(0.75, 10);
    expect(back).toBeGreaterThanOrEqual(0);
  });

  it("holds still where the map does not scroll", () => {
    expect(scrollAt(0, 1234.5)).toBe(0);
  });

  it("stands still rather than putting a NaN on the sampler", () => {
    expect(scrollAt(Number.NaN, 2)).toBe(0);
    expect(scrollAt(1, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
