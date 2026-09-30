import type { ViewTextIcon } from "../model/view";
import { BASE_STYLE, BULLET, type TextItem, type TextStyle } from "./markup";

/** A glyph's box at one size, in whole pixels, as FreeType reports it. */
export interface GlyphBox {
  /** The pen's step to the next glyph. */
  readonly advance: number;
  /** The ink box from the pen: right to its left edge, up to its top edge. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A face's vertical metrics at one size, in pixels. */
export interface FaceMetrics {
  readonly ascender: number;
  /** Below the baseline, positive. */
  readonly descender: number;
  /** The step from one baseline to the next. */
  readonly lineHeight: number;
}

/** One font at one size, which a layout measures its glyphs against. */
export interface TextFace<G extends GlyphBox = GlyphBox> {
  readonly metrics: FaceMetrics;
  /** `char` in the regular or bold face, and null where the face has no glyph for it. */
  glyph(char: string, bold: boolean): G | null;
  /** An inline icon's box at scale 1, and null until it can be measured. */
  icon(icon: ViewTextIcon): G | null;
}

/** `WrappingMode`, per section 2.5 of docs/plans/atlas-renderer.md. */
export const WRAP = {
  none: 0,
  word: 1,
  wordShrink: 2,
  truncate: 3,
  ellipsis: 4,
  shrink: 5,
} as const;

export interface LayoutOptions {
  /** `TextAlignmentHorizontal` and `TextAlignmentVertical`. */
  readonly align: readonly [number, number];
  readonly wrap: number;
  /** The smallest scale a shrinking mode draws at. */
  readonly minScale: number;
  /** The outline's size in pixels, which pads every glyph's quad on each side. */
  readonly outline: number;
  readonly iconScale: number;
}

/** One glyph's quad in the text box, in pixels from the box's top left. */
export interface PlacedGlyph<G extends GlyphBox = GlyphBox> {
  readonly glyph: G;
  /** The character drawn, or null for an icon. */
  readonly char: string | null;
  readonly icon: ViewTextIcon | null;
  readonly style: TextStyle;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The glyph's baseline, which an italic shears about. */
  readonly baseline: number;
}

export interface TextLayout<G extends GlyphBox = GlyphBox> {
  readonly glyphs: PlacedGlyph<G>[];
  /** The scale a shrinking mode applied, 1 otherwise. */
  readonly scale: number;
  /** The drawn text's extent in the box, which a fill texture spans. */
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
}

/** A width at or above which the element sizes to its text, and nothing wraps. */
const AUTO_WIDTH = 1e6;

const ELLIPSIS = "…";
const INDENT_BULLETS = 3;

/** Stand-ins the client draws where the face has no glyph, before its last resort. */
const FALLBACK: Readonly<Record<string, string>> = { "—": "-", [BULLET]: "-" };
const MISSING = "□";

interface Entry<G extends GlyphBox> {
  readonly glyph: G;
  readonly char: string | null;
  readonly icon: ViewTextIcon | null;
  readonly style: TextStyle;
  /** The glyph's box scaled for an icon, the glyph's own otherwise. */
  readonly box: GlyphBox;
  /** The pen's position on its line. */
  x: number;
}

/**
 * `items` laid out in a box of `width` by `height` with `face`, per the client's breaker and
 * aligner: lines broken at the last space or ideograph before the edge, truncated or shrunk per
 * `options.wrap`, each line aligned on its own, and the whole placed vertically.
 *
 * Every offset is truncated to whole pixels, as the client truncates them.
 */
export function layoutText<G extends GlyphBox>(
  items: readonly TextItem[],
  face: TextFace<G>,
  width: number,
  height: number,
  options: LayoutOptions,
): TextLayout<G> {
  const pad = 2 * options.outline;
  const wrap = width >= AUTO_WIDTH ? WRAP.none : options.wrap;
  const wraps = wrap === WRAP.word || wrap === WRAP.wordShrink;
  const bulletAdvance = face.glyph(BULLET, false)?.advance ?? 0;

  const lines: Entry<G>[][] = [[]];
  let pen = 0;
  const lineOf = () => lines[lines.length - 1] ?? [];
  const right = (entry: Entry<G>) => entry.x + entry.box.left + entry.box.width + pad;

  for (const item of items) {
    if (item.kind === "break") {
      lines.push([]);
      pen = 0;
      continue;
    }

    if (item.kind === "indent") {
      pen = Math.max(pen, INDENT_BULLETS * bulletAdvance);
      continue;
    }

    const entry = entryOf(item, face, options.iconScale);
    if (entry === null) continue;

    entry.x = pen;
    const line = lineOf();
    if (wraps && line.length > 0 && right(entry) > width) {
      const cut = lastBreak(line);
      const moved = cut < 0 ? [] : line.splice(cut + 1);
      lines.push(moved);
      pen = 0;
      for (const each of moved) {
        each.x = pen;
        pen += each.box.advance;
      }
      entry.x = pen;
    }

    lineOf().push(entry);
    pen = entry.x + entry.box.advance;
  }

  if (wrap === WRAP.truncate || wrap === WRAP.ellipsis) {
    for (const line of lines) truncate(line, face, width, pad, wrap === WRAP.ellipsis);
  }

  const { ascender, descender, lineHeight } = face.metrics;
  const textHeight = (lines.length - 1) * lineHeight + ascender + descender;
  const extents = lines.map((line) => extentOf(line, pad));
  const textWidth = Math.max(0, ...extents.map((extent) => extent.max));

  const shrinks = wrap === WRAP.wordShrink || wrap === WRAP.shrink;
  const scale = shrinks
    ? Math.max(options.minScale, Math.min(1, height / textHeight, width / textWidth))
    : 1;
  const boxWidth = width / scale;
  const boxHeight = height / scale;

  const [alignH, alignV] = options.align;
  const top = Math.trunc(
    alignV === 1
      ? (boxHeight - textHeight) / 2
      : alignV === 2
        ? boxHeight - textHeight
        : alignV === 3
          ? boxHeight - (ascender + descender)
          : 0,
  );

  const glyphs: PlacedGlyph<G>[] = [];
  let left = Infinity;
  let rightmost = -Infinity;
  lines.forEach((line, at) => {
    const extent = extents[at] ?? { min: 0, max: 0 };
    const offset = Math.trunc(
      alignH === 1
        ? (boxWidth - (extent.max - extent.min)) / 2 - extent.min
        : alignH === 2
          ? boxWidth - extent.max
          : 0,
    );
    const baseline = top + ascender + at * lineHeight;
    if (line.length > 0) {
      left = Math.min(left, offset + extent.min);
      rightmost = Math.max(rightmost, offset + extent.max);
    }

    for (const entry of line) {
      if (entry.box.width <= 0 || entry.box.height <= 0) continue;

      glyphs.push({
        glyph: entry.glyph,
        char: entry.char,
        icon: entry.icon,
        style: entry.style,
        x: scale * (offset + entry.x + entry.box.left),
        y: scale * (baseline - entry.box.top),
        width: scale * (entry.box.width + pad),
        height: scale * (entry.box.height + pad),
        baseline: scale * baseline,
      });
    }
  });

  const bounds =
    left === Infinity
      ? { x: 0, y: 0, w: 0, h: 0 }
      : { x: scale * left, y: scale * top, w: scale * (rightmost - left), h: scale * textHeight };
  return { glyphs, scale, bounds };
}

function entryOf<G extends GlyphBox>(
  item: Extract<TextItem, { kind: "char" | "icon" }>,
  face: TextFace<G>,
  iconScale: number,
): Entry<G> | null {
  if (item.kind === "icon") {
    const glyph = face.icon(item.icon);
    if (glyph === null) return null;

    const box: GlyphBox = {
      advance: Math.round(glyph.advance * iconScale),
      left: Math.round(glyph.left * iconScale),
      top: Math.round(glyph.top * iconScale),
      width: Math.round(glyph.width * iconScale),
      height: Math.round(glyph.height * iconScale),
    };
    return { glyph, char: null, icon: item.icon, style: item.style, box, x: 0 };
  }

  const bold = item.style.bold;
  const fallback = FALLBACK[item.char];
  const found =
    face.glyph(item.char, bold) ??
    (fallback === undefined ? null : face.glyph(fallback, bold)) ??
    face.glyph(MISSING, bold);
  if (found === null) return null;

  return { glyph: found, char: item.char, icon: null, style: item.style, box: found, x: 0 };
}

/** The index of the last glyph a line may break after, and -1 for none. */
function lastBreak<G extends GlyphBox>(line: readonly Entry<G>[]): number {
  for (let at = line.length - 1; at >= 0; at -= 1) {
    const char = line[at]?.char;
    if (char !== null && char !== undefined && breaksAfter(char)) return at;
  }
  return -1;
}

/** A space or an ideograph, after which the client may break a line. */
export function breaksAfter(char: string): boolean {
  if (char === " " || char === "\t" || char === "　") return true;

  const point = char.codePointAt(0) ?? 0;
  return (
    (point >= 0x2e80 && point <= 0x9fff) ||
    (point >= 0xac00 && point <= 0xd7af) ||
    (point >= 0xf900 && point <= 0xfaff) ||
    (point >= 0xff00 && point <= 0xffef)
  );
}

/**
 * `line` cut to the glyphs that end inside `width`. With `ellipsis`, a cut line ends in U+2026,
 * and the glyphs before it go until it fits.
 */
function truncate<G extends GlyphBox>(
  line: Entry<G>[],
  face: TextFace<G>,
  width: number,
  pad: number,
  ellipsis: boolean,
): void {
  const inside = (entry: Entry<G>) => entry.x + entry.box.left + entry.box.width + pad <= width;
  const kept = line.findIndex((entry) => !inside(entry));
  if (kept < 0) return;

  line.splice(kept);
  if (!ellipsis) return;

  const dots = face.glyph(ELLIPSIS, false);
  if (dots === null) return;

  for (;;) {
    const last = line[line.length - 1];
    const x = last === undefined ? 0 : last.x + last.box.advance;
    const entry: Entry<G> = {
      glyph: dots,
      char: ELLIPSIS,
      icon: null,
      style: last?.style ?? BASE_STYLE,
      box: dots,
      x,
    };
    if (inside(entry) || line.length === 0) {
      line.push(entry);
      return;
    }
    line.pop();
  }
}

/** A line's drawn extent: the leftmost and rightmost edges of its quads. */
function extentOf<G extends GlyphBox>(
  line: readonly Entry<G>[],
  pad: number,
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const entry of line) {
    if (entry.box.width <= 0) continue;

    min = Math.min(min, entry.x + entry.box.left);
    max = Math.max(max, entry.x + entry.box.left + entry.box.width + pad);
  }
  return min === Infinity ? { min: 0, max: 0 } : { min, max };
}
