import { describe, expect, it } from "vitest";

import { createLive } from "../live";
import { yawOf } from "../math";
import type { DynamicsModel } from "../model";
import { buildDynamics, type DynamicsCues, NO_CUES, type OrientationCue } from "../take";
import { LOCAL_FLOATS } from "../world";
import {
  AIMED,
  bindPose,
  chain,
  constant,
  group,
  joint,
  parentsOf,
  properties,
  rounded,
  skeletonOf,
  TAILED,
} from "./fixtures";

/** A root, and a tail of two joints hanging straight down, where gravity leaves it. */
const PLUMB = skeletonOf(
  joint("Root", -1, [0, 100, 0]),
  joint("Tail1", 0, [0, -10, 0]),
  joint("Tail2", 1, [0, -10, 0]),
);

/** The same tail standing out behind the root, which gravity pulls down. */
const BEHIND = skeletonOf(
  joint("Root", -1, [0, 100, 0]),
  joint("Tail1", 0, [0, 0, -10]),
  joint("Tail2", 1, [0, 0, -10]),
);

function tail(attraction: number): DynamicsModel {
  return {
    chains: [
      chain([
        group({
          trees: [{ root: 0, excluded: [] }],
          properties: properties({ damping: constant(0.2), attraction: constant(attraction) }),
        }),
      ]),
    ],
    springs: [],
    conforms: [],
    orientations: [],
  };
}

const RATE = 60;
const FRAME = 1 / RATE;
const ORIGIN = [0, 0, 0];

function live(skeleton = PLUMB, attraction = 0.5) {
  const rig = buildDynamics(tail(attraction), skeleton, parentsOf(skeleton), 1);
  return createLive(rig, bindPose(skeleton, 1), { rate: RATE });
}

/** The local rotation of the joint at `slot`. */
function turn(locals: Float32Array, slot: number): number[] {
  return rounded(locals.subarray(slot * LOCAL_FLOATS + 3, slot * LOCAL_FLOATS + 7), 3);
}

describe("createLive", () => {
  it("writes the joints the rig's modifiers move", () => {
    expect(Array.from(live().slots)).toEqual([1, 2]);
  });

  it("starts settled, and stays where it is while the unit stands still", () => {
    /* A pull this strong comes to rest well inside the second a simulation settles for. */
    const simulation = live(BEHIND, 0.9999);
    simulation.advance(0, FRAME, ORIGIN, 0);
    const first = turn(simulation.locals, 1);

    for (let frame = 0; frame < 120; frame += 1) simulation.advance(0, FRAME, ORIGIN, 0);

    /* Gravity has pulled the tail off the pose by the first frame, and no further after it. */
    expect(first.every(Number.isFinite)).toBe(true);
    expect(first).not.toEqual([0, 0, 0, 1]);
    expect(turn(simulation.locals, 1)).toEqual(first);
  });

  it("swings the tail when the unit is moved, and lets it settle back", () => {
    const simulation = live();
    simulation.advance(0, FRAME, ORIGIN, 0);
    const settled = turn(simulation.locals, 1);

    for (let frame = 1; frame <= 10; frame += 1) {
      simulation.advance(0, FRAME, [frame * 10, 0, 0], 0);
    }
    expect(turn(simulation.locals, 1)).not.toEqual(settled);

    for (let frame = 0; frame < 600; frame += 1) simulation.advance(0, FRAME, [100, 0, 0], 0);
    expect(turn(simulation.locals, 1)).toEqual(settled);
  });

  it("swings a tail that stands off the up axis when the unit is turned", () => {
    const simulation = live(BEHIND);
    simulation.advance(0, FRAME, ORIGIN, 0);
    /* The tip has no joint under it to point at, so the joint above it is the one that turns. */
    const settled = turn(simulation.locals, 1);

    for (let frame = 1; frame <= 10; frame += 1) {
      simulation.advance(0, FRAME, ORIGIN, frame * 0.3);
    }

    expect(turn(simulation.locals, 1)).not.toEqual(settled);
  });

  describe("with a conform", () => {
    /** A root with a tail of three joints running back along `-z`. */
    const tailed = skeletonOf(
      joint("Root", -1, [0, 100, 0]),
      joint("Tail1", 0, [0, 0, -10]),
      joint("Tail2", 1, [0, 0, -10]),
      joint("Tail3", 2, [0, 0, -10]),
    );
    const conform = (mask: readonly number[] | null): DynamicsModel => ({
      chains: [],
      springs: [],
      orientations: [],
      conforms: [
        {
          joints: [1, 2, 3],
          mask,
          maxBoneAngle: 65,
          damping: 10,
          frequency: 10,
          velMultiplier: -0.5,
          onlyInTurns: false,
          activationAngle: 0.5,
          activationDistance: 200,
          blendDistance: 400,
          extraChains: [],
        },
      ],
    });
    const STILL = [0, 0, 0, 1];
    /** An event over the seconds given, whose mask weighs every joint whole. */
    const whole = (at: number, until: number | null): DynamicsCues => ({
      ...NO_CUES,
      conforms: [{ at, until, mask: null, blendIn: 0, blendOut: 0 }],
    });
    /**
     * The tail's first joint after the unit is dragged across the tail for twenty frames
     * at each of `times`, one after another.
     */
    const dragged = (model: DynamicsModel, times: readonly number[], cues?: DynamicsCues) => {
      const rig = buildDynamics(model, tailed, parentsOf(tailed), 1);
      const simulation = createLive(rig, bindPose(tailed, 1), { rate: RATE, cues });
      simulation.advance(times[0], FRAME, ORIGIN, 0);

      let frame = 0;
      for (const time of times) {
        for (let step = 0; step < 20; step += 1) {
          frame += 1;
          simulation.advance(time, FRAME, [frame * 5, 0, 0], 0);
        }
      }
      return turn(simulation.locals, 1);
    };
    const MASKED = conform([0, 0, 0, 0]);

    it("turns the chain when the unit is dragged across it", () => {
      expect(dragged(conform(null), [0])).not.toEqual(STILL);
    });

    it("turns nothing under a mask that weighs every joint nothing", () => {
      expect(dragged(MASKED, [0])).toEqual(STILL);
    });

    it("takes the mask of an event that began before the simulation did", () => {
      expect(dragged(MASKED, [0.5], whole(0.2, null))).not.toEqual(STILL);
    });

    it("leaves the default mask in force before the event begins", () => {
      expect(dragged(MASKED, [0.1], whole(0.2, null))).toEqual(STILL);
    });

    it("ends an event that holds to the end of the pass when the pass starts over", () => {
      const cues = whole(0.75, null);

      expect(dragged(MASKED, [0.9], cues)).not.toEqual(STILL);
      /* A clock that folds its time reads the next pass as 0.05, and one that does not as 1.05. */
      expect(dragged(MASKED, [0.9, 0.05], cues)).toEqual(STILL);
      expect(dragged(MASKED, [0.9, 1.05], cues)).toEqual(STILL);
    });

    it("starts and then ends an event that one frame jumps whole", () => {
      expect(dragged(MASKED, [0.1, 0.95], whole(0.6, 0.9))).toEqual(STILL);
    });

    it("puts the events where the pass has them when the clip is sought back", () => {
      const cues = whole(0.6, 0.9);

      expect(dragged(MASKED, [0.5, 0.3], cues)).toEqual(STILL);
      expect(dragged(MASKED, [0.95, 0.7], cues)).not.toEqual(STILL);
    });
  });

  describe("with an orientation that an event blends in", () => {
    /** A simulation of the pauldron's orientation, which is a quarter turn back at full weight. */
    const aimed = (cue: OrientationCue) => {
      const model: DynamicsModel = { chains: [], springs: [], conforms: [], orientations: [AIMED] };
      const rig = buildDynamics(model, TAILED, parentsOf(TAILED), 1);
      const cues = { ...NO_CUES, orientations: [cue] };
      return createLive(rig, bindPose(TAILED, 1), { rate: RATE, cues });
    };
    /** How far the pauldron is turned about the up axis, in degrees. */
    const yaw = (simulation: ReturnType<typeof aimed>) => {
      const at = 3 * LOCAL_FLOATS + 3;
      return (yawOf(simulation.locals.subarray(at, at + 4)) * 180) / Math.PI;
    };

    it("blends an event that began before it by the time the pass has run since", () => {
      const simulation = aimed({ at: 0.2, until: null, blendFrom: 2, blendTo: 0 });

      simulation.advance(0.4, FRAME, ORIGIN, 0);

      /* A tenth of the blend has run, whatever the simulation took to settle. */
      expect(yaw(simulation)).toBeCloseTo(-9, 3);
    });

    it("puts a blend where the pass has it when the clip is sought back", () => {
      const simulation = aimed({ at: 0.1, until: 0.4, blendFrom: 1, blendTo: 0 });
      simulation.advance(0.5, FRAME, ORIGIN, 0);
      expect(yaw(simulation)).toBeCloseTo(0, 3);

      simulation.advance(0.3, FRAME, ORIGIN, 0);

      /* A fifth of the blend ran before the time sought, and the one step taken since. */
      expect(yaw(simulation)).toBeCloseTo(-90 * (0.2 + FRAME), 3);
    });
  });

  it("takes no step for less than a step of time, and a fifteenth of a second at most for a stalled frame", () => {
    const stalled = live();
    stalled.advance(0, FRAME, ORIGIN, 0);
    const settled = Array.from(stalled.locals);

    stalled.advance(0, FRAME / 4, [50, 0, 0], 0);
    expect(Array.from(stalled.locals)).toEqual(settled);

    const capped = live();
    capped.advance(0, FRAME, ORIGIN, 0);
    capped.advance(0, 4 * FRAME, [50, 0, 0], 0);
    const stepped = Array.from(capped.locals);
    expect(stepped).not.toEqual(settled);

    stalled.advance(0, 10, [50, 0, 0], 0);
    expect(Array.from(stalled.locals)).toEqual(stepped);
  });
});
