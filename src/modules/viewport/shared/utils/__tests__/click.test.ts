import { describe, expect, it } from "vitest";

import { CLICK_SLOP, isClick } from "../click";

describe("isClick", () => {
  it("reads a release where the press began as a click", () => {
    expect(isClick({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(true);
  });

  it("reads a release within the slop as a click", () => {
    expect(isClick({ x: 10, y: 20 }, { x: 10 + CLICK_SLOP, y: 20 })).toBe(true);
    expect(isClick({ x: 10, y: 20 }, { x: 12, y: 22 })).toBe(true);
  });

  it("reads a release past the slop as a drag, in any direction", () => {
    expect(isClick({ x: 10, y: 20 }, { x: 10 + CLICK_SLOP + 1, y: 20 })).toBe(false);
    expect(isClick({ x: 10, y: 20 }, { x: 7, y: 16 })).toBe(false);
  });
});
