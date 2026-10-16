import { describe, expect, it } from "vitest";

import type { MissileMovement, MissileSpell } from "@/lib/tauri";

import { emitterOf, flat } from "../../simulation/__tests__/emitterFixture";
import { autoRig, autoRigKey, beamReach } from "../autoRig";
import { TRAIL_MODE, TRAIL_SMOOTHING } from "../enums";
import { flightOf } from "../missileSpec";
import type { EmitterModel, SystemModel, TrailModel } from "../model";
import { FLIGHT_HEIGHT, GROUND_RIG, missileMotion, withCarrier, withPlayback } from "../rig";
import { emptySystem } from "../systemModel";

const RIBBON: TrailModel = {
  mode: TRAIL_MODE.default,
  smoothing: TRAIL_SMOOTHING.off,
  maxAddedPerFrame: 0,
  tiling: flat(0, 0),
  cutoff: 0,
};

function systemOf(...emitters: EmitterModel[]): SystemModel {
  return { ...emptySystem("0x1"), emitters };
}

/** A spell named `name` whose missile moves by `movement`, every other field omitted. */
function spellOf(
  name: string,
  movement: MissileMovement,
  written: Partial<Pick<MissileSpell, "range" | "missileSpeed">> = {},
): MissileSpell {
  return {
    objectHash: "0x00000001",
    path: name,
    name,
    range: written.range ?? null,
    missileSpeed: written.missileSpeed ?? null,
    missile: {
      movement,
      startDelay: null,
      startBone: null,
      targetBone: null,
      targetHeight: null,
      initialTargetHeight: null,
      heightOffsetAtEnd: null,
      height: null,
      facing: null,
    },
  };
}

describe("autoRig", () => {
  it("stands a system that ends on the ground and replays it", () => {
    const { rig, spell } = autoRig(systemOf(emitterOf(0, { lifetime: 1 })));

    expect(rig.motion.kind).toBe("still");
    expect(rig.height).toBe(0);
    expect(rig.life).toBe("loop");
    expect(spell).toBeNull();
  });

  it("plays a system with an emitter that never stops continuously", () => {
    const { rig } = autoRig(
      systemOf(emitterOf(0, { lifetime: 1 }), emitterOf(1, { lifetime: null })),
    );

    expect(rig.life).toBe("continuous");
  });

  it("returns a replayed straight missile if the system draws a trail", () => {
    const { rig, spell } = autoRig(systemOf(emitterOf(0, { lifetime: null, trail: RIBBON })));

    expect(rig).toEqual(withPlayback(withCarrier(GROUND_RIG, "missile"), "replay"));
    expect(rig.motion).toMatchObject({ flight: { movement: { kind: "fixedSpeed" } } });
    expect(spell).toBeNull();
  });

  it("reads nothing off a disabled emitter", () => {
    const { rig } = autoRig(
      systemOf(emitterOf(0, { lifetime: 1 }), emitterOf(1, { lifetime: null, disabled: true })),
    );

    expect(rig.life).toBe("loop");
  });

  it("stands a system not yet read on the ground", () => {
    expect(autoRigKey(autoRig(null))).toBe("still:loop::");
  });

  it("returns the flight of the first spell whose missile can be simulated, and its name", () => {
    const spinning = spellOf("Q/Missile", { kind: "unsupported", class_hash: "0x2" });
    const flying = spellOf("W/Missile", { kind: "fixedSpeed", speed: 1200 });
    const picked = autoRig(systemOf(emitterOf(0, { lifetime: 1 })), [spinning, flying]);

    expect(picked.rig).toEqual({
      motion: missileMotion(flightOf(flying.missile)!),
      life: "loop",
      height: FLIGHT_HEIGHT,
    });
    expect(picked.spell).toBe("W/Missile");
    expect(autoRigKey(picked)).toBe("missile:loop::W/Missile");
  });

  it("flies a spell's missile over its cast range at its missileSpeed if the movement writes no speed", () => {
    const spell = spellOf(
      "Crit/Missile",
      { kind: "fixedSpeed", speed: null },
      { range: 600, missileSpeed: 2000 },
    );
    const { rig } = autoRig(systemOf(emitterOf(0, { lifetime: 1 })), [spell]);

    expect(rig.motion).toMatchObject({
      from: [-300, 0, 0],
      to: [300, 0, 0],
      flight: { movement: { kind: "fixedSpeed", speed: 2000 } },
    });
  });

  it("returns the system's own rig if no spell's missile can be simulated", () => {
    const missing = spellOf("Q/Missile", { kind: "missing" });

    expect(autoRig(systemOf(emitterOf(0, { lifetime: 1 })), [missing])).toEqual({
      rig: { ...GROUND_RIG, life: "loop", stopAt: null, joints: null },
      spell: null,
    });
  });

  it("aims a beam system at the farthest emitter position on its +Z axis", () => {
    const beam = emitterOf(0, { lifetime: 1, beam: {} as EmitterModel["beam"] });
    const end = emitterOf(1, { lifetime: 1, emitterPosition: flat(0, 0, 1330) });
    const near = emitterOf(2, { lifetime: 1, emitterPosition: flat(0, 0, 400) });
    const aside = emitterOf(3, { lifetime: 1, emitterPosition: flat(300, 0, 2000) });
    const picked = autoRig(systemOf(beam, end, near, aside));

    expect(picked.rig.motion).toEqual({ kind: "still", target: [0, 0, 1330] });
    expect(autoRigKey(picked)).toBe("still:loop:0,0,1330:");
  });

  it("leaves the target unset if no emitter draws a beam", () => {
    const end = emitterOf(0, { lifetime: 1, emitterPosition: flat(0, 0, 1330) });

    expect(beamReach([end])).toBeNull();
    expect(autoRig(systemOf(end)).rig.motion).toEqual({ kind: "still" });
  });

  it("leaves the target unset if every position is closer than SHORTEST_REACH", () => {
    const beam = emitterOf(0, { beam: {} as EmitterModel["beam"] });
    const close = emitterOf(1, { emitterPosition: flat(0, 0, 50) });

    expect(beamReach([beam, close])).toBeNull();
  });
});
