import { describe, expect, it } from "vitest";

import type { SystemModel } from "../../../engine/model/model";
import { emptySystem, NO_SOUNDS } from "../../../engine/model/systemModel";
import { emitterOf } from "../../../engine/simulation/__tests__/emitterFixture";
import { vfxSoundCues } from "../vfxSoundCues";

function sounding(over: Partial<SystemModel>): SystemModel {
  return { ...emptySystem("0x1"), ...over };
}

describe("vfxSoundCues", () => {
  it("returns no cues for a system and emitters that name no sound", () => {
    const cues = vfxSoundCues(sounding({ emitters: [emitterOf(0), emitterOf(1)] }));

    expect(cues).toEqual({ onCreate: [], persistent: [], emitters: [] });
  });

  it("returns a cue for each voice-over field beside the sound fields", () => {
    const cues = vfxSoundCues(
      sounding({
        sounds: {
          ...NO_SOUNDS,
          soundOnCreate: "Play_sfx_cast",
          voiceOverOnCreate: "Play_vo_cast",
          voiceOverPersistent: "Play_vo_hum",
        },
      }),
    );

    expect(cues.onCreate.map((cue) => [cue.name, cue.repeat])).toEqual([
      ["Play_sfx_cast", "once"],
      ["Play_vo_cast", "once"],
    ]);
    expect(cues.persistent.map((cue) => [cue.name, cue.repeat])).toEqual([["Play_vo_hum", "loop"]]);
  });

  it("carries the emitter path and gives every cue of the system its own key", () => {
    const system = sounding({
      sounds: { ...NO_SOUNDS, soundOnCreate: "Play_sfx_cast" },
      emitters: [
        emitterOf(0),
        emitterOf(1, {
          audio: { soundOnCreate: "Play_sfx_spark", soundPersistent: "Play_sfx_fizz" },
        }),
      ],
    });
    const cues = vfxSoundCues(system, "2.0");

    expect(cues.emitters).toHaveLength(1);
    const [spark] = cues.emitters;
    expect(spark.emitter).toBe(1);
    expect(spark.path).toBe("2.0/1");
    expect(spark.onCreate?.name).toBe("Play_sfx_spark");
    expect(spark.persistent?.repeat).toBe("loop");

    const keys = [cues.onCreate[0].key, spark.onCreate?.key, spark.persistent?.key];
    expect(new Set(keys).size).toBe(3);
    expect(keys.every((key) => key?.startsWith("2.0/"))).toBe(true);
  });
});
