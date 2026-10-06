import { describe, expect, it } from "vitest";

import { rateReading } from "../rateReading";
import { emitterOf, flat } from "./emitterFixture";

describe("rateReading", () => {
  it("returns the rate curve at the emitter's phase and the largest count one step spawns", () => {
    const emitter = emitterOf(0, {
      lifetime: 2,
      rate: {
        constant: [0],
        keys: [
          { time: 0, values: [10] },
          { time: 1, values: [30] },
        ],
        tables: [],
      },
    });

    expect(rateReading(emitter, 0)).toEqual({ kind: "rate", rate: 10, step: 4, drawn: false });
    expect(rateReading(emitter, 1)).toEqual({ kind: "rate", rate: 20, step: 7, drawn: false });
  });

  it("limits the step count to 1000 at any rate", () => {
    expect(rateReading(emitterOf(0, { rate: flat(9000) }), 0)).toMatchObject({ step: 1000 });
  });

  it("reports that a probability table multiplies the rate", () => {
    const table = { channel: 0, single: 1, keys: [] };
    const emitter = emitterOf(0, { rate: { constant: [5], keys: [], tables: [table] } });

    expect(rateReading(emitter, 0)).toMatchObject({ kind: "rate", rate: 5, drawn: true });
  });

  it("is idle before the start delay, after the end time and in the inactive part of a period", () => {
    const emitter = emitterOf(0, {
      rate: flat(10),
      timeBeforeFirstEmission: 1,
      lifetime: 6,
      period: { length: 2, active: 0.5 },
    });

    expect(rateReading(emitter, 0.5).kind).toBe("idle");
    expect(rateReading(emitter, 2.25).kind).toBe("rate");
    expect(rateReading(emitter, 3).kind).toBe("idle");
    expect(rateReading(emitter, 6).kind).toBe("idle");
  });

  it("reports the speed kind when rateByVelocityFunction is set", () => {
    const emitter = emitterOf(0, { rate: flat(10), rateByVelocity: [1, 0] });

    expect(rateReading(emitter, 0)).toEqual({ kind: "speed" });
  });

  it("returns a single burst's count, at least one, and its time, the start delay", () => {
    const burst = { singleParticle: true, timeBeforeFirstEmission: 0.5 };

    expect(rateReading(emitterOf(0, { ...burst, rate: flat(12.9) }), 3)).toEqual({
      kind: "burst",
      count: 12,
      at: 0.5,
    });
    expect(rateReading(emitterOf(0, { ...burst, rate: flat(0) }), 0)).toMatchObject({ count: 1 });
  });
});
