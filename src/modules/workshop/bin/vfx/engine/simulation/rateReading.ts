import type { EmitterModel } from "../model/model";
import { emissionEnded, emitterPhase, periodActive } from "../model/systemModel";
import { sampleCurve } from "../utils/sampleCurve";
import { burstCount, stepCap } from "./emit";
import { scalar } from "./particleRead";

/** An emitter's emission rate at one time of the run, as the inspector's rate line shows it. */
export type RateReading =
  /** An `isSingleParticle` emitter: `count` particles at time `at`, and none afterwards. */
  | { readonly kind: "burst"; readonly count: number; readonly at: number }
  /** The time is before the start delay, after the end time, or in the inactive part of a period. */
  | { readonly kind: "idle" }
  /** `rateByVelocityFunction` is set, so the rate is computed from the system's speed. */
  | { readonly kind: "speed" }
  | {
      readonly kind: "rate";
      /** The `rate` curve at the emitter's phase, before any probability table is applied. */
      readonly rate: number;
      /** The largest count one step spawns at `rate`. */
      readonly step: number;
      /** A probability table multiplies the rate each step. */
      readonly drawn: boolean;
    };

/** The rate of `emitter` when the system is `elapsed` seconds old. */
export function rateReading(emitter: EmitterModel, elapsed: number): RateReading {
  const drawn = emitter.rate.tables.some((table) => table.channel === 0);
  if (emitter.singleParticle) {
    const at = emitter.timeBeforeFirstEmission;
    const rate = rateAt(emitter, at);
    return { kind: "burst", count: burstCount(emitter, rate), at };
  }

  const waiting = elapsed < emitter.timeBeforeFirstEmission;
  if (waiting || emissionEnded(emitter, elapsed) || !periodActive(emitter.period, elapsed)) {
    return { kind: "idle" };
  }
  if (emitter.rateByVelocity !== null) return { kind: "speed" };

  const rate = rateAt(emitter, elapsed);
  return { kind: "rate", rate, step: stepCap(rate), drawn };
}

/** The `rate` curve at the emitter's phase when the system is `elapsed` seconds old. */
function rateAt(emitter: EmitterModel, elapsed: number): number {
  return Math.max(scalar(sampleCurve(emitter.rate, emitterPhase(emitter, elapsed))), 0);
}
