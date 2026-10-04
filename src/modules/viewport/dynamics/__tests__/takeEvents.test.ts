import { describe, expect, it } from "vitest";

import type { DynamicsModel } from "../model";
import { buildDynamics, type DynamicsCues, NO_CUES, type OrientationCue } from "../take";
import { AIMED, bake, bindPose, motion, parentsOf, TAILED, yawAt } from "./fixtures";

const PARENTS = parentsOf(TAILED);

const EMPTY: DynamicsModel = {
  chains: [],
  springs: [],
  conforms: [],
  orientations: [],
};

/** The pauldron's yaw at each of `frames`, baked under a unit that stands with `cue` on the orientation. */
function aimedOver(
  cue: OrientationCue,
  frames: readonly number[],
  options: { duration?: number; rate?: number; warmup?: number } = {},
): number[] {
  const { duration = 1, rate = 10, warmup = 0 } = options;
  const rig = buildDynamics({ ...EMPTY, orientations: [AIMED] }, TAILED, PARENTS, 1);
  const cues: DynamicsCues = { ...NO_CUES, orientations: [cue] };
  const take = bake(rig, bindPose(TAILED, duration), motion({}, duration), { rate, warmup, cues });

  return frames.map((frame) => yawAt(take, frame));
}

describe("bake over the events of a clip", () => {
  /** The unit turns a quarter a second where it stands. */
  const turning = () => motion({ kind: "custom", speed: 0, turnRate: 90 });

  it("holds a locked joint's facing over the event with no modifier of the skin behind it", () => {
    const rig = buildDynamics(EMPTY, TAILED, PARENTS, 1);

    const take = bake(rig, bindPose(TAILED, 1), turning(), {
      rate: 10,
      warmup: 0,
      cues: {
        ...NO_CUES,
        locks: [{ at: 0.25, until: 0.65, joint: 3, blendOut: 0 }],
      },
    });

    expect(Array.from(take.slots)).toEqual([3]);
    /* The lock takes the unit's facing on the step it starts, and lets go the step after it ends. */
    expect([2, 3, 4, 7, 8].map((frame) => yawAt(take, frame))).toEqual([0, 0, -9, -36, 0]);
  });

  it("turns an orientation on over a blend event and eases it back", () => {
    const cue = { at: 0.25, until: 0.55, blendFrom: 0, blendTo: 0.2 };

    expect(aimedOver(cue, [1, 3, 6, 7])).toEqual([0, -90, -45, 0]);
  });

  it("crosses an event that stands on a step of a later pass once", () => {
    /* A clip of ten frames at thirty a second, with the event on its third and sixth. */
    const cue = { at: 3 / 30, until: 6 / 30, blendFrom: 0, blendTo: 0 };
    const frames = Array.from({ length: 10 }, (_, frame) => frame);

    const turned = aimedOver(cue, frames, { duration: 10 / 30, rate: 30, warmup: 2 });

    expect(turned.filter((yaw) => yaw === -90)).toHaveLength(3);
    expect([turned[1], turned[5], turned[8]]).toEqual([0, -90, 0]);
  });

  it("starts an event at the start of the pass once for each pass", () => {
    const cue = { at: 0, until: null, blendFrom: 0.5, blendTo: 0 };

    /* The blend runs on from the seam, three degrees a step. */
    expect(aimedOver(cue, [0, 1, 2], { duration: 6, rate: 60, warmup: 2 })).toEqual([-3, -6, -9]);
  });

  it("ends an event that holds to the end of the pass at the seam", () => {
    const cue = { at: 0.75, until: null, blendFrom: 0, blendTo: 0 };

    expect(aimedOver(cue, [0, 7, 8, 9], { warmup: 1 })).toEqual([0, 0, -90, -90]);
  });

  it("starts and then ends an event that one step holds whole", () => {
    const cue = { at: 0.22, until: 0.28, blendFrom: 0, blendTo: 0 };

    expect(aimedOver(cue, [2, 3, 4, 9])).toEqual([0, 0, 0, 0]);
  });

  it("leaves out an event that starts past the end of the pass", () => {
    const cue = { at: 1.5, until: null, blendFrom: 0, blendTo: 0 };

    expect(aimedOver(cue, [0, 5, 9], { warmup: 2 })).toEqual([0, 0, 0]);
  });

  it("takes an event that runs past the end of the pass to end with the pass", () => {
    const cue = { at: 0.75, until: 1.5, blendFrom: 0, blendTo: 0 };

    expect(aimedOver(cue, [0, 8], { warmup: 2 })).toEqual([0, -90]);
  });
});
