import { describe, expect, it } from "vitest";

import { colorHex, hsvToRgb, parseColorHex, rgbToHsv } from "../color";

describe("colorHex", () => {
  it("writes each channel as an upper-case byte", () => {
    expect(colorHex([1, 0.5, 0])).toBe("FF8000");
  });

  it("clamps a channel past the byte's range", () => {
    expect(colorHex([2, -1, 1])).toBe("FF00FF");
  });
});

describe("parseColorHex", () => {
  it("reads six digits with or without a leading hash", () => {
    expect(parseColorHex("#ff0000")).toEqual([1, 0, 0]);
    expect(parseColorHex(" 00FF00 ")).toEqual([0, 1, 0]);
  });

  it("answers null for text that is not six hex digits", () => {
    expect(parseColorHex("fff")).toBeNull();
    expect(parseColorHex("zzzzzz")).toBeNull();
  });
});

describe("rgbToHsv", () => {
  it("round-trips a colour through hue, saturation and brightness", () => {
    const colour = parseColorHex("8C5A2B") ?? [0, 0, 0];

    expect(colorHex(hsvToRgb(rgbToHsv(colour)))).toBe("8C5A2B");
  });

  it("reads the primaries at their hues", () => {
    expect(rgbToHsv([1, 0, 0]).hue).toBe(0);
    expect(rgbToHsv([0, 1, 0]).hue).toBe(120);
    expect(rgbToHsv([0, 0, 1]).hue).toBe(240);
  });

  it("gives a grey the hue it is passed, since a grey has none", () => {
    expect(rgbToHsv([0.5, 0.5, 0.5], 200)).toEqual({ hue: 200, saturation: 0, brightness: 0.5 });
  });
});
