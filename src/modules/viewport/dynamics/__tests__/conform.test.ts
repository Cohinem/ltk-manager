import { describe, expect, it } from "vitest";

import {
  advanceConformMask,
  blendConformTo,
  buildConform,
  conformJoints,
  stepConformInto,
} from "../conform";
import type { ConformModel } from "../model";
import {
  bindLocals,
  composeWorldInto,
  createRoot,
  createWorldPose,
  LOCAL_FLOATS,
  parentsFirst,
} from "../world";
import { joint, parentsOf, rounded, skeletonOf } from "./fixtures";

/** A root with a tail of three joints running back along `-z`, and a fin beside the tail. */
const TAILED = skeletonOf(
  joint("Root", -1, [0, 100, 0]),
  joint("Tail1", 0, [0, 0, -10]),
  joint("Tail2", 1, [0, 0, -10]),
  joint("Tail3", 2, [0, 0, -10]),
  joint("Fin", 0, [5, 0, -10]),
);
const PARENTS = parentsOf(TAILED);
const ORDER = parentsFirst(PARENTS);
const BIND = bindLocals(TAILED);
const DT = 1 / 60;

function conform(over: Partial<ConformModel> = {}): ConformModel {
  return {
    joints: [1, 2, 3],
    mask: null,
    maxBoneAngle: 65,
    damping: 10,
    frequency: 10,
    velMultiplier: -0.5,
    onlyInTurns: false,
    activationAngle: 0.5,
    activationDistance: 200,
    blendDistance: 400,
    extraChains: [],
    ...over,
  };
}

/** `model` stepped once per place of `places`, each a unit's `x` and `z`, over the bind pose. */
function stepped(model: ConformModel, places: readonly (readonly [number, number])[]) {
  const rig = buildConform(model);
  const locals = new Float32Array(BIND.length);
  const world = createWorldPose(PARENTS.length);
  const root = createRoot();
  for (const [x, z] of places) {
    root.position[0] = x;
    root.position[2] = z;
    locals.set(BIND);
    composeWorldInto(world, locals, PARENTS, ORDER, root);
    stepConformInto(rig, world, PARENTS, root, DT, locals);
    advanceConformMask(rig, DT);
  }
  composeWorldInto(world, locals, PARENTS, ORDER, root);
  return { rig, locals, world, root };
}

/** A run along `+x` at 300 units a second, for `steps` steps. */
function run(steps: number): [number, number][] {
  return Array.from({ length: steps }, (_, at) => [at * 300 * DT, 0]);
}

/** A run up `+z`, along the tail, and then a turn to run along `+x`, across it. */
const CORNER: [number, number][] = [
  ...Array.from({ length: 10 }, (_, at): [number, number] => [0, at * 5]),
  ...Array.from({ length: 10 }, (_, at): [number, number] => [(at + 1) * 5, 45]),
];

/** How far the bone from `from` to `to` is turned off the way the bind pose points it, in degrees on the ground. */
function swing(world: ReturnType<typeof createWorldPose>, from: number, to: number): number {
  const x = world.positions[to * 3] - world.positions[from * 3];
  const z = world.positions[to * 3 + 2] - world.positions[from * 3 + 2];
  return (Math.atan2(x, -z) * 180) / Math.PI;
}

describe("conformJoints", () => {
  it("lists the chain from its starting joint down to its ending joint", () => {
    expect(conformJoints(PARENTS, 1, 3)).toEqual([1, 2, 3]);
  });

  it("runs up to the root where the start is not above the end", () => {
    expect(conformJoints(PARENTS, 4, 3)).toEqual([0, 1, 2, 3]);
  });

  it("lists a chain that starts and ends on one joint as that joint", () => {
    expect(conformJoints(PARENTS, 2, 2)).toEqual([2]);
  });

  it("reads a joint the skeleton lacks as its first joint", () => {
    expect(conformJoints(PARENTS, -1, 2)).toEqual([0, 1, 2]);
    expect(conformJoints(PARENTS, 1, -1)).toEqual([0]);
  });
});

describe("stepConformInto", () => {
  it("leaves the animation as it is under a unit that stands still", () => {
    const { locals } = stepped(
      conform(),
      Array.from({ length: 20 }, () => [0, 0] as const),
    );

    expect(rounded(locals)).toEqual(rounded(BIND));
  });

  it("only stands its aims on the first step", () => {
    const { locals } = stepped(conform(), [[40, 0]]);

    expect(rounded(locals)).toEqual(rounded(BIND));
  });

  it("trails the chain behind a unit that runs", () => {
    const { world, root } = stepped(conform(), run(20));

    expect(world.positions[3 * 3] - root.position[0]).toBeLessThan(-5);
    expect(swing(world, 1, 2)).toBeLessThan(-5);
  });

  it("turns a joint about the up axis and no other", () => {
    const { locals } = stepped(conform(), run(20));

    const turn = Array.from(locals.subarray(LOCAL_FLOATS + 3, LOCAL_FLOATS + 7));
    expect(rounded([turn[0], turn[2]])).toEqual([0, 0]);
    expect(Math.abs(turn[1])).toBeGreaterThan(0.01);
  });

  it("cuts each joint's turn to the largest bone angle", () => {
    const { world } = stepped(conform({ maxBoneAngle: 10 }), run(20));

    expect(swing(world, 1, 2)).toBeCloseTo(-10, 3);
  });

  it("weighs each joint's turn by its mask", () => {
    const whole = stepped(conform(), run(2));
    const half = stepped(conform({ mask: [1, 0.5, 0.5, 0.5, 1] }), run(2));
    const none = stepped(conform({ mask: [0, 0, 0, 0, 0] }), run(20));

    expect(swing(half.world, 1, 2)).toBeCloseTo(swing(whole.world, 1, 2) / 2, 3);
    expect(rounded(none.locals)).toEqual(rounded(BIND));
  });

  it("turns only near a turn of the unit's path where it is set to", () => {
    const straight = stepped(conform({ onlyInTurns: true }), run(20));
    const turned = stepped(conform({ onlyInTurns: true }), CORNER);

    expect(rounded(straight.locals)).toEqual(rounded(BIND));
    expect(rounded(turned.locals)).not.toEqual(rounded(BIND));
  });

  it("fades a turn out between the activation and the blend distance of the corner", () => {
    const turned = (activationDistance: number, blendDistance: number) =>
      Math.abs(
        swing(
          stepped(conform({ onlyInTurns: true, activationDistance, blendDistance }), CORNER).world,
          1,
          2,
        ),
      );

    /* The first joint ends about 51 from the corner. */
    const whole = turned(200, 400);
    const part = turned(30, 80);

    expect(part).toBeGreaterThan(whole * 0.4);
    expect(part).toBeLessThan(whole * 0.8);
    expect(turned(1, 2)).toBe(0);
  });

  it("turns an extra chain by the angles of its own", () => {
    const extra = { joints: [4], rightBias: 0 };
    const { locals } = stepped(conform({ extraChains: [extra] }), run(20));

    const own = locals.subarray(LOCAL_FLOATS + 3, LOCAL_FLOATS + 7);
    const fin = locals.subarray(4 * LOCAL_FLOATS + 3, 4 * LOCAL_FLOATS + 7);
    expect(rounded(fin)).toEqual(rounded(own));
  });

  it("takes the size of an angle off an extra chain by its right bias", () => {
    const biased = { joints: [4], rightBias: 1 };
    const { locals } = stepped(conform({ extraChains: [biased] }), run(20));

    /* The chain turns one way, which a whole bias takes all of off the extra chain. A turn
       the other way would be doubled. */
    const own = locals[LOCAL_FLOATS + 4];
    const fin = locals[4 * LOCAL_FLOATS + 4];
    expect(own).toBeGreaterThan(0.01);
    expect(fin).toBeCloseTo(0, 6);
  });

  it("blends to an event's mask over the event's time", () => {
    const rig = buildConform(conform());
    const locals = new Float32Array(BIND.length);
    const world = createWorldPose(PARENTS.length);
    const root = createRoot();
    const step = (at: number) => {
      root.position[0] = at * 5;
      locals.set(BIND);
      composeWorldInto(world, locals, PARENTS, ORDER, root);
      stepConformInto(rig, world, PARENTS, root, DT, locals);
      advanceConformMask(rig, DT);
    };

    step(0);
    step(1);
    expect(rig.weights[0]).toBe(1);

    blendConformTo(rig, [0, 0, 0, 0, 0], 4 * DT);
    step(2);
    expect(rig.weights[0]).toBe(1);
    step(3);
    expect(rig.weights[0]).toBeCloseTo(0.75, 6);
    for (let at = 4; at < 10; at += 1) step(at);
    expect(rig.weights[0]).toBe(0);
    expect(rig.blending).toBe(false);
  });
});
