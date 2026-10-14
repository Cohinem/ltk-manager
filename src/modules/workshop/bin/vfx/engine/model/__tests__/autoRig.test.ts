import { describe, expect, it } from "vitest";

import { emitterOf, flat } from "../../simulation/__tests__/emitterFixture";
import { autoRig, autoRigKey, beamReach } from "../autoRig";
import { TRAIL_MODE, TRAIL_SMOOTHING } from "../enums";
import type { EmitterModel, SystemModel, TrailModel } from "../model";
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

describe("autoRig", () => {
  it("stands a system that ends on the ground and replays it", () => {
    const rig = autoRig(systemOf(emitterOf(0, { lifetime: 1 })));

    expect(rig.motion.kind).toBe("still");
    expect(rig.height).toBe(0);
    expect(rig.life).toBe("loop");
  });

  it("plays a system with an emitter that never stops continuously", () => {
    const rig = autoRig(systemOf(emitterOf(0, { lifetime: 1 }), emitterOf(1, { lifetime: null })));

    expect(rig.life).toBe("continuous");
  });

  it("circles a system that draws a trail, so the ribbon has travel", () => {
    const rig = autoRig(systemOf(emitterOf(0, { lifetime: 1, trail: RIBBON })));

    expect(rig.motion.kind).toBe("orbit");
    expect(rig.life).toBe("loop");
  });

  it("reads nothing off a disabled emitter", () => {
    const rig = autoRig(
      systemOf(emitterOf(0, { lifetime: 1 }), emitterOf(1, { lifetime: null, disabled: true })),
    );

    expect(rig.life).toBe("loop");
  });

  it("stands a system not yet read on the ground", () => {
    expect(autoRigKey(autoRig(null))).toBe("still:loop:");
  });

  it("aims a beam system at the farthest emitter position on its +Z axis", () => {
    const beam = emitterOf(0, { lifetime: 1, beam: {} as EmitterModel["beam"] });
    const end = emitterOf(1, { lifetime: 1, emitterPosition: flat(0, 0, 1330) });
    const near = emitterOf(2, { lifetime: 1, emitterPosition: flat(0, 0, 400) });
    const aside = emitterOf(3, { lifetime: 1, emitterPosition: flat(300, 0, 2000) });
    const rig = autoRig(systemOf(beam, end, near, aside));

    expect(rig.motion).toEqual({ kind: "still", target: [0, 0, 1330] });
    expect(autoRigKey(rig)).toBe("still:loop:0,0,1330");
  });

  it("leaves the target unset if no emitter draws a beam", () => {
    const end = emitterOf(0, { lifetime: 1, emitterPosition: flat(0, 0, 1330) });

    expect(beamReach([end])).toBeNull();
    expect(autoRig(systemOf(end)).motion).toEqual({ kind: "still" });
  });

  it("leaves the target unset if every position is closer than SHORTEST_REACH", () => {
    const beam = emitterOf(0, { beam: {} as EmitterModel["beam"] });
    const close = emitterOf(1, { emitterPosition: flat(0, 0, 50) });

    expect(beamReach([beam, close])).toBeNull();
  });
});
