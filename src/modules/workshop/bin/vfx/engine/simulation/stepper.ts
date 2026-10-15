import type { Stepping } from "../model/model";

/** One slice of simulation time, as the integrator runs one. */
export interface Step {
  /** Seconds the step advances the simulation by. */
  readonly dt: number;
  /** The time the step ends at, which is what a particle's age is measured against. */
  readonly now: number;
}

/** How a frame's elapsed time becomes simulation steps. */
export interface Stepper {
  /** The steps `frameTime` seconds buys, in the order they run. */
  advance(frameTime: number): Step[];
  /** Puts the clock at `now` and drops whatever time is banked. */
  reset(now?: number): void;
  /** The time the last step ended at. */
  readonly now: number;
}

/**
 * How many steps one `advance` runs at the authored period before it coarsens, the
 * client's own cap.
 *
 * A larger backlog halves the count and doubles `dt` until it fits, and what the halving
 * leaves over is banked for the next frame.
 */
export const MAX_STEPS = 20;

/** A stepper that runs one step per frame, however long the frame was. */
export function variableStepper(now = 0): Stepper {
  let clock = now;

  return {
    get now() {
      return clock;
    },
    advance(frameTime) {
      if (frameTime <= 0) return [];
      clock += frameTime;
      return [{ dt: frameTime, now: clock }];
    },
    reset(to = 0) {
      clock = to;
    },
  };
}

/**
 * A stepper that banks frame time and spends it in whole steps of `1 / rate`.
 *
 * If `everyFrame` is true, a frame that banks less than one whole step runs one step of the
 * banked time instead of none.
 */
export function fixedRateStepper(rate: number, now = 0, everyFrame = false): Stepper {
  let clock = now;
  let banked = 0;

  return {
    get now() {
      return clock;
    },
    advance(frameTime) {
      if (frameTime > 0) banked += frameTime;

      let count = Math.floor(banked * rate);
      if (count <= 0 && everyFrame && banked > 0) {
        clock += banked;
        const step = { dt: banked, now: clock };
        banked = 0;
        return [step];
      }
      if (count <= 0) return [];

      /* The client halves the count as a float and truncates once, after the loop. */
      let dt = 1 / rate;
      let halved = count;
      while (halved > MAX_STEPS) {
        halved *= 0.5;
        dt *= 2;
      }
      count = Math.trunc(halved);
      banked -= count * dt;

      const steps: Step[] = [];
      for (let at = 0; at < count; at += 1) {
        clock += dt;
        steps.push({ dt, now: clock });
      }
      return steps;
    },
    reset(to = 0) {
      clock = to;
      banked = 0;
    },
  };
}

/**
 * Returns the stepper a system with `stepping` runs on, from `now`.
 *
 * `oncePerFrame` takes one step per frame. Any other system takes whole steps at the effects
 * quality's rate, with the `everyFrame` fallback for a short frame.
 */
export function stepperFor(stepping: Stepping, now = 0): Stepper {
  if (stepping.oncePerFrame) return variableStepper(now);
  return fixedRateStepper(stepping.rate, now, stepping.everyFrame);
}
