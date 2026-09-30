import { describe, expect, it } from "vitest";

import { edgeOf, gapOf, positionOf } from "../edit/anchorGaps";

describe("gapOf", () => {
  it("measures from the edge the anchor holds, in design pixels", () => {
    expect(gapOf(999, 44, 1600, "start")).toBe(999);
    expect(gapOf(999, 44, 1600, "end")).toBe(557);
    expect(gapOf(778, 44, 1600, "centre")).toBe(0);
  });

  it("gives back the position it was measured from", () => {
    for (const edge of ["start", "centre", "end"] as const) {
      expect(positionOf(gapOf(236, 44, 1200, edge), 44, 1200, edge)).toBe(236);
    }
  });
});

describe("edgeOf", () => {
  it("names the nearest of the three edges", () => {
    expect(edgeOf(0)).toBe("start");
    expect(edgeOf(0.5)).toBe("centre");
    expect(edgeOf(1)).toBe("end");
  });
});
