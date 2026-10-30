import { describe, expect, it } from "vitest";

import { fittingMenuCount } from "../menubarLayout";

describe("fittingMenuCount", () => {
  it("keeps every title when the titles fit without the overflow menu", () => {
    expect(fittingMenuCount(200, [40, 40, 40], 28)).toBe(3);
    expect(fittingMenuCount(120, [40, 40, 40], 28)).toBe(3);
  });

  it("keeps the leading titles that fit beside the overflow menu", () => {
    expect(fittingMenuCount(119, [40, 40, 40], 28)).toBe(2);
    expect(fittingMenuCount(108, [40, 40, 40], 28)).toBe(2);
    expect(fittingMenuCount(107, [40, 40, 40], 28)).toBe(1);
  });

  it("returns 0 if no title fits beside the overflow menu", () => {
    expect(fittingMenuCount(60, [40, 40, 40], 28)).toBe(0);
    expect(fittingMenuCount(10, [40, 40, 40], 28)).toBe(0);
  });
});
