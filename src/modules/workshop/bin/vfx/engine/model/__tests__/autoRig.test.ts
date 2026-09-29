import { describe, expect, it } from "vitest";

import { emitterOf, flat } from "../../simulation/__tests__/emitterFixture";
import { autoRig, autoRigKey } from "../autoRig";
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
    expect(autoRigKey(autoRig(null))).toBe("still:loop");
  });
});
