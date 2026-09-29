import type { ViewFont, ViewFontFace, ViewFontResolution } from "../model/view";

/** The locale Atlas draws in, and the one the client falls back to. */
export const TEXT_LOCALE = "en_us";

/** FreeType's resolution, which makes a point four thirds of a pixel. */
const PIXELS_PER_POINT = 96 / 72;

const DEFAULT_RESOLUTION: ViewFontResolution = {
  screenHeight: 1080,
  fontSize: 10,
  outlineSize: 0,
  shadowDepth: [0, 0],
};

/** What a font draws at on one screen, in pixels. */
export interface FontSize {
  /** The em, `fontSize` points at 96 dots an inch. */
  readonly pixels: number;
  readonly outline: number;
  /** The shadow's offset, y down, and zero where no shadow draws. */
  readonly shadow: readonly [number, number];
}

/**
 * The size `font` draws at on a screen `screenHeight` tall, per the client's pick: the locale's
 * sizes, else `en_us`'s. With `autoScale` the first entry scales by the screen's height over its
 * own, and otherwise the entry of the nearest height applies as written.
 */
export function fontSizeOf(font: ViewFont, screenHeight: number): FontSize {
  const sizes = font.sizes.find((each) => each.locale === TEXT_LOCALE) ?? font.sizes[0] ?? null;
  const resolutions = sizes?.resolutions ?? [];

  if (font.autoScale) {
    const first = resolutions[0] ?? DEFAULT_RESOLUTION;
    const k = screenHeight / first.screenHeight;
    return {
      pixels: Math.ceil(Math.max(first.fontSize * k, 1)) * PIXELS_PER_POINT,
      outline: first.outlineSize > 0 ? Math.max(1, Math.trunc(first.outlineSize * k)) : 0,
      shadow: [scaledDepth(first.shadowDepth[0], k), scaledDepth(first.shadowDepth[1], k)],
    };
  }

  const nearest = resolutions.reduce<ViewFontResolution | null>(
    (best, each) =>
      best === null ||
      Math.abs(each.screenHeight - screenHeight) < Math.abs(best.screenHeight - screenHeight)
        ? each
        : best,
    null,
  );
  const chosen = nearest ?? DEFAULT_RESOLUTION;
  return {
    pixels: Math.ceil(chosen.fontSize) * PIXELS_PER_POINT,
    outline: chosen.outlineSize,
    shadow: chosen.shadowDepth,
  };
}

/** A shadow depth scaled, at least a pixel where it was any. */
function scaledDepth(depth: number, k: number): number {
  if (depth === 0) return 0;

  const scaled = Math.trunc(depth * k);
  return Math.sign(depth) * Math.max(1, Math.abs(scaled));
}

/** The files `font` draws with in Atlas's locale: its own, else `en_us`'s, else the first. */
export function faceOf(font: ViewFont): ViewFontFace | null {
  return font.faces.find((each) => each.locale === TEXT_LOCALE) ?? font.faces[0] ?? null;
}
