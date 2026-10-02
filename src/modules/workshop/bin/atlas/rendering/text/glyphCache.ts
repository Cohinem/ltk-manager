import {
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  type Texture,
  UnsignedByteType,
} from "three";

import type { ViewTextIcon } from "../../engine/model/view";
import type { FaceMetrics, TextFace } from "../../engine/text/layout";
import type { PagedGlyph } from "../../engine/text/source";
import type { LoadedFont } from "./fontFiles";
import { faceMetricsAt } from "./sfnt";

/** The client's glyph page, per section 2.5 of docs/plans/atlas-renderer.md. */
const PAGE_SIZE = 256;

/** The gap the client packs glyphs apart by. */
const PADDING = 1;

/** Coverage is the alpha a glyph draws in, so any opaque colour writes it. */
const INK = "#fff";

const NO_CONTEXT = "No 2D context for glyph rasterization";

/** A page's first texel is white, for the underline and strike quads. */
const RESERVED = 2;

/** The rect of an icon's texture the icon is where the icon names none. */
const FULL_UV = [0, 0, 1, 1] as const;

/** One page pair: glyph coverage, and the same cells dilated by the outline. */
export interface GlyphPage {
  readonly fill: Texture;
  readonly outline: Texture;
}

interface Page extends GlyphPage {
  readonly fillTexels: Uint8Array;
  readonly outlineTexels: Uint8Array;
  shelfY: number;
  shelfHeight: number;
  shelfX: number;
  dirty: boolean;
}

/** An icon's texture size in pixels, where it has loaded. */
export type IconSize = (icon: ViewTextIcon) => readonly [number, number] | null;

/**
 * Every glyph page the frame's texts have drawn into, rasterized in the webview as the client
 * rasterizes them with FreeType, per section 3.7 of docs/plans/atlas-renderer.md: `R8` coverage
 * shelf-packed into 256 x 256 pages, and an outline page whose cells are the glyph dilated in
 * eight directions out to the outline's size.
 *
 * A glyph rasterizes the first time a layout asks for it, and `flush` uploads the pages that
 * changed since the last one.
 */
export class GlyphCache {
  private readonly pages: Page[] = [];
  private readonly faces = new Map<string, RasterFace>();
  private readonly canvas = new OffscreenCanvas(PAGE_SIZE, PAGE_SIZE);
  private readonly context: OffscreenCanvasRenderingContext2D;

  constructor() {
    const context = this.canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) throw new Error(NO_CONTEXT);
    this.context = context;
  }

  page(index: number): GlyphPage | undefined {
    return this.pages[index];
  }

  /** `regular` and its bold file, if it has one, at an em of `pixels` with an outline. */
  face(
    regular: LoadedFont,
    bold: LoadedFont | null,
    pixels: number,
    outline: number,
    iconSize: IconSize,
  ): TextFace<PagedGlyph> {
    const key = `${regular.family}:${bold?.family ?? ""}:${pixels}:${outline}`;
    const held = this.faces.get(key);
    if (held !== undefined) {
      held.iconSize = iconSize;
      return held;
    }

    const face = new RasterFace(this, regular, bold, pixels, outline, iconSize);
    this.faces.set(key, face);
    return face;
  }

  /** Upload every page a glyph was added to since the last flush. */
  flush(): void {
    for (const page of this.pages) {
      if (!page.dirty) continue;

      page.fill.needsUpdate = true;
      page.outline.needsUpdate = true;
      page.dirty = false;
    }
  }

  dispose(): void {
    for (const page of this.pages) {
      page.fill.dispose();
      page.outline.dispose();
    }
    this.pages.length = 0;
    this.faces.clear();
  }

  /** `char` drawn in `family` at `pixels`, packed with its outline, or null where none fits. */
  rasterize(
    char: string,
    family: string,
    pixels: number,
    outline: number,
  ): Omit<PagedGlyph, "fauxBold"> {
    const context = this.context;
    context.font = `${pixels}px "${family}"`;
    const measured = context.measureText(char);
    const left = Math.floor(-measured.actualBoundingBoxLeft);
    const top = Math.ceil(measured.actualBoundingBoxAscent);
    const width = Math.max(0, Math.ceil(measured.actualBoundingBoxRight) - left);
    const height = Math.max(0, top + Math.ceil(measured.actualBoundingBoxDescent));
    const advance = Math.round(measured.width);

    const cellWidth = width + 2 * outline;
    const cellHeight = height + 2 * outline;
    const empty = { advance, left, top, width: 0, height: 0, page: 0, uv: [0, 0, 0, 0] as const };
    if (width === 0 || height === 0) return empty;
    if (cellWidth > PAGE_SIZE - RESERVED || cellHeight > PAGE_SIZE - RESERVED) return empty;

    context.clearRect(0, 0, cellWidth, cellHeight);
    context.fillStyle = INK;
    context.textBaseline = "alphabetic";
    context.fillText(char, outline - left, outline + top);
    const rgba = context.getImageData(0, 0, cellWidth, cellHeight).data;
    const coverage = new Uint8Array(cellWidth * cellHeight);
    for (let at = 0; at < coverage.length; at += 1) coverage[at] = rgba[at * 4 + 3] ?? 0;

    const dilated = dilate(coverage, cellWidth, cellHeight, outline);
    const { page, x, y } = this.place(cellWidth, cellHeight);
    const held = this.pages[page];
    if (held !== undefined) {
      for (let row = 0; row < cellHeight; row += 1) {
        const from = row * cellWidth;
        const to = (y + row) * PAGE_SIZE + x;
        held.fillTexels.set(coverage.subarray(from, from + cellWidth), to);
        held.outlineTexels.set(dilated.subarray(from, from + cellWidth), to);
      }
      held.dirty = true;
    }

    return {
      advance,
      left,
      top,
      width,
      height,
      page,
      uv: [x / PAGE_SIZE, y / PAGE_SIZE, (x + cellWidth) / PAGE_SIZE, (y + cellHeight) / PAGE_SIZE],
    };
  }

  /** A cell of `width` by `height` on the last page's shelf, or on a new shelf or page. */
  private place(width: number, height: number): { page: number; x: number; y: number } {
    let page = this.pages[this.pages.length - 1] ?? this.newPage();
    if (page.shelfX + width + PADDING > PAGE_SIZE) {
      page.shelfY += page.shelfHeight + PADDING;
      page.shelfX = RESERVED;
      page.shelfHeight = 0;
    }
    if (page.shelfY + height + PADDING > PAGE_SIZE) page = this.newPage();

    const placed = { page: this.pages.length - 1, x: page.shelfX, y: page.shelfY };
    page.shelfX += width + PADDING;
    page.shelfHeight = Math.max(page.shelfHeight, height);
    return placed;
  }

  private newPage(): Page {
    const fillTexels = new Uint8Array(PAGE_SIZE * PAGE_SIZE);
    const outlineTexels = new Uint8Array(PAGE_SIZE * PAGE_SIZE);
    fillTexels[0] = 255;
    outlineTexels[0] = 255;

    const page: Page = {
      fillTexels,
      outlineTexels,
      fill: pageTexture(fillTexels),
      outline: pageTexture(outlineTexels),
      shelfX: RESERVED,
      shelfY: 0,
      shelfHeight: 0,
      dirty: true,
    };
    this.pages.push(page);
    return page;
  }
}

/** One font at one size and outline, rasterizing into its cache's pages as it is asked. */
class RasterFace implements TextFace<PagedGlyph> {
  readonly metrics: FaceMetrics;
  private readonly glyphs = new Map<string, PagedGlyph>();

  constructor(
    private readonly cache: GlyphCache,
    private readonly regular: LoadedFont,
    private readonly bold: LoadedFont | null,
    private readonly pixels: number,
    private readonly outline: number,
    public iconSize: IconSize,
  ) {
    this.metrics = faceMetricsAt(regular.metrics, pixels);
  }

  glyph(char: string, bold: boolean): PagedGlyph {
    const key = `${bold ? "b" : "r"}${char}`;
    const held = this.glyphs.get(key);
    if (held !== undefined) return held;

    const font = bold && this.bold !== null ? this.bold : this.regular;
    const glyph = {
      ...this.cache.rasterize(char, font.family, this.pixels, this.outline),
      fauxBold: bold && this.bold === null,
    };
    this.glyphs.set(key, glyph);
    return glyph;
  }

  /**
   * An icon's rect of its texture at its own size, standing on the baseline and lowered by its
   * adjustment. A sheet packs its icons into atlas pages, so the rect is a part of the page.
   */
  icon(icon: ViewTextIcon): PagedGlyph | null {
    const size = this.iconSize(icon);
    if (size === null) return null;

    const uv = icon.uv ?? FULL_UV;
    const width = Math.round(size[0] * (uv[2] - uv[0]));
    const height = Math.round(size[1] * (uv[3] - uv[1]));
    return {
      advance: width,
      left: 0,
      top: Math.round(height - icon.yAdjustment),
      width,
      height,
      page: -1,
      uv,
      fauxBold: false,
    };
  }
}

function pageTexture(texels: Uint8Array): DataTexture {
  const texture = new DataTexture(texels, PAGE_SIZE, PAGE_SIZE, RedFormat, UnsignedByteType);
  texture.colorSpace = NoColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** `coverage` dilated in the eight directions at every radius out to `radius`, as the client's. */
function dilate(coverage: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const out = coverage.slice();
  for (let r = 1; r <= radius; r += 1) {
    for (const [dx, dy] of DIRECTIONS) {
      for (let y = 0; y < height; y += 1) {
        const sy = y - dy * r;
        if (sy < 0 || sy >= height) continue;

        for (let x = 0; x < width; x += 1) {
          const sx = x - dx * r;
          if (sx < 0 || sx >= width) continue;

          const value = coverage[sy * width + sx] ?? 0;
          if (value > (out[y * width + x] ?? 0)) out[y * width + x] = value;
        }
      }
    }
  }
  return out;
}

const DIRECTIONS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;
