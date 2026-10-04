import { describe, expect, it } from "vitest";

import {
  bendCompliance,
  CUBIC,
  LINEAR,
  sampleCurve,
  scaledValue,
  STEPPED,
  stretchCompliance,
} from "../curve";

describe("sampleCurve", () => {
  it("holds the first value before the first key and the last entry past the last key", () => {
    const curve = { times: [0.2, 0.8], values: [3, 7], modes: [LINEAR] };

    expect(sampleCurve(curve, 0)).toBe(3);
    expect(sampleCurve(curve, 0.2)).toBe(3);
    expect(sampleCurve(curve, 0.8)).toBe(7);
    expect(sampleCurve(curve, 2)).toBe(7);
  });

  it("answers its one value at any time and zero for none", () => {
    expect(sampleCurve({ times: [0.5], values: [4], modes: [] }, 0.9)).toBe(4);
    expect(sampleCurve({ times: [], values: [], modes: [] }, 0.5)).toBe(0);
  });

  it("draws a linear span straight and a stepped span flat", () => {
    const curve = {
      times: [0, 0.5, 1],
      values: [0, 1, 0.5],
      modes: [LINEAR, STEPPED],
    };

    expect(sampleCurve(curve, 0.25)).toBeCloseTo(0.5);
    expect(sampleCurve(curve, 0.75)).toBe(1);
  });

  it("reads every span as linear where the mode list is empty", () => {
    const curve = { times: [0, 1], values: [2, 4], modes: [] };

    expect(sampleCurve(curve, 0.5)).toBeCloseTo(3);
  });

  it("draws a cubic span through its two slopes, each a third of the span along", () => {
    /* Slopes of zero leave both controls on their keys, which is a smooth step. */
    const flat = { times: [0, 1], values: [0, 0, 0, 1], modes: [CUBIC] };
    expect(sampleCurve(flat, 0.5)).toBeCloseTo(0.5);
    expect(sampleCurve(flat, 0.25)).toBeCloseTo(0.15625);

    /* Slopes that match the chord draw the chord. */
    const chord = { times: [0, 2], values: [1, 2, 2, 5], modes: [CUBIC] };
    expect(sampleCurve(chord, 0.5)).toBeCloseTo(2);
    expect(sampleCurve(chord, 1.5)).toBeCloseTo(4);
  });

  it("moves its cursor three values past a cubic span and one past the others", () => {
    const curve = {
      times: [0, 1, 2, 3],
      values: [0, 0, 0, 1, 3, 9],
      modes: [CUBIC, LINEAR, STEPPED],
    };

    expect(sampleCurve(curve, 1.5)).toBeCloseTo(2);
    expect(sampleCurve(curve, 2.5)).toBe(3);
    expect(sampleCurve(curve, 3)).toBe(9);
  });

  it("answers the last entry inside a span of a mode it does not know", () => {
    const curve = { times: [0, 1, 2], values: [1, 2, 3], modes: [7, LINEAR] };

    expect(sampleCurve(curve, 0.5)).toBe(3);
  });
});

describe("scaledValue", () => {
  const curve = { times: [0, 1], values: [2, -1], modes: [LINEAR] };

  it("answers the value alone where the curve is off or absent", () => {
    expect(scaledValue({ value: 5, useCurve: false, curve }, 0.5)).toBe(5);
    expect(scaledValue({ value: 5, useCurve: true, curve: null }, 0.5)).toBe(5);
  });

  it("scales the value by the curve clamped to one and to zero", () => {
    expect(scaledValue({ value: 5, useCurve: true, curve }, 0)).toBe(5);
    expect(scaledValue({ value: 5, useCurve: true, curve }, 0.5)).toBeCloseTo(2.5);
    expect(scaledValue({ value: 5, useCurve: true, curve }, 1)).toBe(0);
  });
});

describe("rod compliance", () => {
  it("runs from a tenth at no stiffness to nothing at full stiffness", () => {
    expect(stretchCompliance(0)).toBeCloseTo(0.1, 9);
    expect(stretchCompliance(1)).toBeCloseTo(0, 12);
    expect(stretchCompliance(2)).toBeCloseTo(0, 12);
  });

  it("scales a bend or a twist by the segment's rest length", () => {
    expect(bendCompliance(0, 5)).toBeCloseTo(50, 5);
    expect(bendCompliance(1, 5)).toBeCloseTo(0, 12);
    expect(bendCompliance(0.5, 2)).toBeCloseTo((1e-3 - 1e-7) * 2, 9);
  });
});
