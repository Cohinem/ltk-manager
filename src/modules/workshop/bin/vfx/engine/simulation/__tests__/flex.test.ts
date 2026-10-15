import { describe, expect, it } from "vitest";

import type { FlexValue } from "../../model/model";
import { constant } from "../../parsing/readValue";
import { addFlexInto, flexScaleOf, flexTerm, instanceScaleOf } from "../flex";

const NO_DRAW = () => 0.5;

function channels(...values: number[]): Float32Array {
  return new Float32Array([values[0] ?? 0, values[1] ?? 0, values[2] ?? 0]);
}

const RATE: FlexValue = { channel: 0, value: constant([4]) };

describe("flexTerm", () => {
  it("returns the value times its channel", () => {
    expect(flexTerm(channels(0.5), RATE, 0)).toBe(2);
  });

  it("returns 0 if the channel is unset", () => {
    expect(flexTerm(channels(), RATE, 0)).toBe(0);
  });
});

describe("addFlexInto", () => {
  it("adds the step term and the channel times the base plus that term if the flex draws no table", () => {
    const out = new Float32Array([10]);
    addFlexInto(channels(2), RATE, constant([3]), 0, NO_DRAW, null, out, 0, 1);

    expect(out[0]).toBe(10 + 8 + 2 * (3 + 8));
  });

  it("leaves the birth value as it is if the channel is unset", () => {
    const out = new Float32Array([10]);
    addFlexInto(channels(), RATE, constant([3]), 0, NO_DRAW, null, out, 0, 1);

    expect(out[0]).toBe(10);
  });
});

describe("flexScaleOf", () => {
  it("returns the channel times the value above the guard and 1 below it", () => {
    expect(flexScaleOf(channels(2), { channel: 0, value: 1.5 })).toBe(3);
    expect(flexScaleOf(channels(), { channel: 0, value: 1.5 })).toBe(1);
  });
});

describe("instanceScaleOf", () => {
  it("returns the channel itself, whatever the value", () => {
    expect(instanceScaleOf(channels(0.25), { channel: 0, value: 9 })).toBe(0.25);
    expect(instanceScaleOf(channels(0.25), null)).toBe(1);
  });
});
