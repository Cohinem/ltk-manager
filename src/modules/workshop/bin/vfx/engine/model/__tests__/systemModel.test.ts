import { describe, expect, it } from "vitest";

import { emitterOf, flat } from "../../simulation/__tests__/emitterFixture";
import { LINGER_TYPE } from "../enums";
import type { SystemModel, ValueCurve } from "../model";
import {
  curveMaximum,
  emissionEnd,
  emissionEnded,
  emissionPeriod,
  emitterPhase,
  emptySystem,
  lingerSeconds,
  lingerTail,
  periodActive,
  simulationEquals,
  stopWaitSeconds,
  systemSpan,
} from "../systemModel";

function systemOf(over: Partial<SystemModel>): SystemModel {
  return { ...emptySystem(null), ...over };
}

/** A one-channel curve through `keys`, each a time and a value, over a constant of `constant`. */
function keyed(constant: number, ...keys: [number, number][]): ValueCurve {
  return {
    constant: [constant],
    keys: keys.map(([time, value]) => ({ time, values: [value] })),
    tables: [],
  };
}

describe("curveMaximum", () => {
  it("answers the constant of a value with no curve", () => {
    expect(curveMaximum(flat(3))).toBe(3);
    expect(curveMaximum(flat(-1))).toBe(-1);
  });

  it("answers the largest key of a curve, leaving its constant unread", () => {
    expect(curveMaximum(keyed(50, [0, 1], [0.5, 4], [1, 2]))).toBe(4);
    expect(curveMaximum(keyed(50, [0, -3], [1, -2]))).toBe(-2);
  });

  it("answers zero for a value holding no channel", () => {
    expect(curveMaximum(flat())).toBe(0);
  });
});

describe("emissionEnd", () => {
  it("answers lifetime as written, and null for an emitter writing none", () => {
    expect(emissionEnd(emitterOf(0, { lifetime: 2.5 }))).toBe(2.5);
    expect(emissionEnd(emitterOf(0, { lifetime: null }))).toBeNull();
  });

  it("leaves lifetime alone under a delay, the end counting from the system's start", () => {
    expect(emissionEnd(emitterOf(0, { lifetime: 2.5, timeBeforeFirstEmission: 2 }))).toBe(2.5);
  });

  it("ends a single-particle emitter writing no lifetime at its particle lifetime", () => {
    const burst = { singleParticle: true, particleLifetime: flat(3) };

    expect(emissionEnd(emitterOf(0, { ...burst, lifetime: null }))).toBe(3);
  });

  it("ends a single-particle emitter there too where lifetime is over ten seconds past it", () => {
    const burst = { singleParticle: true, particleLifetime: flat(3) };

    expect(emissionEnd(emitterOf(0, { ...burst, lifetime: 13.5 }))).toBe(3);
    expect(emissionEnd(emitterOf(0, { ...burst, lifetime: 13 }))).toBe(13);
    expect(emissionEnd(emitterOf(0, { ...burst, lifetime: 1 }))).toBe(1);
  });

  it("reads a keyed particle lifetime at its largest key for that rewrite", () => {
    const burst = { singleParticle: true, particleLifetime: keyed(100, [0, 1], [1, 4]) };

    expect(emissionEnd(emitterOf(0, { ...burst, lifetime: null }))).toBe(4);
  });

  it("rewrites nothing for a simple emitter, one overriding materials, or a particle that never expires", () => {
    const burst = { singleParticle: true, particleLifetime: flat(3), lifetime: null };

    expect(emissionEnd(emitterOf(0, { ...burst, simple: true }))).toBeNull();
    expect(emissionEnd(emitterOf(0, { ...burst, overridesMaterials: true }))).toBeNull();
    expect(emissionEnd(emitterOf(0, { ...burst, particleLifetime: flat(-1) }))).toBeNull();
    expect(emissionEnd(emitterOf(0, { ...burst, singleParticle: false }))).toBeNull();
  });
});

describe("emissionEnded", () => {
  it("ends an emitter once the system's time reaches its end", () => {
    const ending = emitterOf(0, { lifetime: 2 });

    expect(emissionEnded(ending, 1.99)).toBe(false);
    expect(emissionEnded(ending, 2)).toBe(true);
    expect(emissionEnded(ending, 30)).toBe(true);
  });

  it("never ends an emitter with no end", () => {
    expect(emissionEnded(emitterOf(0), 1e6)).toBe(false);
  });

  it("ends a single-particle emitter at the rewritten end", () => {
    const burst = emitterOf(0, { singleParticle: true, particleLifetime: flat(3) });

    expect(emissionEnded(burst, 2.5)).toBe(false);
    expect(emissionEnded(burst, 3)).toBe(true);
  });

  it("has an emitter of a negative end ended from the start", () => {
    expect(emissionEnded(emitterOf(0, { lifetime: -1 }), 0)).toBe(true);
  });
});

describe("emissionPeriod", () => {
  it("keeps each of the two as read, and answers null where neither is set", () => {
    expect(emissionPeriod(null, null)).toBeNull();
    expect(emissionPeriod(2, null)).toEqual({ length: 2, active: null });
    expect(emissionPeriod(null, 0.5)).toEqual({ length: null, active: 0.5 });
    expect(emissionPeriod(2, 0.5)).toEqual({ length: 2, active: 0.5 });
  });
});

describe("periodActive", () => {
  it("is always active for an emitter writing no period, or no active time", () => {
    expect(periodActive(null, 7)).toBe(true);
    expect(periodActive({ length: 2, active: null }, 7)).toBe(true);
  });

  it("is active while the time into the cycle is under the active time", () => {
    const period = { length: 2, active: 0.5 };

    expect(periodActive(period, 0)).toBe(true);
    expect(periodActive(period, 0.25)).toBe(true);
    expect(periodActive(period, 0.5)).toBe(false);
    expect(periodActive(period, 1.75)).toBe(false);
    expect(periodActive(period, 2.25)).toBe(true);
    expect(periodActive(period, 4.75)).toBe(false);
  });

  it("runs one cycle that never repeats where the period has no length", () => {
    const period = { length: null, active: 1 };

    expect(periodActive(period, 0.5)).toBe(true);
    expect(periodActive(period, 1)).toBe(false);
    expect(periodActive(period, 100)).toBe(false);
  });

  it("is never active for a cycle of no length", () => {
    expect(periodActive({ length: 0, active: 1 }, 0)).toBe(false);
    expect(periodActive({ length: 0, active: 1 }, 0.5)).toBe(false);
  });
});

describe("emitterPhase", () => {
  it("divides the time since the first emission by the end time", () => {
    const ending = emitterOf(0, { lifetime: 4, timeBeforeFirstEmission: 1 });

    expect(emitterPhase(ending, 1)).toBe(0);
    expect(emitterPhase(ending, 3)).toBe(0.5);
  });

  it("clamps at neither end, running under zero before the delay and past one after the end", () => {
    const ending = emitterOf(0, { lifetime: 4, timeBeforeFirstEmission: 1 });

    expect(emitterPhase(ending, 0)).toBe(-0.25);
    expect(emitterPhase(ending, 9)).toBe(2);
  });

  it("divides by the period where that is the only one set, and does not restart each cycle", () => {
    const cycling = emitterOf(0, { period: { length: 2, active: null } });

    expect(emitterPhase(cycling, 1)).toBe(0.5);
    expect(emitterPhase(cycling, 5)).toBe(2.5);
  });

  it("divides by the active time where that is the only one set", () => {
    const gated = emitterOf(0, { period: { length: null, active: 0.5 } });

    expect(emitterPhase(gated, 1)).toBe(2);
  });

  it("divides by the least of the three an emitter sets", () => {
    const byEnd = emitterOf(0, { lifetime: 1, period: { length: 4, active: 2 } });
    const byActive = emitterOf(0, { lifetime: 8, period: { length: 4, active: 2 } });
    const byLength = emitterOf(0, { lifetime: 8, period: { length: 4, active: 5 } });

    expect(emitterPhase(byEnd, 1)).toBe(1);
    expect(emitterPhase(byActive, 1)).toBe(0.5);
    expect(emitterPhase(byLength, 1)).toBe(0.25);
  });

  it("divides by the end the single-particle rewrite leaves", () => {
    const burst = emitterOf(0, { singleParticle: true, particleLifetime: flat(2) });

    expect(emitterPhase(burst, 1)).toBe(0.5);
  });

  it("stands at zero for an emitter setting none of the three, and for a span of nothing", () => {
    expect(emitterPhase(emitterOf(0), 0)).toBe(0);
    expect(emitterPhase(emitterOf(0, { timeBeforeFirstEmission: 1 }), 50)).toBe(0);
    expect(emitterPhase(emitterOf(0, { lifetime: 0 }), 3)).toBe(0);
  });
});

describe("systemSpan", () => {
  it("spans a single burst from its delay over the particle's life", () => {
    const burst = emitterOf(0, {
      singleParticle: true,
      timeBeforeFirstEmission: 2,
      particleLifetime: flat(3),
    });

    expect(systemSpan(systemOf({ emitters: [burst] }))).toBe(5);
  });

  it("gives an endless emitter five seconds of births past its delay", () => {
    const endless = emitterOf(0, { timeBeforeFirstEmission: 1, particleLifetime: flat(2) });

    expect(systemSpan(systemOf({ emitters: [endless] }))).toBe(8);
  });

  it("spans an emitter with an end to that end plus a life, whatever its delay", () => {
    const prompt = emitterOf(0, { lifetime: 4, particleLifetime: flat(2) });
    const delayed = emitterOf(0, {
      lifetime: 4,
      timeBeforeFirstEmission: 3,
      particleLifetime: flat(2),
    });

    expect(systemSpan(systemOf({ emitters: [prompt] }))).toBe(6);
    expect(systemSpan(systemOf({ emitters: [delayed] }))).toBe(6);
  });

  it("stops the births of a period with no length at its active time", () => {
    const gated = emitterOf(0, {
      period: { length: null, active: 1.5 },
      particleLifetime: flat(2),
    });

    expect(systemSpan(systemOf({ emitters: [gated] }))).toBe(3.5);
  });

  it("scales the life by the largest its lifetime table reaches", () => {
    const table = (single: number, ...keys: [number, number][]) => ({
      channel: 0,
      single,
      keys: keys.map(([time, value]) => ({ time, values: [value] })),
    });
    const spread = (tables: ValueCurve["tables"]) =>
      systemOf({
        emitters: [emitterOf(0, { lifetime: 4, particleLifetime: { ...flat(2), tables } })],
      });

    expect(systemSpan(spread([table(1, [0, 0.5], [1, 3])]))).toBe(10);
    expect(systemSpan(spread([table(2)]))).toBe(8);
  });

  it("gives a particle that never expires the same five seconds", () => {
    const lasting = emitterOf(0, { lifetime: 2, particleLifetime: flat(-1) });

    expect(systemSpan(systemOf({ emitters: [lasting] }))).toBe(7);
  });

  it("takes the longest of its emitters and skips a disabled one", () => {
    const brief = emitterOf(0, { lifetime: 1, particleLifetime: flat(1) });
    const long = emitterOf(1, { lifetime: 4, particleLifetime: flat(5) });

    expect(systemSpan(systemOf({ emitters: [brief, long] }))).toBe(9);
    expect(systemSpan(systemOf({ emitters: [brief, { ...long, disabled: true }] }))).toBe(2);
  });

  it("spans a second at the least and a minute at the most", () => {
    const blink = emitterOf(0, { lifetime: 0.1, particleLifetime: flat(0.1) });
    const epoch = emitterOf(0, { lifetime: 500, particleLifetime: flat(1) });

    expect(systemSpan(systemOf({ emitters: [] }))).toBe(1);
    expect(systemSpan(systemOf({ emitters: [blink] }))).toBe(1);
    expect(systemSpan(systemOf({ emitters: [epoch] }))).toBe(60);
  });
});

describe("stopWaitSeconds", () => {
  it("caps emitterLinger at a complex emitter's end time plus ten, and a simple one's at ten", () => {
    expect(stopWaitSeconds(emitterOf(0, { emitterLinger: 30, lifetime: 1 }))).toBe(11);
    expect(stopWaitSeconds(emitterOf(0, { emitterLinger: 30, lifetime: null }))).toBe(30);
    expect(stopWaitSeconds(emitterOf(0, { emitterLinger: 30, simple: true }))).toBe(10);
  });

  it("caps a single-particle emitter's at the end its rewrite leaves", () => {
    const burst = { emitterLinger: 30, singleParticle: true, particleLifetime: flat(2) };

    expect(stopWaitSeconds(emitterOf(0, burst))).toBe(12);
  });

  it("waits no time for an emitter authoring no emitterLinger", () => {
    expect(stopWaitSeconds(emitterOf(0))).toBe(0);
    expect(stopWaitSeconds(emitterOf(0, { emitterLinger: -3 }))).toBe(0);
  });
});

describe("lingerSeconds", () => {
  it("caps particleLinger at a complex emitter's particle lifetime plus ten", () => {
    expect(lingerSeconds(emitterOf(0, { particleLinger: 30, particleLifetime: flat(2) }))).toBe(12);
    expect(lingerSeconds(emitterOf(0, { particleLinger: 5, particleLifetime: flat(2) }))).toBe(5);
  });

  it("reads a keyed particle lifetime at its largest key for the cap", () => {
    const curved = keyed(100, [0, 1], [1, 4]);

    expect(lingerSeconds(emitterOf(0, { particleLinger: 30, particleLifetime: curved }))).toBe(14);
  });

  it("caps a simple emitter's at ten, and gives none for a negative linger", () => {
    const simple = { simple: true, particleLifetime: flat(50) };

    expect(lingerSeconds(emitterOf(0, { ...simple, particleLinger: 30 }))).toBe(10);
    expect(lingerSeconds(emitterOf(0, { particleLinger: -1 }))).toBe(0);
  });
});

describe("lingerTail", () => {
  const lingering = {
    particleLifetime: flat(1),
    particleLinger: 0.5,
    lingerType: LINGER_TYPE.fixedLifetimeAfterEmitterDies,
  };

  it("adds the wait still owed at the stop to the linger", () => {
    const system = systemOf({ emitters: [emitterOf(0, { ...lingering, emitterLinger: 3 })] });

    expect(lingerTail(system, 1)).toBe(2.5);
    expect(lingerTail(system, 4)).toBe(0.5);
  });

  it("counts the build-up in the system's age at the stop", () => {
    const system = systemOf({
      emitters: [emitterOf(0, { ...lingering, emitterLinger: 3 })],
      buildUpTime: 2,
    });

    expect(lingerTail(system, 0.5)).toBe(1);
  });
});

describe("simulationEquals", () => {
  const held = systemOf({ emitters: [emitterOf(0)] });

  /** `held` with `over` written on its one emitter. */
  function edited(over: Parameters<typeof emitterOf>[1]): SystemModel {
    return systemOf({ emitters: [emitterOf(0, over)] });
  }

  it("reads an edit to what only the draw takes as the same simulation", () => {
    expect(simulationEquals(held, edited({ modulation: [1, 0.5, 0.25, 1] }))).toBe(true);
    expect(simulationEquals(held, edited({ flipWinding: true }))).toBe(true);
    expect(simulationEquals(held, edited({ renderPhaseOverride: 4, groundLayer: true }))).toBe(
      true,
    );
  });

  it("reads an edit to what a birth or a step takes as another simulation", () => {
    expect(simulationEquals(held, edited({ chanceToNotExist: 0.5 }))).toBe(false);
    expect(simulationEquals(held, edited({ rateByVelocity: [1, 0] }))).toBe(false);
    expect(simulationEquals(held, edited({ hasVariableStartTime: true }))).toBe(false);
    expect(simulationEquals(held, edited({ birthAcceleration: flat(0, 1, 0) }))).toBe(false);
    expect(simulationEquals(held, edited({ postRotate: [0, 90, 0] }))).toBe(false);
    expect(simulationEquals(held, edited({ offsetLifetimeScaling: [1, 0, 0] }))).toBe(false);
  });

  it("reads a system moved onto the HUD layer as another simulation", () => {
    expect(simulationEquals(held, { ...held, hudLayer: true })).toBe(false);
  });
});
