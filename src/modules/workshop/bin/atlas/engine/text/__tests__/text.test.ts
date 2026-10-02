import { describe, expect, it } from "vitest";

import type { ViewFont, ViewStyleSheet } from "../../model/view";
import { layoutText, type LayoutOptions, type TextFace, WRAP } from "../layout";
import { BASE_STYLE, parseMarkup, type TextItem } from "../markup";
import { fontSizeOf } from "../sizing";

const SHEET: ViewStyleSheet = {
  path: "UX/Fonts/CSS/StyleSheet",
  styles: [
    { name: "spellActive", color: [10, 20, 30, 255], bold: true, italics: null, underline: null },
  ],
  icons: [{ name: "scaleMana", texture: null, uv: null, yAdjustment: 1 }],
};

/** A monospace face: every glyph ten pixels on, eight wide and ten tall, a space empty. */
const FACE: TextFace = {
  metrics: { ascender: 8, descender: 2, lineHeight: 12 },
  glyph: (char) =>
    char === " "
      ? { advance: 10, left: 0, top: 0, width: 0, height: 0 }
      : { advance: 10, left: 1, top: 8, width: 8, height: 10 },
  icon: () => ({ advance: 16, left: 0, top: 12, width: 16, height: 16 }),
};

const OPTIONS: LayoutOptions = {
  align: [0, 0],
  wrap: WRAP.none,
  minScale: 0.7,
  outline: 0,
  iconScale: 1,
};

function text(items: readonly TextItem[]): string {
  return items
    .map((item) => (item.kind === "char" ? item.char : item.kind === "break" ? "\n" : "|"))
    .join("");
}

function lines(source: string, width: number, options: Partial<LayoutOptions> = {}) {
  const layout = layoutText(parseMarkup(source, null), FACE, width, 100, {
    ...OPTIONS,
    ...options,
  });
  const rows = new Map<number, string>();
  for (const glyph of layout.glyphs) {
    rows.set(glyph.baseline, (rows.get(glyph.baseline) ?? "") + (glyph.char ?? "|"));
  }
  return { layout, rows: [...rows.values()] };
}

describe("parseMarkup", () => {
  it("decodes entities, breaks and a dropped trailing break", () => {
    expect(text(parseMarkup("a&amp;b&lt;&nbsp;<br>c<hr>d\n", null))).toBe("a&b< \nc\n\nd");
  });

  it("stacks tag styles and pops one per closing tag", () => {
    const items = parseMarkup("<b>x<font color='#ff8000'>y</font>z</b>w", null);
    const styles = items.flatMap((item) => (item.kind === "char" ? [item.style] : []));

    expect(styles.map((style) => style.bold)).toEqual([true, true, true, false]);
    expect(styles[1]?.color).toEqual([255, 128, 0, 255]);
    expect(styles[2]?.color).toEqual(BASE_STYLE.color);
  });

  it("merges a sheet's style and draws a sheet's icon", () => {
    const items = parseMarkup("<spellActive>a</spellActive>%i:scaleMana%%i:gone%", SHEET);

    expect(items[0]).toMatchObject({
      kind: "char",
      style: { color: [10, 20, 30, 255], bold: true },
    });
    expect(items[1]).toMatchObject({ kind: "icon", icon: { name: "scaleMana" } });
    expect(items).toHaveLength(2);
  });

  it("ends the text at a tag with no closing bracket", () => {
    expect(text(parseMarkup("ab<font", null))).toBe("ab");
  });
});

describe("layoutText", () => {
  it("breaks a word-wrapped line after its last space", () => {
    expect(lines("aa bb cc", 60, { wrap: WRAP.word }).rows).toEqual(["aabb", "cc"]);
  });

  it("breaks before the glyph that overflows where a line has no space", () => {
    expect(lines("abcdef", 35, { wrap: WRAP.word }).rows).toEqual(["abc", "def"]);
  });

  it("leaves an unwrapped line running past the box", () => {
    expect(lines("abcdef", 35).rows).toEqual(["abcdef"]);
  });

  it("truncates each line, and ends a cut line in an ellipsis that fits", () => {
    expect(lines("abcdef<br>ab", 35, { wrap: WRAP.truncate }).rows).toEqual(["abc", "ab"]);
    expect(lines("abcdef", 35, { wrap: WRAP.ellipsis }).rows).toEqual(["ab…"]);
  });

  it("shrinks a single line to the box, no further than the smallest scale", () => {
    expect(lines("abcdefgh", 60, { wrap: WRAP.shrink }).layout.scale).toBeCloseTo(60 / 79);
    expect(lines("abcdefghijkl", 60, { wrap: WRAP.shrink }).layout.scale).toBe(0.7);
  });

  it("aligns each line on its own and the text in the box", () => {
    const { layout } = lines("ab<br>abcd", 100, { align: [1, 1] });
    const [first, , third] = layout.glyphs;

    expect(first?.x).toBe(41);
    expect(third?.x).toBe(31);
    expect(first?.y).toBe(39);
  });

  it("pads every quad by the outline on each side", () => {
    const glyph = lines("a", 100, { outline: 2 }).layout.glyphs[0];

    expect(glyph).toMatchObject({ x: 1, y: 0, width: 12, height: 14 });
  });
});

describe("fontSizeOf", () => {
  const font = (autoScale: boolean): ViewFont => ({
    path: "UX/Fonts/Descriptions/Gold",
    name: "Gold",
    color: [255, 255, 255, 255],
    outlineColor: [0, 0, 0, 255],
    shadowColor: [0, 0, 0, 255],
    glowColor: [0, 0, 0, 255],
    fill: null,
    faces: [],
    autoScale,
    sizes: [
      {
        locale: "en_us",
        resolutions: [
          { screenHeight: 1080, fontSize: 12, outlineSize: 1, shadowDepth: [0, 1] },
          { screenHeight: 1440, fontSize: 16, outlineSize: 2, shadowDepth: [0, 2] },
        ],
      },
    ],
  });

  it("scales the first entry by the screen with autoScale, keeping a pixel of each", () => {
    const size = fontSizeOf(font(true), 1440);

    expect(size.pixels).toBeCloseTo(16 * (4 / 3));
    expect(size.outline).toBe(1);
    expect(size.shadow).toEqual([0, 1]);
  });

  it("takes the entry of the nearest height without autoScale", () => {
    const size = fontSizeOf(font(false), 1400);

    expect(size.pixels).toBeCloseTo(16 * (4 / 3));
    expect(size.outline).toBe(2);
  });
});
