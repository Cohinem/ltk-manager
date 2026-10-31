import { describe, expect, it } from "vitest";

import type { SoundCue } from "../../../../../audio/utils/soundCue";
import type { SoundOutput } from "../../../../../audio/utils/soundFollower";
import type { EmitterModel, SystemModel } from "../../../engine/model/model";
import type { RigModel } from "../../../engine/model/rig";
import { emptySystem, NO_SOUNDS } from "../../../engine/model/systemModel";
import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
import { createDriver } from "../../../engine/simulation/driver";
import { createRunSound, runSoundCues } from "../runSound";

/** An output that records each call as `play <key> <name>` or `stop <key>`. */
function recording(): SoundOutput & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    play: (cue: SoundCue) => calls.push(`play ${cue.key} ${cue.name}`),
    stop: (key: string) => calls.push(`stop ${key}`),
  };
}

function sounding(over: Partial<SystemModel>): SystemModel {
  return { ...emptySystem("0x1"), ...over };
}

/** Runs `system` on `rig` for `frames` sixtieths of a second, with its sound heard by `output`. */
function play(system: SystemModel, frames: number, rig?: RigModel, output = recording()) {
  const driver = createDriver(3);
  driver.swap(system);
  if (rig !== undefined) driver.steer(rig);
  const sound = createRunSound(output, "fx/");
  for (let at = 0; at < frames; at += 1) sound.hear(system, driver.advance(1 / 60));
  return { output, sound, driver };
}

const ONCE: RigModel = { motion: { kind: "still" }, life: "once", height: 0 };

const HUM: Partial<SystemModel> = {
  sounds: { ...NO_SOUNDS, soundOnCreate: "Play_cast", soundPersistent: "Play_hum" },
};

function spark(over: Partial<EmitterModel> = {}): EmitterModel {
  return emitterOf(0, {
    rate: flat(10),
    audio: { soundOnCreate: "Play_spark", soundPersistent: "Play_fizz" },
    ...over,
  });
}

describe("createRunSound", () => {
  it("plays the system's sounds at its start and stops the persistent one at its stop", () => {
    const { output } = play(sounding({ ...HUM, emitters: [emitterOf(0)] }), 60, {
      ...ONCE,
      stopAt: 0.5,
    });

    expect(output.calls).toEqual([
      "play fx/soundOnCreateDefault Play_cast",
      "play fx/soundPersistentDefault Play_hum",
      "stop fx/soundPersistentDefault",
    ]);
  });

  it("plays an emitter's sounds at its first emission and stops the persistent one at its end", () => {
    const { output } = play(sounding({ emitters: [spark({ lifetime: 0.2 })] }), 30, ONCE);

    expect(output.calls).toEqual([
      "play fx/0:SoundOnCreate Play_spark",
      "play fx/0:SoundPersistent Play_fizz",
      "stop fx/0:SoundPersistent",
    ]);
  });

  it("keeps an emitter's persistent sound past its end without soundsEndOnEmitterEnd", () => {
    const system = sounding({ emitters: [spark({ lifetime: 0.2 })], soundsEndOnEmitterEnd: false });
    const { output } = play(system, 30, ONCE);

    expect(output.calls).not.toContain("stop fx/0:SoundPersistent");
  });

  it("stops every sound of the pass before a replay starts the system again", () => {
    const emitter = spark({ lifetime: 0.2, particleLifetime: flat(0.3) });
    const system = sounding({ ...HUM, emitters: [emitter] });
    const { calls } = play(system, 120, { ...ONCE, life: "loop" }).output;
    const replay = calls.indexOf("play fx/soundOnCreateDefault Play_cast", 1);

    expect(replay).toBeGreaterThan(0);
    expect(calls.slice(replay - 3, replay).sort()).toEqual([
      "stop fx/0:SoundOnCreate",
      "stop fx/soundOnCreateDefault",
      "stop fx/soundPersistentDefault",
    ]);
  });

  it("stops every sound it started on stop", () => {
    const { output, sound } = play(sounding({ ...HUM, emitters: [spark()] }), 10, ONCE);
    output.calls.length = 0;

    sound.stop();

    expect(output.calls.sort()).toEqual([
      "stop fx/0:SoundOnCreate",
      "stop fx/0:SoundPersistent",
      "stop fx/soundOnCreateDefault",
      "stop fx/soundPersistentDefault",
    ]);
  });

  it("plays a child system's on-create sounds at its birth", () => {
    const child = sounding({
      sounds: { ...NO_SOUNDS, soundOnCreate: "Play_ember", soundPersistent: "Play_glow" },
      emitters: [emitterOf(0, { rate: flat(30), particleLifetime: flat(0.5) })],
    });
    const parent = emitterOf(0, {
      rate: flat(1),
      lifetime: 0.1,
      particleLifetime: flat(1),
      childSet: {
        children: [child],
        bones: [],
        probability: flat(0),
        onDeath: false,
        inheritance: null,
      },
    });
    const { output } = play(sounding({ emitters: [parent] }), 30, ONCE);

    expect(output.calls).toEqual(["play fx/0.0/soundOnCreateDefault Play_ember"]);
  });
});

describe("runSoundCues", () => {
  it("lists every cue of the system and the on-create cues of each child under it", () => {
    const child = sounding({
      sounds: { ...NO_SOUNDS, soundOnCreate: "Play_ember", soundPersistent: "Play_glow" },
    });
    const parent = emitterOf(0, {
      audio: { soundOnCreate: null, soundPersistent: "Play_fizz" },
      childSet: {
        children: [child],
        bones: [],
        probability: flat(0),
        onDeath: false,
        inheritance: null,
      },
    });

    const names = runSoundCues(sounding({ ...HUM, emitters: [parent] })).map((cue) => cue.name);

    expect(names.sort()).toEqual(["Play_cast", "Play_ember", "Play_fizz", "Play_hum"]);
  });

  it("stops at the nesting cap for a system that spawns itself", () => {
    const set = {
      children: [] as SystemModel[],
      bones: [],
      probability: flat(0),
      onDeath: false,
      inheritance: null,
    };
    const looped = sounding({ ...HUM, emitters: [emitterOf(0, { childSet: set })] });
    set.children.push(looped);

    expect(runSoundCues(looped).length).toBeGreaterThan(0);
  });
});
