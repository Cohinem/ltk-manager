import { describe, expect, it } from "vitest";

import type { ProbabilityTable } from "../../../../values/utils/valueRows";
import type { ValueCurve } from "../../model/model";
import {
  drawChannelsInto,
  drawCurve,
  flickerInto,
  integratedInto,
  sampleCurve,
  sampleCurveInto,
  tableValue,
} from "../sampleCurve";

function tableOf(channel: number, ...keys: [number, number][]): ProbabilityTable {
  return { channel, single: 1, keys: keys.map(([time, value]) => ({ time, values: [value] })) };
}

describe("tableValue", () => {
  it("reads a table's single value where it holds no keys", () => {
    expect(tableValue({ channel: 0, single: 0.5, keys: [] }, 0.3)).toBe(0.5);
  });

  it("blends the two keys the draw falls between, flat past both ends", () => {
    const table = tableOf(0, [0, 1], [1, 360]);
    expect(tableValue(table, 0)).toBe(1);
    expect(tableValue(table, 0.5)).toBeCloseTo(180.5, 6);
    expect(tableValue(table, 1)).toBe(360);
    expect(tableValue(tableOf(0, [0.2, 10], [0.6, 30]), 0)).toBe(10);
    expect(tableValue(tableOf(0, [0.2, 10], [0.6, 30]), 0.9)).toBe(30);
  });

  it("answers one key as a fixed value", () => {
    expect(tableValue(tableOf(0, [0, 90]), 0.7)).toBe(90);
  });
});

describe("drawCurve", () => {
  it("multiplies each table's value at the chance into its own channel and leaves the rest", () => {
    const curve: ValueCurve = {
      constant: [1, -400, 5],
      keys: [],
      tables: [tableOf(0, [0, 90]), tableOf(1, [0, 0], [1, 1])],
    };
    const drawn = drawCurve(curve, 0, 0.25);

    expect(drawn[0]).toBe(90);
    expect(drawn[1]).toBeCloseTo(-100, 6);
    expect(drawn[2]).toBe(5);
  });

  it("leaves a curve with no tables as sampled, in a copy", () => {
    const curve: ValueCurve = { constant: [2, 4], keys: [], tables: [] };
    const drawn = drawCurve(curve, 0, 0.5);

    expect(drawn).toEqual([2, 4]);
    expect(drawn).not.toBe(curve.constant);
  });

  it("reads every channel's table at the one chance", () => {
    const curve: ValueCurve = {
      constant: [1, 1, 1],
      keys: [],
      tables: [tableOf(0, [0, 0], [1, 1]), tableOf(1, [0, 0], [1, 2]), tableOf(2, [0, 0], [1, 4])],
    };

    expect(drawCurve(curve, 0, 0.5)).toEqual([0.5, 1, 2]);
  });
});

function keyed(...keys: [number, ...number[]][]): ValueCurve {
  return {
    constant: [-1],
    keys: keys.map(([time, ...values]) => ({ time, values })),
    tables: [],
  };
}

describe("sampleCurve", () => {
  it("answers the constant whole for a value that carries no keys", () => {
    expect(sampleCurve({ constant: [2, 4, 8], keys: [], tables: [] }, 0.5)).toEqual([2, 4, 8]);
  });

  it("answers the one key for a curve keyed once, leaving the constant unread", () => {
    expect(sampleCurve(keyed([0.25, 7]), 0.9)).toEqual([7]);
  });

  it("blends the two keys a time falls between", () => {
    expect(sampleCurve(keyed([0, 0], [1, 10]), 0.5)).toEqual([5]);
    expect(sampleCurve(keyed([0.2, 100], [0.6, 300]), 0.4)[0]).toBeCloseTo(200, 10);
  });

  it("holds the first key flat before it and the last key flat after it", () => {
    const curve = keyed([0.25, 3], [0.75, 9]);
    expect(sampleCurve(curve, 0)).toEqual([3]);
    expect(sampleCurve(curve, 0.25)).toEqual([3]);
    expect(sampleCurve(curve, 0.75)).toEqual([9]);
    expect(sampleCurve(curve, 1)).toEqual([9]);
  });

  it("blends every channel of a vector curve in step", () => {
    const curve = keyed([0, 0, 10, 100, 1000], [1, 2, 30, 500, 3000]);
    expect(sampleCurve(curve, 0.5)).toEqual([1, 20, 300, 2000]);
  });

  it("draws the later of two keys sharing one time", () => {
    expect(sampleCurve(keyed([0, 1], [0.5, 2], [0.5, 8], [1, 9]), 0.5)).toEqual([8]);
  });

  it("reads a time outside the keyed range against the keys rather than clamping it", () => {
    const curve = keyed([0, 0], [1, 10]);
    expect(sampleCurve(curve, -4)).toEqual([0]);
    expect(sampleCurve(curve, 4)).toEqual([10]);
  });
});

describe("sampleCurveInto", () => {
  it("writes a constant into the slot the caller names", () => {
    const out = new Float32Array(8).fill(-1);
    sampleCurveInto({ constant: [1, 2, 3], keys: [], tables: [] }, 0.5, out, 3);

    expect(Array.from(out)).toEqual([-1, -1, -1, 1, 2, 3, -1, -1]);
  });

  it("writes a blended key into the slot the caller names", () => {
    const out = new Float32Array(4).fill(0);
    sampleCurveInto(keyed([0, 0, 0], [1, 4, 8]), 0.25, out, 1);

    expect(Array.from(out)).toEqual([0, 1, 2, 0]);
  });

  it("leaves the channels a narrower curve does not reach", () => {
    const out = Float32Array.from([9, 9, 9, 9]);
    sampleCurveInto({ constant: [1, 2, 3], keys: [], tables: [] }, 0, out, 0);

    expect(Array.from(out)).toEqual([1, 2, 3, 9]);
  });

  it("writes nothing past the end of the caller's array", () => {
    const out = Float32Array.from([0, 0]);
    sampleCurveInto({ constant: [5, 6, 7], keys: [], tables: [] }, 0, out, 1);

    expect(Array.from(out)).toEqual([0, 5]);
  });
});

/** A draw answering `values` in turn, which counts how often it was asked. */
function sequence(...values: number[]) {
  const draw = () => {
    const drawn = values[draw.calls % values.length];
    draw.calls += 1;
    return drawn;
  };
  draw.calls = 0;
  return draw;
}

describe("drawChannelsInto", () => {
  const spread: ValueCurve = {
    constant: [10, 10, 10],
    keys: [],
    tables: [tableOf(0, [0, 0], [1, 1]), tableOf(1, [0, 0], [1, 1]), tableOf(2, [0, 0], [1, 1])],
  };

  it("reads each channel's table at a draw of its own", () => {
    const draw = sequence(0.25, 0.5, 0.75);
    const out = new Float32Array(5).fill(-1);

    drawChannelsInto(spread, 0, draw, null, out, 1);

    expect(Array.from(out)).toEqual([-1, 2.5, 5, 7.5, -1]);
    expect(draw.calls).toBe(3);
  });

  it("reads every table at the pin, and still takes each draw off the stream", () => {
    const draw = sequence(0.25, 0.5, 0.75);
    const out = new Float32Array(3);

    drawChannelsInto(spread, 0, draw, 0.5, out, 0);

    expect(Array.from(out)).toEqual([5, 5, 5]);
    expect(draw.calls).toBe(3);
  });

  it("draws for a table past the curve's channels and multiplies it into nothing", () => {
    const narrow: ValueCurve = {
      constant: [4],
      keys: [],
      tables: [tableOf(0, [0, 0], [1, 1]), tableOf(2, [0, 0], [1, 1])],
    };
    const draw = sequence(0.5, 0.25);
    const out = new Float32Array(3).fill(9);

    drawChannelsInto(narrow, 0, draw, null, out, 0);

    expect(Array.from(out)).toEqual([2, 9, 9]);
    expect(draw.calls).toBe(2);
  });

  it("samples a keyed curve at the time before its tables multiply in", () => {
    const curve: ValueCurve = {
      ...keyed([0, 0, 0], [1, 8, 4]),
      tables: [tableOf(1, [0, 0], [1, 1])],
    };
    const out = new Float32Array(2);

    drawChannelsInto(curve, 0.5, sequence(0.5), null, out, 0);

    expect(Array.from(out)).toEqual([4, 1]);
  });

  it("takes no draw for a curve carrying no tables", () => {
    const draw = sequence(0.5);
    const out = new Float32Array(2);

    drawChannelsInto({ constant: [3, 6], keys: [], tables: [] }, 0, draw, null, out, 0);

    expect(Array.from(out)).toEqual([3, 6]);
    expect(draw.calls).toBe(0);
  });
});

describe("integratedInto", () => {
  /** The integrated value of `curve` at `age01`, one number per channel of `width`. */
  function integrated(curve: ValueCurve, age01: number, order: 1 | 2, width = 1): number[] {
    const out = new Float32Array(width);
    integratedInto(curve, age01, order, out, 0);
    return Array.from(out);
  }

  it("answers the constant as it is for a value with no keys, at either order", () => {
    const fixed: ValueCurve = { constant: [3, -4], keys: [], tables: [] };

    expect(integrated(fixed, 0, 1, 2)).toEqual([3, -4]);
    expect(integrated(fixed, 0.5, 1, 2)).toEqual([3, -4]);
    expect(integrated(fixed, 1, 2, 2)).toEqual([3, -4]);
  });

  it("integrates a curve holding one value to a ramp", () => {
    const level = keyed([0, 2], [1, 2]);

    expect(integrated(level, 0, 1)[0]).toBe(0);
    expect(integrated(level, 0.25, 1)[0]).toBeCloseTo(0.5, 5);
    expect(integrated(level, 0.5, 1)[0]).toBeCloseTo(1, 5);
    expect(integrated(level, 1, 1)[0]).toBeCloseTo(2, 5);
  });

  it("integrates a curve keyed once as that value held across the whole life", () => {
    expect(integrated(keyed([0.5, 4]), 0.25, 1)[0]).toBeCloseTo(1, 5);
    expect(integrated(keyed([0.5, 4]), 1, 1)[0]).toBeCloseTo(4, 5);
  });

  it("integrates a two-key ramp to a parabola", () => {
    const rising = keyed([0, 0], [1, 2]);

    expect(integrated(rising, 0.25, 1)[0]).toBeCloseTo(0.0625, 3);
    expect(integrated(rising, 0.5, 1)[0]).toBeCloseTo(0.25, 3);
    expect(integrated(rising, 1, 1)[0]).toBeCloseTo(1, 5);
  });

  it("holds the first and the last key flat where the keys stop short of the ends", () => {
    /* Two until 0.5 and four after it, with a step between two keys sharing no span. */
    const stepped = keyed([0.25, 2], [0.5, 2], [0.5, 4], [0.75, 4]);

    expect(integrated(stepped, 0.5, 1)[0]).toBeCloseTo(1, 1);
    expect(integrated(stepped, 1, 1)[0]).toBeCloseTo(3, 5);
  });

  it("integrates twice at order 2", () => {
    const level = keyed([0, 2], [1, 2]);
    const rising = keyed([0, 0], [1, 6]);

    expect(integrated(level, 0.5, 2)[0]).toBeCloseTo(0.25, 3);
    expect(integrated(level, 1, 2)[0]).toBeCloseTo(1, 4);
    expect(integrated(rising, 0.5, 2)[0]).toBeCloseTo(0.125, 3);
    expect(integrated(rising, 1, 2)[0]).toBeCloseTo(1, 4);
  });

  it("integrates each channel of a vector curve on its own", () => {
    const curve = keyed([0, 2, 0, -4], [1, 2, 2, -4]);

    const [x, y, z] = integrated(curve, 1, 1, 3);

    expect(x).toBeCloseTo(2, 5);
    expect(y).toBeCloseTo(1, 5);
    expect(z).toBeCloseTo(-4, 5);
  });

  it("reads an age outside the life at the nearest end", () => {
    const level = keyed([0, 2], [1, 2]);

    expect(integrated(level, -3, 1)[0]).toBe(0);
    expect(integrated(level, 3, 1)[0]).toBeCloseTo(2, 5);
  });

  it("writes into the slot the caller names and leaves the channels the curve lacks", () => {
    const out = new Float32Array(4).fill(-1);

    integratedInto(keyed([0, 2], [1, 2]), 1, 1, out, 2);

    expect(out[1]).toBe(-1);
    expect(out[2]).toBeCloseTo(2, 5);
    expect(out[3]).toBe(-1);
  });
});

describe("flickerInto", () => {
  const flickering: ValueCurve = {
    constant: [1, 1],
    keys: [],
    tables: [tableOf(1, [0, 1], [1, 2])],
  };

  /** `flickering` at one over both channels, flickered for `serial` at `now`. */
  function flickered(serial: number, now: number, curve = flickering): number[] {
    const out = new Float32Array([1, 1]);
    flickerInto(curve, serial, now, out, 0);
    return Array.from(out);
  }

  it("leaves a value carrying no tables as it was", () => {
    const out = new Float32Array([3, 5]);

    flickerInto({ constant: [1, 1], keys: [], tables: [] }, 7, 0.5, out, 0);

    expect(Array.from(out)).toEqual([3, 5]);
  });

  it("answers one serial at one time alike on every read", () => {
    expect(flickered(7, 0.5)).toEqual(flickered(7, 0.5));
  });

  it("multiplies its table into that table's own channel, inside the table's range", () => {
    for (let step = 0; step < 32; step += 1) {
      const [plain, drawn] = flickered(3, step / 60);

      expect(plain).toBe(1);
      expect(drawn).toBeGreaterThanOrEqual(1);
      expect(drawn).toBeLessThanOrEqual(2);
    }
  });

  it("draws afresh as the time moves, and apart for another serial", () => {
    const overTime = new Set(Array.from({ length: 16 }, (_, step) => flickered(7, step / 60)[1]));
    const overSerials = new Set(Array.from({ length: 16 }, (_, serial) => flickered(serial, 1)[1]));

    expect(overTime.size).toBeGreaterThan(8);
    expect(overSerials.size).toBeGreaterThan(8);
  });

  it("draws apart for two tables of one value", () => {
    const both: ValueCurve = {
      constant: [1, 1],
      keys: [],
      tables: [tableOf(0, [0, 1], [1, 2]), tableOf(1, [0, 1], [1, 2])],
    };
    const apart = Array.from({ length: 16 }, (_, step) => flickered(7, step / 60, both)).filter(
      ([x, y]) => x !== y,
    );

    expect(apart.length).toBeGreaterThan(8);
  });

  it("skips a table past the value's channels", () => {
    const out = new Float32Array([1, 1, 1]);
    const narrow: ValueCurve = { constant: [1], keys: [], tables: [tableOf(2, [0, 5], [1, 9])] };

    flickerInto(narrow, 7, 0.5, out, 0);

    expect(Array.from(out)).toEqual([1, 1, 1]);
  });
});
