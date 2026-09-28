import { afterEach, describe, expect, it, vi } from "vitest";

import { estimateText, LABEL_TEXT, META_TEXT, ROW_TEXT, textMeasure } from "../textWidth";

const GEIST = { face: '"Geist Variable", system-ui, sans-serif', normal: "400", medium: "500" };

/** A canvas whose text advances 5px a character, and the fonts it was asked to measure in. */
function stubCanvas() {
  const fonts: string[] = [];
  const context = {
    font: "",
    measureText: vi.fn((text: string) => {
      fonts.push(context.font);
      return { width: text.length * 5 };
    }),
  };
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return context;
      }
    },
  );
  return { context, fonts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("textMeasure", () => {
  it("estimates where no canvas can measure", () => {
    expect(textMeasure(GEIST)).toBe(estimateText);
    expect(estimateText("rate", ROW_TEXT)).toBeCloseTo(4 * 12 * 0.6);
  });

  it("estimates where the document applies no face", () => {
    stubCanvas();

    expect(textMeasure(null)).toBe(estimateText);
    expect(textMeasure({ ...GEIST, face: "" })).toBe(estimateText);
  });

  it("measures in the face at the style's size and weight, with its tracking", () => {
    const { fonts } = stubCanvas();
    const measure = textMeasure(GEIST);

    expect(measure("rate", ROW_TEXT)).toBe(20);
    expect(measure("rate", LABEL_TEXT)).toBe(20);
    expect(measure("rate", META_TEXT)).toBeCloseTo(20 + 4 * 11 * 0.01);
    expect(fonts).toEqual([
      `400 12px ${GEIST.face}`,
      `500 12px ${GEIST.face}`,
      `400 11px ${GEIST.face}`,
    ]);
  });

  it("measures each text in each style once", () => {
    const { context } = stubCanvas();
    const measure = textMeasure(GEIST);

    measure("rate", ROW_TEXT);
    measure("rate", ROW_TEXT);
    measure("scale", ROW_TEXT);

    expect(context.measureText).toHaveBeenCalledTimes(2);
  });
});
