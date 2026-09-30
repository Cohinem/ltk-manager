import type { Uv } from "../geometry/quads";
import type { GlyphBox, TextFace } from "./layout";
import type { FontSize } from "./sizing";

/** A glyph where a glyph page holds it. */
export interface PagedGlyph extends GlyphBox {
  /** The page, and -1 for an icon, which samples its own texture whole. */
  readonly page: number;
  readonly uv: Uv;
  /** The font has no bold file, so the glyph draws twice. */
  readonly fauxBold: boolean;
}

/** What a text draws from, once its fonts and strings have loaded. */
export interface TextSource {
  /** The string a `TRAKey` names, and null where the game has none. */
  string(key: string): string | null;
  /** The font at index `font` of the view at `size`, and null until its files have loaded. */
  face(font: number, size: FontSize): TextFace<PagedGlyph> | null;
}
