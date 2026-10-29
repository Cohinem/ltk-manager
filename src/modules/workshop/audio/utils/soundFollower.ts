import type { SoundCue } from "./soundCue";

/** Where a follower sends the cues it fires. */
export interface SoundOutput {
  /** Starts the sound of `cue`. */
  play(cue: SoundCue): void;
  /** Stops every voice that the cue keyed `key` started. */
  stop(key: string): void;
}

/** The part of a scene clock a follower reads. */
export interface FollowedClock {
  readonly time: number;
  readonly generation: number;
}

/** Fires the sound cues of one viewport as its clock plays the pass. */
export interface SoundFollower {
  /** Fires every cue that forward playback crossed since the last call. */
  follow(clock: FollowedClock): void;
  /** Replaces the cues and the pass length, and stops every kill sound. */
  setCues(cues: readonly SoundCue[], duration: number): void;
  /** Stops every kill sound, as a clip that stops does. */
  stopKills(): void;
}

/** A clock that the follower has never read, so the first call only syncs. */
const UNSYNCED = -1;

/**
 * Returns a follower that fires `cues` on a pass of `duration` seconds through `output`.
 *
 * Each call folds the clock into the pass and fires the cues in `[last, now)`, so every moment
 * fires once. A wrap of the pass stops the kill sounds and starts the next pass. A clock
 * `generation` change fires nothing: it stops the kill sounds and starts the pass count over
 * where the folded time moved, and changes nothing where it did not, because the viewport folds
 * the clock in place when an effect model loads. Per "Viewport sound" in docs/ux/AUDIO.md.
 */
export function createSoundFollower(
  output: SoundOutput,
  cues: readonly SoundCue[],
  duration: number,
): SoundFollower {
  let current = cues;
  let length = duration;
  let generation = UNSYNCED;
  let last = 0;
  let pass = 0;
  const killing = new Set<string>();

  const stopKills = () => {
    for (const key of killing) output.stop(key);
    killing.clear();
  };

  const fire = (from: number, to: number, end: number) => {
    for (const cue of current) {
      if (cue.at < from || cue.at >= to) continue;
      if (!cue.loop && pass > 0) continue;
      if (cue.skipIfPastEnd && cue.endAt !== null && end > cue.endAt) continue;

      if (cue.kill) {
        if (killing.has(cue.key)) output.stop(cue.key);
        killing.add(cue.key);
      }
      output.play(cue);
    }
  };

  return {
    follow(clock) {
      const now = length > 0 ? clock.time % length : 0;

      if (clock.generation !== generation) {
        const synced = generation !== UNSYNCED;
        generation = clock.generation;
        if (synced && now !== last) {
          stopKills();
          pass = 0;
        }
        last = now;
        return;
      }

      if (now > last) fire(last, now, now);
      if (now < last) {
        fire(last, length, length);
        stopKills();
        pass += 1;
        fire(0, now, now);
      }
      last = now;
    },
    setCues(cues, duration) {
      stopKills();
      current = cues;
      length = duration;
    },
    stopKills,
  };
}
