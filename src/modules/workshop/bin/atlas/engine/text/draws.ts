import type { TextCommand, TextGeometry } from "../commands/types";
import type { Rgba } from "../geometry/quads";
import type { PixelRect } from "../layout/solve";
import type { View, ViewLook, ViewTextIcon } from "../model/view";
import { layoutText, type PlacedGlyph, type TextLayout } from "./layout";
import { parseMarkup } from "./markup";
import { fontSizeOf } from "./sizing";
import type { PagedGlyph, TextSource } from "./source";

/** How far the client shears an italic glyph's top over its baseline, per pixel of height. */
const ITALIC_SHEAR = 0.18;

type TextLook = Extract<ViewLook, { kind: "text" }>;

/**
 * A text's draws, per the client's text pass: its shadow where the font has a depth, its
 * outline where it has a size, then its fill, each one draw per glyph page and per icon.
 *
 * A text the controller fills at run time draws `standIn` where it is given, and nothing
 * otherwise. Nothing draws for a font whose files have not loaded.
 */
export function textDraws(
  element: string,
  look: TextLook,
  rect: PixelRect,
  scissor: PixelRect | null,
  view: Pick<View, "fonts" | "styleSheets">,
  source: TextSource,
  screenHeight: number,
  standIn: string | null = null,
): TextCommand[] {
  const string = (look.traKey === "" ? null : source.string(look.traKey)) ?? standIn;
  if (string === null) return [];

  const laid = laidOut(look, rect.w, rect.h, view, source, screenHeight, string);
  if (laid === null) return [];

  const { font, size, layout } = laid;
  const base = { fill: font.fill, scissor, element };
  const draws: TextCommand[] = [];
  const pass = (
    shader: TextCommand["shader"],
    color: Rgba,
    offset: readonly [number, number],
    icons: boolean,
  ) => {
    const glyphs = groupByTexture(layout.glyphs);
    for (const [page, placed] of glyphs.pages) {
      draws.push({
        ...base,
        kind: "text",
        shader,
        glyphs: { kind: "page", page },
        geometry: textGeometry(placed, layout, rect, offset),
        color: unit(color),
      });
    }
    if (!icons) return;

    for (const [icon, placed] of glyphs.icons) {
      draws.push({
        ...base,
        kind: "text",
        shader: "fontIcon",
        glyphs: { kind: "icon", icon },
        geometry: textGeometry(placed, layout, rect, offset),
        color: shader === "fontOutline" ? unit(color) : [1, 1, 1, color[3] / 255],
      });
    }
  };

  const [shadowX, shadowY] = size.shadow;
  if (shadowX !== 0 || shadowY !== 0) {
    pass("font", font.shadowColor, shadowOffset(size.shadow, size.outline), true);
  }
  if (size.outline > 0) pass("fontOutline", font.outlineColor, [0, 0], false);
  pass("font", look.color ?? font.color, [0, 0], true);
  return draws;
}

/** A text's drawn extent in its box, in pixels from the box's top left. */
export type TextExtent = TextLayout["bounds"];

/** A box too tall for any text to fill, which leaves a measured text at its natural size. */
const UNBOUNDED = 1e6;

/**
 * The extent `string` draws at in `look`, wrapped to `width` and aligned to the top, as
 * `textDraws` lays it out. Null where it reads nothing or its font has not loaded.
 */
export function textExtent(
  look: TextLook,
  width: number,
  view: Pick<View, "fonts" | "styleSheets">,
  source: TextSource,
  screenHeight: number,
  string: string,
): TextExtent | null {
  const top: TextLook = { ...look, align: [look.align[0], 0] };
  return laidOut(top, width, UNBOUNDED, view, source, screenHeight, string)?.layout.bounds ?? null;
}

/** `string` laid out in `look` in a box of `width` by `height`, with the font and size it draws in. */
function laidOut(
  look: TextLook,
  width: number,
  height: number,
  view: Pick<View, "fonts" | "styleSheets">,
  source: TextSource,
  screenHeight: number,
  string: string,
) {
  const font = look.font === null ? undefined : view.fonts[look.font];
  if (font === undefined || look.font === null || string === "") return null;

  const size = fontSizeOf(font, screenHeight);
  const face = source.face(look.font, size);
  if (face === null) return null;

  const sheet = look.styleSheet === null ? null : (view.styleSheets[look.styleSheet] ?? null);
  const layout = layoutText(parseMarkup(string, sheet), face, width, height, {
    align: look.align,
    wrap: look.wrap,
    minScale: look.minScale,
    outline: size.outline,
    iconScale: look.iconScale,
  });
  return { font, size, layout };
}

/**
 * The shadow's offset. With an outline, each axis moves out by the outline's size in the
 * direction it already points, and an axis at zero moves back by it.
 */
function shadowOffset(
  depth: readonly [number, number],
  outline: number,
): readonly [number, number] {
  const axis = (value: number) => (value > 0 ? value + outline : value - outline);
  return outline > 0 ? [axis(depth[0]), axis(depth[1])] : depth;
}

function groupByTexture(glyphs: readonly PlacedGlyph<PagedGlyph>[]): {
  pages: Map<number, PlacedGlyph<PagedGlyph>[]>;
  icons: Map<ViewTextIcon, PlacedGlyph<PagedGlyph>[]>;
} {
  const pages = new Map<number, PlacedGlyph<PagedGlyph>[]>();
  const icons = new Map<ViewTextIcon, PlacedGlyph<PagedGlyph>[]>();
  for (const glyph of glyphs) {
    if (glyph.icon !== null) {
      const held = icons.get(glyph.icon);
      if (held === undefined) icons.set(glyph.icon, [glyph]);
      else held.push(glyph);
      continue;
    }

    const held = pages.get(glyph.glyph.page);
    if (held === undefined) pages.set(glyph.glyph.page, [glyph]);
    else held.push(glyph);
  }
  return { pages, icons };
}

/**
 * One quad per glyph, in the client's corner and index order, sheared where the glyph is
 * italic and doubled where it is bold with no bold file.
 */
function textGeometry(
  glyphs: readonly PlacedGlyph<PagedGlyph>[],
  layout: TextLayout<PagedGlyph>,
  rect: PixelRect,
  offset: readonly [number, number],
): TextGeometry {
  const geometry: TextGeometry = {
    positions: [],
    colors: [],
    texcoords: [],
    fillTexcoords: [],
    indices: [],
  };
  const { bounds } = layout;

  for (const placed of glyphs) {
    const times = placed.glyph.fauxBold ? 2 : 1;
    const shear = placed.style.italic ? ITALIC_SHEAR : 0;
    const [u0, v0, u1, v1] = placed.glyph.uv;
    const corners = [
      [placed.x, placed.y, u0, v0],
      [placed.x + placed.width, placed.y, u1, v0],
      [placed.x, placed.y + placed.height, u0, v1],
      [placed.x + placed.width, placed.y + placed.height, u1, v1],
    ] as const;

    for (let copy = 0; copy < times; copy += 1) {
      const base = geometry.positions.length / 2;
      for (const [x, y, u, v] of corners) {
        const sheared = x + shear * (placed.baseline - y);
        geometry.positions.push(rect.x + sheared + offset[0], rect.y + y + offset[1]);
        const [r, g, b, a] = placed.style.color;
        geometry.colors.push(b, g, r, a);
        geometry.texcoords.push(u, v);
        geometry.fillTexcoords.push(
          bounds.w === 0 ? 0 : (x - bounds.x) / bounds.w,
          bounds.h === 0 ? 0 : (y - bounds.y) / bounds.h,
        );
      }
      geometry.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  return geometry;
}

function unit(color: Rgba): readonly [number, number, number, number] {
  return [color[0] / 255, color[1] / 255, color[2] / 255, color[3] / 255];
}
