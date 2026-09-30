import { describe, expect, it } from "vitest";

import { renderScale } from "../renderScale";

const HD = { width: 1920, height: 1080 };
const ULTRAWIDE = { width: 3440, height: 1440 };

describe("renderScale", () => {
  it("renders at the screen's own size until the canvas zooms past it", () => {
    expect(renderScale(0.4, HD, 16384)).toBe(1);
    expect(renderScale(1, HD, 16384)).toBe(1);
  });

  it("steps up in powers of two as the canvas zooms in", () => {
    expect(renderScale(1.18, HD, 16384)).toBe(2);
    expect(renderScale(3, HD, 16384)).toBe(4);
  });

  it("stays within the texel budget and the largest texture", () => {
    expect(renderScale(8, ULTRAWIDE, 16384)).toBe(2);
    expect(renderScale(8, HD, 4096)).toBe(2);
    expect(renderScale(8, { width: 8192, height: 4320 }, 8192)).toBe(1);
  });
});
