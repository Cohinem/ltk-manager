import { describe, expect, it } from "vitest";

import type { ValueCurve } from "../../../engine/model/model";
import { rangeText } from "../nodeText";
import { drawsRandom, rangeAt } from "../valueRange";

/** A uniform table from factor `from` to `to` on `channel`. */
function table(channel: number, from: number, to: number) {
  return {
    channel,
    single: 0,
    keys: [
      { time: 0, values: [from] },
      { time: 1, values: [to] },
    ],
  };
}

describe("valueRange", () => {
  it("reads a still base's span as the base times its least and most factor", () => {
    const curve: ValueCurve = {
      constant: [0.4],
      keys: [{ time: 0, values: [0.4] }],
      tables: [table(0, 0.7, 1)],
    };

    expect(drawsRandom(curve)).toBe(true);
    expect(rangeAt(curve, 0)[0]?.least).toBeCloseTo(0.28);
    expect(rangeAt(curve, 0)[0]?.most).toBeCloseTo(0.4);
    expect(rangeText(curve)).toBe("0.28 – 0.4");
  });

  it("follows a keyed base across the life, and keeps a channel without a table fixed", () => {
    const curve: ValueCurve = {
      constant: [0, 0],
      keys: [
        { time: 0, values: [10, 5] },
        { time: 1, values: [20, 5] },
      ],
      tables: [table(0, 0.5, 1)],
    };

    expect(rangeAt(curve, 1)[0]).toMatchObject({ least: 10, most: 20 });
    expect(rangeAt(curve, 1)[1]).toMatchObject({ least: 5, most: 5 });
  });

  it("turns a negative base's span the right way round", () => {
    const curve: ValueCurve = { constant: [-10], keys: [], tables: [table(0, 0.5, 1)] };

    expect(rangeAt(curve, 0)[0]).toMatchObject({ least: -10, most: -5 });
  });
});
