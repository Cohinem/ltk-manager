import type { SoundCue } from "../../../audio/utils/soundCue";
import {
  createSoundFollower,
  type FollowedClock,
  type SoundOutput,
} from "../../../audio/utils/soundFollower";
import type { RunEvent } from "../../vfx/engine/simulation/driver";
import { createRunSound, type RunSound, runSoundCues } from "../../vfx/playback/utils/runSound";
import type { ResolvedStep } from "./abilitySequence";

/** The sound events of the cast clip, and the second the clip ends at. */
export interface CastClipSound {
  readonly cues: readonly SoundCue[];
  readonly end: number;
}

/** The run events that one step's effect reported on a frame. */
export interface StepRun {
  readonly step: ResolvedStep;
  readonly events: readonly RunEvent[];
}

/** The sound of one ability preview, which follows the scene clock. */
export interface AbilitySound {
  /** Plays the cast clip's cues that the clock crossed, and what `runs` call for. */
  follow(clock: FollowedClock, runs: readonly StepRun[]): void;
  /** Stops every sound of the ability. */
  stop(): void;
}

/**
 * Returns every cue the ability can fire, which the preview resolves the names of.
 *
 * The cast clip's cues keep their clip times. A step's cues sit at the step's start, keyed under
 * the step's id.
 */
export function abilitySoundCues(
  cast: readonly SoundCue[],
  steps: readonly ResolvedStep[],
): SoundCue[] {
  return [
    ...cast,
    ...steps.flatMap((step) =>
      runSoundCues(step.system).map((cue) => ({
        ...cue,
        key: `${step.id}/${cue.key}`,
        at: step.start + cue.at,
      })),
    ),
  ];
}

/**
 * Returns the sound of an ability preview that plays through `output`.
 *
 * The cast clip's cues fire as the clock plays across them, and its kill sounds stop at the
 * clip's end. Each step's effect plays the sounds its run events call for, under the step's id.
 * A clock `generation` change stops every sound and fires nothing, so a seek is silent and the
 * next forward frame after a restart fires from zero. Per "Ability sound" in docs/ux/AUDIO.md.
 */
export function createAbilitySound(output: SoundOutput, cast: CastClipSound): AbilitySound {
  const playing = new Set<string>();
  const tracked: SoundOutput = {
    play(cue) {
      playing.add(cue.key);
      output.play(cue);
    },
    stop(key) {
      playing.delete(key);
      output.stop(key);
    },
  };

  /* The timeline plays once, so the clip's pass never wraps. */
  const clip = createSoundFollower(tracked, cast.cues, Number.POSITIVE_INFINITY);
  const runs = new Map<string, RunSound>();
  let generation: number | null = null;
  let clipEnded = false;

  const runOf = (step: ResolvedStep) => {
    let run = runs.get(step.id);
    if (run === undefined) {
      run = createRunSound(tracked, `${step.id}/`);
      runs.set(step.id, run);
    }
    return run;
  };
  const stop = () => {
    for (const run of runs.values()) run.stop();
    for (const key of playing) output.stop(key);
    playing.clear();
  };

  return {
    follow(clock, heard) {
      clip.follow(clock);

      if (clock.generation !== generation) {
        generation = clock.generation;
        clipEnded = clock.time >= cast.end;
        stop();
        return;
      }

      if (!clipEnded && clock.time >= cast.end) {
        clipEnded = true;
        clip.stopKills();
      }

      for (const { step, events } of heard) runOf(step).hear(step.system, events);
    },
    stop,
  };
}
