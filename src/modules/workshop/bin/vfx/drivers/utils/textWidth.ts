/** A style of the graph's UI text: its size in pixels, its weight tier and its tracking in em. */
export interface TextStyle {
  readonly size: number;
  readonly weight: "normal" | "medium";
  readonly tracking: number;
}

/* The row and meta sizes of `[data-type-scale="board"]`, which the node components draw in. */

/** A port's label, a class, or an item's key, in the row type. */
export const ROW_TEXT: TextStyle = { size: 14, weight: "normal", tracking: 0 };

/** A node's title, or a field name the inspector labels, in the row type's medium weight. */
export const LABEL_TEXT: TextStyle = { size: 14, weight: "medium", tracking: 0 };

/** A node's subtitle, or a field of a class the registry does not read, in the meta type. */
export const META_TEXT: TextStyle = { size: 13, weight: "normal", tracking: 0.01 };

/** How wide a run of text draws, in pixels. */
export type MeasureText = (text: string, style: TextStyle) => number;

/** The UI's sans face as the document applies it: its font stack and its two weights. */
export interface SansFont {
  readonly face: string;
  readonly normal: string;
  readonly medium: string;
}

/** The share of its size a character is taken to advance, the mono face's, so a guess errs wide. */
const ESTIMATED_ADVANCE = 0.6;

/** A width from the character count alone, for where nothing can measure, such as a test. */
export const estimateText: MeasureText = (text, style) =>
  text.length * style.size * (ESTIMATED_ADVANCE + style.tracking);

/**
 * Text measured on a canvas in `font`, each width kept once measured, and `estimateText` where
 * no font is known or no canvas can measure.
 */
export function textMeasure(font: SansFont | null): MeasureText {
  if (font === null || font.face === "" || typeof OffscreenCanvas === "undefined") {
    return estimateText;
  }
  const context = new OffscreenCanvas(1, 1).getContext("2d");
  if (context === null) return estimateText;

  const widths = new Map<string, number>();
  return (text, style) => {
    const key = `${style.size} ${style.weight} ${text}`;
    const held = widths.get(key);
    if (held !== undefined) return held;

    context.font = `${font[style.weight]} ${style.size}px ${font.face}`;
    const width = context.measureText(text).width + text.length * style.size * style.tracking;
    widths.set(key, width);
    return width;
  };
}
