import type { FaceMetrics } from "../../engine/text/layout";

/** The table tags a reader matches, as the big-endian words `head`, `hhea` and `OS/2`. */
const HEAD = 0x68656164;
const HHEA = 0x68686561;
const OS2 = 0x4f532f32;

/** The vertical metrics FreeType reads out of a font, in font units. */
export interface SfntMetrics {
  readonly unitsPerEm: number;
  readonly ascender: number;
  /** Below the baseline, negative as the file writes it. */
  readonly descender: number;
  readonly lineGap: number;
}

/**
 * The `head` and `hhea` metrics of an OpenType or TrueType file, with `OS/2`'s typographic ones
 * where `hhea` writes none, as FreeType takes them. Null for a file without the tables.
 */
export function readSfntMetrics(bytes: ArrayBuffer): SfntMetrics | null {
  const data = new DataView(bytes);
  if (data.byteLength < 12) return null;

  const tables = new Map<number, number>();
  const count = data.getUint16(4);
  for (let at = 0; at < count; at += 1) {
    const record = 12 + at * 16;
    if (record + 16 > data.byteLength) return null;

    tables.set(data.getUint32(record), data.getUint32(record + 8));
  }

  const head = tables.get(HEAD);
  const hhea = tables.get(HHEA);
  if (head === undefined || hhea === undefined) return null;

  const metrics = {
    unitsPerEm: data.getUint16(head + 18),
    ascender: data.getInt16(hhea + 4),
    descender: data.getInt16(hhea + 6),
    lineGap: data.getInt16(hhea + 8),
  };
  const os2 = tables.get(OS2);
  if (metrics.ascender !== 0 || metrics.descender !== 0 || os2 === undefined) return metrics;

  return {
    unitsPerEm: metrics.unitsPerEm,
    ascender: data.getInt16(os2 + 68),
    descender: data.getInt16(os2 + 70),
    lineGap: data.getInt16(os2 + 72),
  };
}

/** `metrics` at an em of `pixels`, rounded as FreeType rounds a size's metrics. */
export function faceMetricsAt(metrics: SfntMetrics, pixels: number): FaceMetrics {
  const scale = pixels / metrics.unitsPerEm;
  return {
    ascender: Math.ceil(metrics.ascender * scale),
    descender: -Math.floor(metrics.descender * scale),
    lineHeight: Math.round((metrics.ascender - metrics.descender + metrics.lineGap) * scale),
  };
}
