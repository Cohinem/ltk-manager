import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";

import { Rng } from "../../utils/Rng";
import { compileDriver } from "../compileDriver";
import { type DriverContext, drawRandoms } from "../context";
import { easing, easingName } from "../easing";
import type { DriverScope } from "../node";
import { readDriver } from "../readDriver";
import { bool, list, number, struct, vector } from "./driverFixture";

function float(value: number): VfxValue {
  return struct("VfxFloatConstantDriver", { Float: number(value) });
}

interface At {
  readonly emitterAge?: number;
  readonly emitterRandoms?: readonly number[];
  readonly particleAge?: number;
  readonly particleRandoms?: readonly number[];
}

function context({
  emitterAge = 0,
  emitterRandoms = [],
  particleAge,
  particleRandoms = [],
}: At): DriverContext {
  return {
    now: emitterAge,
    emitterAge,
    emitterPhase: 0,
    emitterRandoms: Float32Array.from(emitterRandoms),
    particle:
      particleAge === undefined
        ? null
        : {
            row: 0,
            age: particleAge,
            age01: 0,
            randoms: Float32Array.from(particleRandoms),
          },
  };
}

function compile(graph: VfxValue, scope: DriverScope = "emitter") {
  return compileDriver(readDriver(graph, "float", "field").node, { scope });
}

function evaluate(graph: VfxValue, at: At, scope: DriverScope = "emitter"): number {
  const out = new Float32Array(1);
  compile(graph, scope).evaluate(context(at), out, 0);
  return out[0];
}

function codes(graph: VfxValue): string[] {
  return readDriver(graph, "float", "field").diagnostics.map((each) => each.code);
}

describe("VfxFloatSineDriver", () => {
  const sine = (time: number, period: number, remap?: VfxValue) =>
    struct("VfxFloatSineDriver", {
      Time: float(time),
      period: float(period),
      ...(remap === undefined ? {} : { Remap: remap }),
    });

  it("reads a quarter period as the top of Remap", () => {
    expect(evaluate(sine(0.25, 1), {})).toBeCloseTo(1, 6);
    expect(evaluate(sine(0.75, 1), {})).toBeCloseTo(0, 6);
  });

  it("reads time zero as the middle of Remap", () => {
    expect(evaluate(sine(0, 2, vector(2, 4)), {})).toBeCloseTo(3, 6);
  });

  it("reads a zero period as zero", () => {
    expect(evaluate(sine(1, 0, vector(2, 4)), {})).toBe(0);
  });

  it("folds where its inputs fold", () => {
    expect(compile(sine(0.25, 1)).variability).toBe("constant");
  });
});

describe("VfxFloatEasingDriver", () => {
  const eased = (fields: Record<string, VfxValue>) =>
    struct("VfxFloatEasingDriver", {
      Left: float(0),
      Right: float(10),
      duration: number(2),
      ...fields,
    });

  it("blends from Left to Right over duration seconds of the emitter's age", () => {
    expect(evaluate(eased({}), { emitterAge: 1 })).toBeCloseTo(5, 6);
    expect(evaluate(eased({ EasingFunction: number(7) }), { emitterAge: 1 })).toBeCloseTo(1.25, 6);
  });

  it("holds Right past the end, and wraps where it loops", () => {
    expect(evaluate(eased({}), { emitterAge: 5 })).toBeCloseTo(10, 6);
    expect(evaluate(eased({ looping: bool(true) }), { emitterAge: 3 })).toBeCloseTo(5, 6);
  });

  it("follows the particle's age at kPerParticle", () => {
    const graph = eased({ frequency: number(1) });

    expect(compile(graph, "particle").variability).toBe("particle");
    expect(evaluate(graph, { emitterAge: 2, particleAge: 1 }, "particle")).toBeCloseTo(5, 6);
  });

  it("is an emitter value at kPerEmitter", () => {
    const compiled = compile(eased({}), "particle");

    expect(compiled.variability).toBe("emitter");
    expect(compiled.constant).toBeNull();
  });

  it("reports what it cannot read", () => {
    expect(codes(eased({ Easing: number(1) }))).toContain("unreadEasing");
    expect(codes(eased({ EasingFunction: number(34) }))).toContain("unknownEasingFunction");
    expect(codes(eased({ frequency: number(2) }))).toContain("unreadFrequency");
    expect(codes(eased({ duration: number(0) }))).toContain("nonPositiveDuration");
  });

  it("reads an unknown easing as linear and a zero duration as zero", () => {
    expect(evaluate(eased({ EasingFunction: number(34) }), { emitterAge: 1 })).toBeCloseTo(5, 6);
    expect(evaluate(eased({ duration: number(0) }), { emitterAge: 1 })).toBe(0);
  });
});

describe("the EasingType curves", () => {
  it("names the 34 members and runs each from 0 to 1", () => {
    expect(easingName(0)).toBe("Linear");
    expect(easingName(33)).toBe("BounceEaseInOut");
    expect(easingName(34)).toBeNull();

    for (let value = 0; value <= 33; value += 1) {
      const ease = easing(value);
      expect(ease(0), easingName(value) ?? "").toBeCloseTo(0, 6);
      expect(ease(1), easingName(value) ?? "").toBeCloseTo(1, 6);
    }
  });

  it("puts each symmetric in-out curve at the middle half way", () => {
    for (let value = 6; value <= 33; value += 3) {
      expect(easing(value)(0.5), easingName(value) ?? "").toBeCloseTo(0.5, 6);
    }
  });
});

describe("the random nodes", () => {
  const random = (hash: string, low: number, high: number) =>
    struct(hash, { Range: vector(low, high) });

  it("maps a particle slot into Range in particle scope", () => {
    const graph = random("0x414d1503", 2, 4);

    expect(compile(graph, "particle").randomSlots).toEqual({ emitter: 0, particle: 1 });
    expect(evaluate(graph, { particleAge: 0, particleRandoms: [0.5] }, "particle")).toBe(3);
  });

  it("maps an emitter slot into Range in emitter scope", () => {
    const graph = random("0xc5e53afa", 0, 10);

    expect(compile(graph).randomSlots).toEqual({ emitter: 1, particle: 0 });
    expect(evaluate(graph, { emitterRandoms: [0.25] })).toBe(2.5);
  });

  it("gives each node its own slot, in the order the graph is walked", () => {
    const graph = struct("VfxAddFloatDriver", {
      params: list(random("0x414d1503", 0, 10), random("0x414d1503", 0, 100)),
    });

    expect(compile(graph, "particle").randomSlots).toEqual({ emitter: 0, particle: 2 });
    expect(
      evaluate(graph, { particleAge: 0, particleRandoms: [0.5, 0.25] }, "particle"),
    ).toBeCloseTo(30, 5);
  });

  it("reads a slot the block does not hold as a draw of zero", () => {
    expect(evaluate(random("0x414d1503", 2, 4), {})).toBe(2);
  });

  it("reproduces the same values from the same seed", () => {
    const graph = random("0x414d1503", 0, 1);
    const slots = compile(graph).randomSlots.emitter;
    const run = () => {
      const block = new Float32Array(slots);
      drawRandoms(block, new Rng(1337));
      return evaluate(graph, { emitterRandoms: Array.from(block) });
    };

    expect(run()).toBe(run());
  });

  it("keeps each draw across a recompile that keeps the slot layout", () => {
    const before = compile(random("0x414d1503", 0, 1), "particle");
    const after = compile(random("0x414d1503", 0, 2), "particle");
    const block = new Float32Array(before.randomSlots.particle);
    drawRandoms(block, new Rng(7));

    const at = context({ particleAge: 0, particleRandoms: Array.from(block) });
    const [first, second] = [new Float32Array(1), new Float32Array(1)];
    before.evaluate(at, first, 0);
    after.evaluate(at, second, 0);

    expect(after.randomSlots).toEqual(before.randomSlots);
    expect(second[0]).toBeCloseTo(2 * first[0], 6);
  });
});
