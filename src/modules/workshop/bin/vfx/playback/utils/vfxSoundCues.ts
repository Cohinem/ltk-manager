import type { MediaRepeat } from "../../../../audio/player/soundPlayer";
import type { SoundCue } from "../../../../audio/utils/soundCue";
import type { SystemModel } from "../../engine/model/model";
import { childPrefix } from "../../engine/simulation/children";

/**
 * The sound cues of one particle system, which its run fires on the driver's events.
 *
 * Per "VFX sound" in docs/ux/AUDIO.md.
 */
export interface VfxSoundCues {
  /** `soundOnCreateDefault` and `voiceOverOnCreateDefault`, which play once as the system starts. */
  readonly onCreate: readonly SoundCue[];
  /** `soundPersistentDefault` and `voiceOverPersistentDefault`, which loop until the system stops. */
  readonly persistent: readonly SoundCue[];
  /** The emitters that name a sound, in pool order. */
  readonly emitters: readonly EmitterSoundCues[];
}

/** The sound cues of one emitter's `Audio`. */
export interface EmitterSoundCues {
  /** The emitter's index in the system's pool. */
  readonly emitter: number;
  /** The emitter under the child path of its system, `2.0/1` for emitter 1 of child `2.0`. */
  readonly path: string;
  /** `SoundOnCreate`, which plays once at the emitter's first emission. */
  readonly onCreate: SoundCue | null;
  /** `SoundPersistent`, which loops from the emitter's first emission. */
  readonly persistent: SoundCue | null;
}

/**
 * Returns the sound cues of `system`, keyed under the child path `path`.
 *
 * `path` is empty for the opened system. Every cue of one system has its own key, and the cues of
 * two child paths never share one.
 */
export function vfxSoundCues(system: SystemModel, path = ""): VfxSoundCues {
  const prefix = path === "" ? "" : childPrefix(path);
  const cue = ({ key, name, repeat }: NamedSound): SoundCue | null =>
    name === null ? null : soundCue(`${prefix}${key}`, name, repeat);

  const emitters: EmitterSoundCues[] = [];
  for (const { index, audio } of system.emitters) {
    if (audio === null) continue;

    emitters.push({
      emitter: index,
      path: `${prefix}${index}`,
      onCreate: cue({ key: `${index}:SoundOnCreate`, name: audio.soundOnCreate, repeat: "once" }),
      persistent: cue({
        key: `${index}:SoundPersistent`,
        name: audio.soundPersistent,
        repeat: "loop",
      }),
    });
  }

  const { sounds } = system;
  return {
    onCreate: present([
      cue({ key: "soundOnCreateDefault", name: sounds.soundOnCreate, repeat: "once" }),
      cue({ key: "voiceOverOnCreateDefault", name: sounds.voiceOverOnCreate, repeat: "once" }),
    ]),
    persistent: present([
      cue({ key: "soundPersistentDefault", name: sounds.soundPersistent, repeat: "loop" }),
      cue({ key: "voiceOverPersistentDefault", name: sounds.voiceOverPersistent, repeat: "loop" }),
    ]),
    emitters,
  };
}

/** One sound field: the key its cue plays under, the event it names, and how its media plays. */
interface NamedSound {
  readonly key: string;
  readonly name: string | null;
  readonly repeat: MediaRepeat;
}

function present(cues: readonly (SoundCue | null)[]): SoundCue[] {
  return cues.filter((cue) => cue !== null);
}

/** Returns a cue that a run fires on an event rather than at a time of a pass. */
function soundCue(key: string, name: string, repeat: MediaRepeat): SoundCue {
  return { key, name, at: 0, endAt: null, kill: true, loop: true, skipIfPastEnd: false, repeat };
}
