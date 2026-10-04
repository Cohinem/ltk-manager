import { describe, expect, it } from "vitest";

import type { DynamicsModel, SpringModel } from "../model";
import { buildDynamics, createBake, sampleTakeInto, TAKE_FLOATS } from "../take";
import { bindLocals, LOCAL_FLOATS } from "../world";
import {
  bake,
  bindPose,
  chain,
  constant,
  group,
  HANGING,
  motion,
  parentsOf,
  properties,
  rounded,
  TAILED,
} from "./fixtures";

const PARENTS = parentsOf(TAILED);

const TAIL: DynamicsModel = {
  chains: [
    chain([
      group({
        trees: [{ root: 0, excluded: [3] }],
        properties: properties({
          damping: constant(0.2),
          attraction: constant(0.9),
        }),
      }),
    ]),
  ],
  springs: [],
  conforms: [],
  orientations: [],
};

function spring(over: Partial<SpringModel> = {}): SpringModel {
  return {
    joint: 3,
    name: null,
    mass: 0.1,
    stiffness: 2.5,
    damping: 1,
    doTranslation: true,
    doRotation: false,
    maxDistance: 0,
    maxAngle: 0,
    invert: false,
    defaultOn: true,
    ...over,
  };
}

describe("buildDynamics", () => {
  it("lists the joints a step writes: the free joints of a chain and a spring's joint", () => {
    const rig = buildDynamics(
      { ...TAIL, springs: [spring()], conforms: [], orientations: [] },
      TAILED,
      PARENTS,
      1,
    );

    expect(Array.from(rig.slots)).toEqual([1, 2, 3]);
  });

  it("passes over a spring whose joint the skeleton lacks", () => {
    const rig = buildDynamics(
      {
        chains: [],
        springs: [spring({ joint: -1 })],
        conforms: [],
        orientations: [],
      },
      TAILED,
      PARENTS,
      1,
    );

    expect(rig.springs).toEqual([]);
    expect(Array.from(rig.slots)).toEqual([]);
  });
});

describe("bake", () => {
  it("cuts the pass into a whole number of steps at the rate asked", () => {
    const rig = buildDynamics(TAIL, TAILED, PARENTS, 1);

    const take = bake(rig, bindPose(TAILED, 1.01), motion({}, 1.01), {
      rate: 60,
      warmup: 0,
    });

    expect(take.frames).toBe(61);
    expect(take.duration).toBe(1.01);
    expect(take.locals.length).toBe(61 * 2 * TAKE_FLOATS);
  });

  it("gives a pose of no duration a pass of its own to settle over", () => {
    const rig = buildDynamics(TAIL, TAILED, PARENTS, 1);

    const take = bake(rig, bindPose(TAILED), motion({}, 2), {
      rate: 30,
      warmup: 0,
    });

    expect(take.duration).toBe(2);
    expect(take.frames).toBe(60);
  });

  it("is a function of what it is given: a second bake of one rig answers the same pass", () => {
    const model: DynamicsModel = {
      ...TAIL,
      springs: [spring({ doRotation: true })],
      conforms: [
        {
          joints: [1, 2],
          mask: null,
          maxBoneAngle: 65,
          damping: 10,
          frequency: 10,
          velMultiplier: -0.5,
          onlyInTurns: true,
          activationAngle: 0.5,
          activationDistance: 200,
          blendDistance: 400,
          extraChains: [],
        },
      ],
    };
    const rig = buildDynamics(model, TAILED, PARENTS, 1);
    const circling = motion({ kind: "custom", speed: 100, turnRate: 90 });
    /* The lock is still easing out when the pass ends, so the state a bake leaves is not a rest. */
    const options = {
      rate: 60,
      warmup: 1,
      cues: {
        chains: [{ at: 0.2, until: 0.6, blendFrom: 0.1, blendTo: 0.1 }],
        springs: [{ at: 0.3, until: 0.7, spring: null }],
        conforms: [{ at: 0.1, until: 0.5, mask: [0, 0, 0, 0], blendIn: 0.1, blendOut: 0.1 }],
        locks: [{ at: 0.4, until: 0.8, joint: 3, blendOut: 0.5 }],
        orientations: [],
      },
    };

    const first = bake(rig, bindPose(TAILED, 1), circling, options);
    const second = bake(rig, bindPose(TAILED, 1), circling, options);

    expect(Array.from(first.locals).every(Number.isFinite)).toBe(true);
    expect(Array.from(second.locals)).toEqual(Array.from(first.locals));
  });

  it("settles a tail so the pass ends where it starts", () => {
    const rig = buildDynamics(TAIL, TAILED, PARENTS, 1);

    const take = bake(rig, bindPose(TAILED, 1), motion({}), {
      rate: 60,
      warmup: 6,
    });

    const stride = 2 * TAKE_FLOATS;
    const first = take.locals.subarray(0, stride);
    const last = take.locals.subarray((take.frames - 1) * stride, take.frames * stride);
    expect(rounded(last, 3)).toEqual(rounded(first, 3));
    /* Gravity holds the tail under where the animation puts it. */
    expect(first[1]).toBeLessThan(-0.05);
  });

  it("trails a hanging tail behind a steady run by its damping, and not at all without one", () => {
    const hanging = (damping: number): DynamicsModel => ({
      chains: [
        chain([
          group({
            trees: [{ root: 0, excluded: [3] }],
            properties: properties({
              damping: constant(damping),
              attraction: constant(0.5),
            }),
          }),
        ]),
      ],
      springs: [],
      conforms: [],
      orientations: [],
    });
    const options = { rate: 60, warmup: 6 };
    const pass = (damping: number, kind: "stand" | "run") =>
      bake(
        buildDynamics(hanging(damping), HANGING, parentsOf(HANGING), 1),
        bindPose(HANGING, 1),
        motion({ kind }),
        options,
      );

    /* The unit runs along `+z`, and what a step takes off the carried motion is left behind. */
    expect(rounded(pass(0.2, "stand").locals.subarray(0, 3), 3)).toEqual([0, -10, 0]);
    expect(pass(0.2, "run").locals[2]).toBeLessThan(-1);
    expect(pass(0, "run").locals[2]).toBeCloseTo(0, 1);
  });

  it("swings a hanging tail forward when a run stops", () => {
    const loose: DynamicsModel = {
      chains: [
        chain([
          group({
            trees: [{ root: 0, excluded: [3] }],
            properties: properties({
              damping: constant(0.02),
              attraction: constant(0.2),
            }),
          }),
        ]),
      ],
      springs: [],
      conforms: [],
      orientations: [],
    };
    const rig = buildDynamics(loose, HANGING, parentsOf(HANGING), 1);

    const take = bake(rig, bindPose(HANGING, 2), motion({ kind: "runAndStop" }, 2), {
      rate: 60,
      warmup: 2,
    });

    const stride = 2 * TAKE_FLOATS;
    const forward = (frame: number) => take.locals[frame * stride + 2];
    const stop = take.frames / 2;
    const after = Array.from({ length: 30 }, (_, at) => forward(stop + at));
    expect(forward(stop - 1)).toBeLessThan(0);
    expect(Math.max(...after)).toBeGreaterThan(1);
  });

  it("runs a few steps at a time and answers the take once the last is done", () => {
    const rig = buildDynamics(TAIL, TAILED, PARENTS, 1);
    const whole = bake(rig, bindPose(TAILED, 1), motion({}), {
      rate: 60,
      warmup: 1,
    });

    const baking = createBake(rig, bindPose(TAILED, 1), motion({}), {
      rate: 60,
      warmup: 1,
    });
    let take = baking.run(0);
    let runs = 1;
    while (take === null) {
      take = baking.run(0);
      runs += 1;
    }

    expect(baking.steps).toBe(120);
    expect(runs).toBe(121);
    expect(Array.from(take.locals)).toEqual(Array.from(whole.locals));
  });

  it("leaves the animation alone while a chain that is off by default has no event", () => {
    const off: DynamicsModel = {
      chains: [{ ...TAIL.chains[0], defaultOn: false }],
      springs: [],
      conforms: [],
      orientations: [],
    };
    const rig = buildDynamics(off, TAILED, PARENTS, 1);

    const take = bake(rig, bindPose(TAILED, 1), motion({}), {
      rate: 30,
      warmup: 1,
    });

    expect(rounded(take.locals.subarray(0, 7))).toEqual([0, 0, -10, 0, 0, 0, 1]);
  });

  it("turns a chain on over the span of a blend event and back off after it", () => {
    const off: DynamicsModel = {
      chains: [{ ...TAIL.chains[0], defaultOn: false }],
      springs: [],
      conforms: [],
      orientations: [],
    };
    const rig = buildDynamics(off, TAILED, PARENTS, 1);

    const take = bake(rig, bindPose(TAILED, 1), motion({}), {
      rate: 30,
      warmup: 1,
      cues: {
        chains: [{ at: 0.25, until: 0.5, blendFrom: 0, blendTo: 0 }],
        springs: [],
        conforms: [],
        locks: [],
        orientations: [],
      },
    });

    const stride = 2 * TAKE_FLOATS;
    const drop = (frame: number) => take.locals[frame * stride + 1];
    expect(drop(3)).toBe(0);
    expect(drop(12)).toBeLessThan(-0.01);
    expect(drop(20)).toBe(0);
  });

  it("stands a chain back on the pose when an event turns it on again", () => {
    const off: DynamicsModel = {
      chains: [
        chain(
          [
            group({
              trees: [{ root: 0, excluded: [3] }],
              properties: properties({ stretch: constant(1) }),
            }),
          ],
          { defaultOn: false, gravityScale: 0 },
        ),
      ],
      springs: [],
      conforms: [],
      orientations: [],
    };
    const rig = buildDynamics(off, TAILED, PARENTS, 1);

    const take = bake(rig, bindPose(TAILED, 1), motion({ kind: "run" }), {
      rate: 10,
      warmup: 1,
      cues: {
        chains: [{ at: 0.25, until: 0.45, blendFrom: 0, blendTo: 0 }],
        springs: [],
        conforms: [],
        locks: [],
        orientations: [],
      },
    });

    /* With nothing to pull it, the tail a pass ago would lie a pass of running behind. */
    const stride = 2 * TAKE_FLOATS;
    expect(rounded(take.locals.subarray(3 * stride, 3 * stride + 3))).toEqual([0, 0, -10]);
  });

  it("trails a spring's joint behind a run that starts, and rests it on a stand", () => {
    const sprung: DynamicsModel = {
      chains: [],
      springs: [spring()],
      conforms: [],
      orientations: [],
    };
    const rig = buildDynamics(sprung, TAILED, PARENTS, 1);

    const standing = bake(rig, bindPose(TAILED, 2), motion({}, 2), {
      rate: 60,
      warmup: 1,
    });
    const stopping = bake(rig, bindPose(TAILED, 2), motion({ kind: "runAndStop" }, 2), {
      rate: 60,
      warmup: 1,
    });

    const along = (take: typeof standing, frame: number) => take.locals[frame * TAKE_FLOATS + 2];
    expect(along(standing, 30)).toBe(0);
    expect(along(stopping, 5)).toBeLessThan(-1);
  });

  it("holds a spring's offset inside its limit", () => {
    const sprung: DynamicsModel = {
      chains: [],
      springs: [spring({ maxDistance: 3 })],
      conforms: [],
      orientations: [],
    };
    const rig = buildDynamics(sprung, TAILED, PARENTS, 1);

    const take = bake(rig, bindPose(TAILED, 2), motion({ kind: "runAndStop" }, 2), {
      rate: 60,
      warmup: 1,
    });

    const reach = Array.from({ length: take.frames }, (_, frame) =>
      Math.hypot(
        take.locals[frame * TAKE_FLOATS] - 20,
        take.locals[frame * TAKE_FLOATS + 1],
        take.locals[frame * TAKE_FLOATS + 2],
      ),
    );
    expect(Math.max(...reach)).toBeLessThanOrEqual(3);
    expect(Math.max(...reach)).toBeGreaterThan(2.9);
  });
});

describe("sampleTakeInto", () => {
  const take = {
    frames: 2,
    duration: 1,
    slots: Int32Array.of(1),
    locals: Float32Array.of(0, 0, -10, 0, 0, 0, 1, 0, -4, -10, 0, 0, 0, 1),
  };

  it("writes the joints the take holds between two frames and leaves the rest", () => {
    const locals = bindLocals(TAILED);

    sampleTakeInto(take, 0.25, locals);

    expect(rounded(locals.subarray(LOCAL_FLOATS, LOCAL_FLOATS + 3))).toEqual([0, -2, -10]);
    expect(rounded(locals.subarray(0, 3))).toEqual([0, 100, 0]);
    expect(rounded(locals.subarray(2 * LOCAL_FLOATS, 2 * LOCAL_FLOATS + 3))).toEqual([0, 0, -10]);
  });

  it("runs its last frame into its first", () => {
    const locals = bindLocals(TAILED);

    sampleTakeInto(take, 0.75, locals);
    expect(rounded(locals.subarray(LOCAL_FLOATS, LOCAL_FLOATS + 3))).toEqual([0, -2, -10]);

    sampleTakeInto(take, 3.5, locals);
    expect(rounded(locals.subarray(LOCAL_FLOATS, LOCAL_FLOATS + 3))).toEqual([0, -4, -10]);
  });
});
