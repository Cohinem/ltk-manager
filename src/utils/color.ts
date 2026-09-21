/** A colour as three sRGB channels, each 0 to 1. */
export type RgbColor = readonly [number, number, number];

/** A colour as hue in degrees, and saturation and brightness each 0 to 1. */
export interface HsvColor {
  readonly hue: number;
  readonly saturation: number;
  readonly brightness: number;
}

/** `color` as six upper-case hex digits, each channel rounded to a byte. */
export function colorHex(color: RgbColor): string {
  return color
    .map((channel) =>
      Math.round(unit(channel) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

/** The colour six hex digits spell, with or without a leading `#`, and null for any other text. */
export function parseColorHex(text: string): RgbColor | null {
  const digits = text.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(digits)) return null;
  const channel = (at: number) => parseInt(digits.slice(at, at + 2), 16) / 255;
  return [channel(0), channel(2), channel(4)];
}

/**
 * `color` in hue, saturation and brightness.
 *
 * A grey has no hue of its own, so it takes `hue`, which keeps a picker's hue where it was
 * while its colour passes through grey.
 */
export function rgbToHsv([r, g, b]: RgbColor, hue = 0): HsvColor {
  const most = Math.max(r, g, b);
  const spread = most - Math.min(r, g, b);
  return {
    hue: spread === 0 ? hue : hueOf(r, g, b, most, spread),
    saturation: most === 0 ? 0 : spread / most,
    brightness: most,
  };
}

/** `color` in sRGB channels. */
export function hsvToRgb({ hue, saturation, brightness }: HsvColor): RgbColor {
  const channel = (offset: number) => {
    const k = (offset + hue / 60) % 6;
    return brightness - brightness * saturation * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [channel(5), channel(3), channel(1)];
}

function hueOf(r: number, g: number, b: number, most: number, spread: number): number {
  let sector: number;
  if (most === r) sector = ((g - b) / spread) % 6;
  else if (most === g) sector = (b - r) / spread + 2;
  else sector = (r - g) / spread + 4;
  const degrees = sector * 60;
  return degrees < 0 ? degrees + 360 : degrees;
}

function unit(channel: number): number {
  return Math.min(Math.max(channel, 0), 1);
}
