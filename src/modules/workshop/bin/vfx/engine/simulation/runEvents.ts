import type { SystemModel } from "../model/model";
import { emissionEnded } from "../model/systemModel";
import type { ChildBirth } from "./children";
import type { EmitterState } from "./integrate";

/**
 * One change that a forward step of a run made, which a listener such as the sound of a run hears.
 *
 * Emitters are addressed by their index in the opened system's pool.
 */
export type RunEvent =
  /** The run started a pass: its first step, a restart or a loop's replay. */
  | { readonly kind: "systemStart" }
  /** The rig stopped the system, as `VfxSystem_Stop` does, or landed it. */
  | { readonly kind: "systemStop" }
  /** The emitter emitted for the first time this pass. */
  | { readonly kind: "emitterStart"; readonly emitter: number }
  /** The emitter's emission ended, after its first emission. */
  | { readonly kind: "emitterEnd"; readonly emitter: number }
  /** A child system was spawned. */
  | { readonly kind: "childBirth"; readonly birth: ChildBirth };

/** What a run's step leaves behind that its events are read from. */
export interface HeardRun {
  readonly system: SystemModel;
  readonly states: readonly EmitterState[];
  /** The last step ran with the system stopped. */
  readonly stopped: boolean;
  readonly births: readonly ChildBirth[];
}

/** What a run has reported of its current pass, so each change is reported once. */
export interface Hearing {
  /** Forgets the pass, so the next step reports a new system start. */
  reset(): void;
  /**
   * Records `run` as reported, so a step after it reports only what changes.
   *
   * `started` is false for a run that stands at the start of its pass, whose next step reports
   * the system start.
   */
  sync(run: HeardRun, started: boolean): void;
  /** Appends to `out` what `run` changed since the last report. */
  hear(run: HeardRun, out: RunEvent[]): void;
}

/** Returns a hearing that has reported nothing of a pass that has not started. */
export function createHearing(): Hearing {
  let started = false;
  let stopped = false;
  let births = 0;
  const emitted: boolean[] = [];
  const ended: boolean[] = [];

  return {
    reset() {
      started = false;
      stopped = false;
      births = 0;
      emitted.length = 0;
      ended.length = 0;
    },
    sync(run, isStarted) {
      started = isStarted;
      stopped = run.stopped;
      births = run.births.length;
      emitted.length = 0;
      ended.length = 0;
      run.states.forEach((state, at) => {
        emitted[at] = state.emitted;
        ended[at] = endedOf(run.system, state, at);
      });
    },
    hear(run, out) {
      if (!started) {
        started = true;
        out.push(SYSTEM_START);
      }

      run.states.forEach((state, at) => {
        if (state.absent) return;

        if (!emitted[at] && state.emitted) {
          emitted[at] = true;
          out.push({ kind: "emitterStart", emitter: at });
        }
        if (emitted[at] && !ended[at] && endedOf(run.system, state, at)) {
          ended[at] = true;
          out.push({ kind: "emitterEnd", emitter: at });
        }
      });

      for (; births < run.births.length; births += 1) {
        out.push({ kind: "childBirth", birth: run.births[births] });
      }

      if (!stopped && run.stopped) {
        stopped = true;
        out.push(SYSTEM_STOP);
      }
    },
  };
}

const SYSTEM_START: RunEvent = { kind: "systemStart" };
const SYSTEM_STOP: RunEvent = { kind: "systemStop" };

/** Returns true if the emitter at `at` has lingered or passed the end of its emission. */
function endedOf(system: SystemModel, state: EmitterState, at: number): boolean {
  const emitter = system.emitters[at];
  if (emitter === undefined) return false;

  return state.finishedAt !== null || emissionEnded(emitter, state.age);
}
