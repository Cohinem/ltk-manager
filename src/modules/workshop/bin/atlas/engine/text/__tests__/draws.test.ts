import { describe, expect, it } from "vitest";

import { view } from "../../__tests__/fixtures";
import type { ViewFont, ViewLook } from "../../model/view";
import { textDraws } from "../draws";
import type { PagedGlyph, TextSource } from "../source";

const FONT: ViewFont = {
  path: "UX/Fonts/Descriptions/Gold",
  name: "Gold",
  color: [240, 230, 210, 255],
  outlineColor: [0, 0, 0, 255],
  shadowColor: [0, 0, 0, 102],
  glowColor: [0, 0, 0, 255],
  fill: null,
  faces: [],
  autoScale: false,
  sizes: [
    {
      locale: "en_us",
      resolutions: [{ screenHeight: 1080, fontSize: 12, outlineSize: 1, shadowDepth: [0, 2] }],
    },
  ],
};

function look(
  traKey: string,
  color: readonly [number, number, number, number] | null = null,
): ViewLook {
  return {
    kind: "text",
    font: 0,
    styleSheet: null,
    traKey,
    align: [0, 0],
    wrap: 0,
    flipForRtl: false,
    iconScale: 1,
    minScale: 0.7,
    color,
  };
}

/** `a` on page 0 and `b` on page 1, each eight by ten pixels. */
function glyph(page: number): PagedGlyph {
  return {
    advance: 10,
    left: 0,
    top: 8,
    width: 8,
    height: 10,
    page,
    uv: [0, 0, 0.1, 0.1],
    fauxBold: false,
  };
}

const SOURCE: TextSource = {
  string: (key) => (key === "title" ? "ab" : null),
  face: () => ({
    metrics: { ascender: 8, descender: 2, lineHeight: 12 },
    glyph: (char) => glyph(char === "a" ? 0 : 1),
    icon: () => null,
  }),
};

const RECT = { x: 100, y: 50, w: 200, h: 40 };

function drawsOf(textLook: ViewLook) {
  if (textLook.kind !== "text") throw new Error("not a text");
  const built = { ...view([], []), fonts: [FONT] };
  return textDraws("title", textLook, RECT, null, built, SOURCE, 1080);
}

describe("textDraws", () => {
  it("draws the shadow, then the outline, then the fill, one draw per page", () => {
    const draws = drawsOf(look("title"));

    expect(draws.map((draw) => [draw.shader, draw.glyphs])).toEqual([
      ["font", { kind: "page", page: 0 }],
      ["font", { kind: "page", page: 1 }],
      ["fontOutline", { kind: "page", page: 0 }],
      ["fontOutline", { kind: "page", page: 1 }],
      ["font", { kind: "page", page: 0 }],
      ["font", { kind: "page", page: 1 }],
    ]);
    expect(draws[0]?.color).toEqual([0, 0, 0, 0.4]);
    expect(draws[4]?.color).toEqual([240 / 255, 230 / 255, 210 / 255, 1]);
  });

  it("moves the shadow by its depth and the outline, and places glyphs in screen pixels", () => {
    const [shadow, , , , fill] = drawsOf(look("title"));

    expect(fill?.geometry.positions.slice(0, 2)).toEqual([100, 50]);
    expect(shadow?.geometry.positions.slice(0, 2)).toEqual([99, 53]);
    expect(fill?.geometry.indices).toEqual([0, 2, 1, 1, 2, 3]);
  });

  it("takes the element's own colour over the font's for the fill", () => {
    const draws = drawsOf(look("title", [255, 0, 0, 255]));

    expect(draws[draws.length - 1]?.color).toEqual([1, 0, 0, 1]);
  });

  it("draws nothing for a text the controller writes at run time", () => {
    expect(drawsOf(look(""))).toEqual([]);
    expect(drawsOf(look("unknown"))).toEqual([]);
  });
});
