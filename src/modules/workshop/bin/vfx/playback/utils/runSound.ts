import type { SoundCue } from "../../../../audio/utils/soundCue";
import type { SoundOutput } from "../../../../audio/utils/soundFollower";
import type { SystemModel } from "../../engine/model/model";
import {
  childPath,
  childPrefix,
  childSteps,
  MAX_CHILD_DEPTH,
} from "../../engine/simulation/children";
import type { RunEvent } from "../../engine/simulation/runEvents";
import { vfxSoundCues, type VfxSoundCues } from "./vfxSoundCues";

/** The sound of one particle system's run, which plays what the driver's events call for. */
export interface RunSound {
  /** Plays and stops the sounds that `events` of a run of `system` call for. */
  hear(system: SystemModel, events: readonly RunEvent[]): void;
  /** Stops every sound that the run started. */
  stop(): void;
}

/**
 * Returns the sound of a run that plays through `output`, every key under `scope`.
 *
 * A system start stops every sound of the pass and plays the system's on-create and persistent
 * cues. An emitter's first emission plays its cues, and its end stops its persistent cue where
 * the system sets `soundsEndOnEmitterEnd`. A system stop stops every persistent cue. A child's
 * birth plays the child system's on-create cues. Per "VFX sound" in docs/ux/AUDIO.md.
 */
export function createRunSound(output: SoundOutput, scope = ""): RunSound {
  const playing = new Set<string>();

  const play = (cue: SoundCue | null) => {
    if (cue === null) return;

    const key = `${scope}${cue.key}`;
    playing.add(key);
    output.play({ ...cue, key });
  };
  const halt = (cue: SoundCue | null) => {
    if (cue === null) return;

    const key = `${scope}${cue.key}`;
    if (!playing.delete(key)) return;
    output.stop(key);
  };
  const stop = () => {
    for (const key of playing) output.stop(key);
    playing.clear();
  };

  return {
    hear(system, events) {
      if (events.length === 0) return;

      const cues = cuesOf(system);
      for (const event of events) {
        switch (event.kind) {
          case "systemStart":
            stop();
            cues.onCreate.forEach(play);
            cues.persistent.forEach(play);
            break;
          case "systemStop":
            cues.persistent.forEach(halt);
            for (const emitter of cues.emitters) halt(emitter.persistent);
            break;
          case "emitterStart": {
            const emitter = emitterCues(cues, event.emitter);
            play(emitter?.onCreate ?? null);
            play(emitter?.persistent ?? null);
            break;
          }
          case "emitterEnd":
            if (system.soundsEndOnEmitterEnd) {
              halt(emitterCues(cues, event.emitter)?.persistent ?? null);
            }
            break;
          case "childBirth": {
            const child = childSystemAt(system, event.birth.path);
            if (child !== null) vfxSoundCues(child, event.birth.path).onCreate.forEach(play);
            break;
          }
        }
      }
    },
    stop,
  };
}

/**
 * Returns every cue that a run of `system` can fire, which a viewport resolves the names of.
 *
 * The children's on-create cues are listed to `MAX_CHILD_DEPTH`, once per child path.
 */
export function runSoundCues(system: SystemModel): SoundCue[] {
  const own = cuesOf(system);
  const cues: SoundCue[] = [
    ...own.onCreate,
    ...own.persistent,
    ...own.emitters.flatMap((emitter) =>
      [emitter.onCreate, emitter.persistent].filter((cue) => cue !== null),
    ),
  ];

  const visit = (parent: SystemModel, prefix: string, depth: number) => {
    if (depth > MAX_CHILD_DEPTH) return;

    for (const emitter of parent.emitters) {
      emitter.childSet?.children.forEach((child, slot) => {
        if (child === null) return;

        const path = childPath(prefix, emitter.index, slot);
        cues.push(...vfxSoundCues(child, path).onCreate);
        visit(child, childPrefix(path), depth + 1);
      });
    }
  };
  visit(system, "", 1);

  return cues;
}

const cached = new WeakMap<SystemModel, VfxSoundCues>();

/** Returns the cues of the opened `system`, read once per model. */
function cuesOf(system: SystemModel): VfxSoundCues {
  let cues = cached.get(system);
  if (cues === undefined) {
    cues = vfxSoundCues(system);
    cached.set(system, cues);
  }
  return cues;
}

function emitterCues(cues: VfxSoundCues, emitter: number) {
  return cues.emitters.find((each) => each.emitter === emitter);
}

/** Returns the child system that `path` addresses under `system`, and null for none. */
function childSystemAt(system: SystemModel, path: string): SystemModel | null {
  let at: SystemModel | null = system;
  for (const { emitter, slot } of childSteps(path)) {
    at = at?.emitters[emitter]?.childSet?.children[slot] ?? null;
  }
  return at;
}
