import { Matrix4 } from "three";
import { describe, expect, it } from "vitest";

import type { ClipEvent, GraphClip } from "@/lib/tauri";
import { createPose, createSceneClock, type SkeletonModel } from "@/modules/viewport";

import type { SoundCue } from "../../../../audio/utils/soundCue";
import type { SoundOutput } from "../../../../audio/utils/soundFollower";
import { nameHash } from "../../../shared/utils/binHash";
import { soundCues, timedSteps } from "../../../skin/utils/clipEvents";
import type { SystemModel } from "../../../vfx/engine/model/model";
import { emptySystem, NO_SOUNDS } from "../../../vfx/engine/model/systemModel";
import { emitterOf } from "../../../vfx/engine/simulation/__tests__/emitterFixture";
import type { AbilityRecipe } from "../abilityRecipe";
import { abilityInstance, abilitySteps, oncePose, type ResolvedStep } from "../abilitySequence";
import { abilitySoundCues, createAbilitySound } from "../abilitySound";
import { FLIGHT_STEP } from "../flight";

const RECIPE: AbilityRecipe = {
  version: 1,
  id: "q",
  name: "Q",
  character: "Galio",
  clip: "q",
  bone: "",
  release: 0.5,
  castEffect: "cast",
  projectileEffect: "projectile",
  flightDuration: 1,
  impactEffect: null,
  impactDuration: 0.2,
  target: [500, 0, 0],
};
const SKELETON: SkeletonModel = {
  joints: [
    {
      name: "root",
      hash: 1,
      parent: -1,
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      inverseBind: new Float32Array(new Matrix4().elements),
    },
  ],
  influences: new Uint32Array([0]),
};

function sounding(soundOnCreate: string, soundPersistent: string | null = null): SystemModel {
  return {
    ...emptySystem("0x1"),
    sounds: { ...NO_SOUNDS, soundOnCreate, soundPersistent },
    emitters: [emitterOf(0)],
  };
}

const SYSTEMS: Record<string, SystemModel> = {
  cast: sounding("Play_cast"),
  projectile: sounding("Play_fly", "Play_whoosh"),
};

/* A frame of a twentieth places frame 4 at 0.2 s and frame 8 at 0.4 s. */
const CAST_CLIP: GraphClip = {
  name: "Spell1",
  hash: nameHash("Spell1"),
  class: "AtomicClipData",
  animation: { path: "spell1.anm", asset: null },
  track: null,
  mask: null,
  syncGroup: null,
  tickDuration: 0.05,
  events: [sound("Shout", "Play_shout", 4, false), sound("Grunt", "Play_grunt", 8, true)],
  children: [],
} as unknown as GraphClip;

function sound(name: string, sound: string, startFrame: number, kill: boolean): ClipEvent {
  return {
    name,
    hash: nameHash(name),
    class: "SoundEventData",
    startFrame,
    endFrame: null,
    kind: {
      kind: "sound",
      name: sound,
      isLoop: true,
      isKill: kill,
      skipIfPastEnd: false,
      conditionTransition: 1,
    },
  };
}

const CLIP_END = 0.6;
const CAST_CUES = soundCues(timedSteps([CAST_CLIP], [CLIP_END], [null]));

function resolvedSteps(): ResolvedStep[] {
  const pose = oncePose(createPose(SKELETON, null));
  return abilitySteps(RECIPE, pose, 1).map((step) => ({ ...step, system: SYSTEMS[step.key] }));
}

/** Plays the ability scene, recording each call as `<seconds> play <key> <name>` or `stop`. */
function scene() {
  const clock = createSceneClock();
  const calls: string[] = [];
  const stamp = () => clock.time.toFixed(2);
  const output: SoundOutput = {
    play: (cue: SoundCue) => calls.push(`${stamp()} play ${cue.key} ${cue.name}`),
    stop: (key: string) => calls.push(`${stamp()} stop ${key}`),
  };
  const instances = resolvedSteps().map(abilityInstance);
  const sound = createAbilitySound(output, { cues: CAST_CUES, end: CLIP_END });
  const tick = () =>
    sound.follow(
      clock,
      instances.map((instance) => ({
        step: instance.step,
        events: instance.sample(clock.time),
      })),
    );
  const play = (seconds: number) => {
    for (let at = 0; at < Math.round(seconds / FLIGHT_STEP); at += 1) {
      clock.advance(FLIGHT_STEP);
      tick();
    }
  };
  tick();
  return { clock, calls, tick, play };
}

const plays = (calls: readonly string[]) => calls.filter((call) => call.includes(" play "));

describe("abilitySoundCues", () => {
  it("places the cast clip's cues at their clip times and a step's cues at the step's start", () => {
    const cues = abilitySoundCues(CAST_CUES, resolvedSteps());

    expect(cues.map((cue) => [cue.key, cue.name, cue.at])).toEqual([
      [`0:${nameHash("Shout")}`, "Play_shout", 0.2],
      [`0:${nameHash("Grunt")}`, "Play_grunt", 0.4],
      ["cast/soundOnCreateDefault", "Play_cast", 0],
      ["projectile/soundOnCreateDefault", "Play_fly", 0.5],
      ["projectile/soundPersistentDefault", "Play_whoosh", 0.5],
    ]);
  });
});

describe("createAbilitySound", () => {
  it("plays the cast clip's events on the scene clock and each effect at its step's start", () => {
    const { calls, play } = scene();

    play(0.6);

    expect(plays(calls)).toEqual([
      "0.02 play cast/soundOnCreateDefault Play_cast",
      `0.22 play 0:${nameHash("Shout")} Play_shout`,
      `0.42 play 0:${nameHash("Grunt")} Play_grunt`,
      "0.52 play projectile/soundOnCreateDefault Play_fly",
      "0.52 play projectile/soundPersistentDefault Play_whoosh",
    ]);
  });

  it("stops the cast clip's kill sounds where the clip ends", () => {
    const { calls, play } = scene();

    play(0.7);

    expect(calls).toContain(`0.60 stop 0:${nameHash("Grunt")}`);
    expect(calls).not.toContain(`0.60 stop 0:${nameHash("Shout")}`);
  });

  it("stops every sound and fires nothing on a seek", () => {
    const { clock, calls, tick, play } = scene();
    play(0.6);
    const played = calls.length;

    clock.seek(1.2);
    tick();
    play(0.3);

    const after = calls.slice(played);
    expect(plays(after)).toEqual([]);
    expect(after).toEqual(
      expect.arrayContaining([
        "1.20 stop cast/soundOnCreateDefault",
        `1.20 stop 0:${nameHash("Shout")}`,
        "1.20 stop projectile/soundPersistentDefault",
      ]),
    );
  });

  it("fires every sound again after a restart", () => {
    const { clock, calls, tick, play } = scene();
    play(0.6);
    const first = plays(calls);

    clock.restart();
    tick();
    const replayed = calls.length;
    play(0.6);

    expect(plays(calls.slice(replayed))).toEqual(first);
  });
});
