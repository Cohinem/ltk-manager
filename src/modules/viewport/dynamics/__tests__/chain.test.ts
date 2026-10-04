import { describe, expect, it } from "vitest";

import { buildChain, MANY_CHILDREN, NO_CHILD } from "../build";
import { stepChain, writeChainInto } from "../chain";
import type { ChainModel } from "../model";
import {
  bindLocals,
  composeWorldInto,
  createRoot,
  createWorldPose,
  LOCAL_FLOATS,
  parentsFirst,
} from "../world";
import {
  chain,
  constant,
  group,
  joint,
  parentsOf,
  properties,
  rounded,
  skeletonOf,
} from "./fixtures";

/**
 * A root a hundred up, an arm of three joints running out along `x`, ten apart, a clip
 * hanging off the second, and a spare limb that no tree names.
 */
const HAIR = skeletonOf(
  joint("Root", -1, [0, 100, 0]),
  joint("Hair1", 0, [10, 0, 0]),
  joint("Hair2", 1, [10, 0, 0]),
  joint("Hair3", 2, [10, 0, 0]),
  joint("Clip", 2, [0, -5, 0]),
  joint("Arm", 0, [0, 0, 30]),
);
const PARENTS = parentsOf(HAIR);

const DT = 1 / 60;
const GRAVITY = 981;

function rigOf(model: ChainModel, scale = 1) {
  return buildChain(model, HAIR, PARENTS, scale);
}

/** One step of `rig` on the bind pose, the unit standing at the origin. */
function stepOnBind(rig: ReturnType<typeof rigOf>, dt = DT, scale = 1) {
  const locals = bindLocals(HAIR);
  const root = createRoot(scale);
  const world = composeWorldInto(
    createWorldPose(HAIR.joints.length),
    locals,
    PARENTS,
    parentsFirst(PARENTS),
    root,
  );
  stepChain(rig, world, root, dt);
  return { locals, world };
}

function placeOf(rig: ReturnType<typeof rigOf>, node: number): number[] {
  return rounded(rig.position.subarray(node * 3, node * 3 + 3));
}

describe("buildChain", () => {
  it("walks every joint under the root, parents first, and pins the root alone", () => {
    const rig = rigOf(chain([group({ trees: [{ root: 0, excluded: [] }] })]));

    expect(Array.from(rig.joint)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Array.from(rig.parent)).toEqual([-1, 0, 1, 2, 2, 0]);
    expect(Array.from(rig.pinned)).toEqual([1, 0, 0, 0, 0, 0]);
    expect(Array.from(rig.simulated)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(Array.from(rig.child)).toEqual([
      MANY_CHILDREN,
      2,
      MANY_CHILDREN,
      NO_CHILD,
      NO_CHILD,
      NO_CHILD,
    ]);
  });

  it("gives an excluded joint and everything under it a node and no particle", () => {
    const rig = rigOf(chain([group({ trees: [{ root: 1, excluded: [2] }] })]));

    expect(Array.from(rig.joint)).toEqual([1, 2, 3, 4]);
    expect(Array.from(rig.simulated)).toEqual([1, 0, 0, 0]);
    expect(Array.from(rig.child)).toEqual([NO_CHILD, NO_CHILD, NO_CHILD, NO_CHILD]);
  });

  it("leaves out a tree whose root the skeleton lacks", () => {
    const rig = rigOf(chain([group({ trees: [{ root: -1, excluded: [] }] })]));

    expect(rig.count).toBe(0);
    expect(rig.trees).toEqual([]);
  });

  it("places each joint along its tree by length, the longest branch at one", () => {
    const rig = rigOf(chain([group({ trees: [{ root: 1, excluded: [] }] })]));

    expect(rounded(rig.along)).toEqual([0, 0.5, 1, 0.75]);
  });

  it("scales each parameter by its curve at the joint's place along the tree", () => {
    const falling = {
      value: 0.8,
      useCurve: true,
      curve: { times: [0, 1], values: [1, 0], modes: [0] },
    };
    const model = chain([
      group({
        trees: [{ root: 1, excluded: [] }],
        properties: properties({ damping: falling, radius: constant(5) }),
      }),
    ]);

    const rig = rigOf(model);

    expect(rounded(rig.damping)).toEqual([0.8, 0.4, 0, 0.2]);
    expect(rounded(rig.radius)).toEqual([5, 5, 5, 5]);
  });

  it("holds an attraction past one at one", () => {
    const model = chain([
      group({
        trees: [{ root: 1, excluded: [] }],
        properties: properties({ attraction: constant(1.5) }),
      }),
    ]);

    expect(rounded(rigOf(model).attraction)).toEqual([1, 1, 1, 1]);
  });

  it("gives a tip no radius where the group asks", () => {
    const model = chain([
      group({
        trees: [{ root: 1, excluded: [] }],
        properties: properties({ radius: constant(5) }),
        tipsWithoutRadius: true,
      }),
    ]);

    expect(rounded(rigOf(model).radius)).toEqual([5, 5, 0, 0]);
  });

  it("lays the ground at the lowest joint of the bind pose", () => {
    const rig = rigOf(chain([group({ trees: [{ root: 1, excluded: [] }] })]));

    expect(rig.groundY).toBe(95);
  });

  it("ties each joint of a tree to the joints of the next tree at its depth", () => {
    const twin = skeletonOf(
      joint("Root", -1, [0, 0, 0]),
      joint("A0", 0, [0, 0, 0]),
      joint("A1", 1, [0, -10, 0]),
      joint("B0", 0, [4, 0, 0]),
      joint("B1", 3, [0, -10, 0]),
      joint("C0", 0, [4, 0, 3]),
      joint("C1", 5, [0, -10, 0]),
    );
    const model = chain([
      group({
        trees: [
          { root: 1, excluded: [] },
          { root: 3, excluded: [] },
          { root: 5, excluded: [] },
        ],
        lateralLinks: true,
        lateralLinkMaterial: 4,
      }),
    ]);

    const rig = buildChain(model, twin, parentsOf(twin), 2);

    /* The last tree is not tied back to the first, and a root ties to nothing. */
    expect(rig.links.map((link) => [rig.joint[link.a], rig.joint[link.b], link.rest])).toEqual([
      [2, 4, 8],
      [4, 6, 6],
    ]);
    expect(rig.links.every((link) => link.compliance === 1e-4)).toBe(true);
  });
});

describe("stepChain", () => {
  const arm = (over: Parameters<typeof properties>[0] = {}, flags = {}) =>
    chain([
      group({
        trees: [{ root: 0, excluded: [2] }],
        properties: properties(over),
        ...flags,
      }),
    ]);

  it("drops a particle by gravity over the step squared, then restores its length", () => {
    const rig = rigOf(arm());

    stepOnBind(rig);

    const fallen = [10, -GRAVITY * DT * DT];
    const reach = Math.hypot(fallen[0], fallen[1]);
    expect(placeOf(rig, 1)).toEqual(
      rounded([(fallen[0] / reach) * 10, 100 + (fallen[1] / reach) * 10, 0]),
    );
  });

  it("carries a particle on by what it moved last step, less its damping", () => {
    const free = rigOf(arm({ stretch: constant(1) }));
    const damped = rigOf(arm({ stretch: constant(1), damping: constant(0.25) }));

    for (const rig of [free, damped]) {
      stepOnBind(rig);
      stepOnBind(rig);
    }

    /* With full stretch nothing restores the length, so the fall is the integrator's own. */
    const drop = GRAVITY * DT * DT;
    expect(placeOf(free, 1)).toEqual(rounded([10, 100 - drop - (drop + drop), 0]));
    expect(placeOf(damped, 1)).toEqual(rounded([10, 100 - drop - (0.75 * drop + drop), 0]));
  });

  it("pulls a particle toward its animated place by one less the rest to the power of the step", () => {
    const rig = rigOf(arm({ stretch: constant(1), attraction: constant(0.75) }));

    stepOnBind(rig, 0.5);

    const drop = GRAVITY * 0.25;
    expect(placeOf(rig, 1)).toEqual(rounded([10, 100 - drop * 0.25 ** 0.5, 0]));
  });

  it("holds a particle on its animated place at full attraction, and at one past it", () => {
    for (const attraction of [1, 1.5]) {
      const rig = rigOf(arm({ attraction: constant(attraction) }));

      stepOnBind(rig);
      stepOnBind(rig);

      expect(placeOf(rig, 1)).toEqual([10, 100, 0]);
    }
  });

  it("keeps a share of the stretch a step left", () => {
    const rig = rigOf(arm({ stretch: constant(0.5) }));

    stepOnBind(rig, 0.1);

    const reach = Math.hypot(10, GRAVITY * 0.01);
    const [x, y] = rig.position.subarray(3, 5);
    expect(Math.hypot(x, y - 100)).toBeCloseTo(0.5 * 10 + 0.5 * reach, 6);
  });

  it("holds a particle inside its cone about the animated bone", () => {
    const rig = rigOf(arm({ limitAngle: constant(30) }));

    stepOnBind(rig, 0.2);

    const [x, y] = rig.position.subarray(3, 5);
    expect((Math.atan2(100 - y, x) * 180) / Math.PI).toBeCloseTo(30, 4);
    expect(Math.hypot(x, y - 100)).toBeCloseTo(10, 6);
  });

  it("stops a particle with a radius on the ground under the lowest joint", () => {
    const hanging = skeletonOf(joint("Root", -1, [0, 2, 0]), joint("Tip", 0, [10, 0, 0]));
    const parents = parentsOf(hanging);
    const model = chain([
      group({
        trees: [{ root: 0, excluded: [] }],
        properties: properties({ radius: constant(1), stretch: constant(1) }),
      }),
    ]);
    const rig = buildChain(model, hanging, parents, 1);
    const root = createRoot();
    const world = composeWorldInto(
      createWorldPose(2),
      bindLocals(hanging),
      parents,
      parentsFirst(parents),
      root,
    );

    for (let step = 0; step < 30; step += 1) stepChain(rig, world, root, DT);

    /* The ground lies at the root's height, and the particle rests a radius above it. */
    expect(rig.position[4]).toBeCloseTo(3, 6);
  });

  it("pushes a particle out of a sphere by both radii", () => {
    const model = chain(
      [
        group({
          trees: [{ root: 0, excluded: [2] }],
          properties: properties({
            radius: constant(1),
            attraction: constant(1),
          }),
        }),
      ],
      {
        gravityScale: 0,
        colliders: {
          spheres: [{ joint: 0, centre: [10, -1, 0], radius: 2 }],
          capsules: [],
        },
      },
    );
    const rig = rigOf(model);

    stepOnBind(rig);

    /* Straight up out of a sphere centred one under it, to the sum of the radii. */
    expect(placeOf(rig, 1).slice(0, 2)).toEqual(
      rounded([10 * (10 / Math.hypot(10, 2)), 100 + 2 * (10 / Math.hypot(10, 2))]),
    );
  });

  describe("under a capsule", () => {
    /** A particle of radius 1 held at `(10, 100, 0)`, with a capsule on the root under it. */
    const under = (endA: number, radiusA: number, endB: number, radiusB: number) => {
      const model = chain(
        [
          group({
            trees: [{ root: 0, excluded: [2] }],
            properties: properties({
              radius: constant(1),
              attraction: constant(1),
              stretch: constant(1),
            }),
          }),
        ],
        {
          gravityScale: 0,
          colliders: {
            spheres: [],
            capsules: [
              { jointA: 0, endA: [endA, -1, 0], radiusA, jointB: 0, endB: [endB, -1, 0], radiusB },
            ],
          },
        },
      );
      const rig = rigOf(model);
      stepOnBind(rig);
      return placeOf(rig, 1);
    };

    it("pushes a particle out by its own radius and the capsule's at the nearest point", () => {
      /* Half way along, the capsule is as wide as the mean of its ends. */
      expect(under(0, 1, 20, 3)).toEqual([10, 102, 0]);
    });

    it("pushes a particle out of the end it stands past by that end's radius", () => {
      /* The far end stands a step back and a step down, so the way out runs up and on. */
      const out = 2.5 / Math.SQRT2;
      expect(under(-20, 3, 9, 1.5)).toEqual(rounded([9 + out, 99 + out, 0]));
      expect(under(10, 2, 30, 0.5)).toEqual([10, 102, 0]);
    });

    it("takes a capsule whose ends stand on one point for a sphere of the larger radius", () => {
      expect(under(10, 1, 10, 4)).toEqual([10, 104, 0]);
      expect(under(10, 4, 10, 1)).toEqual([10, 104, 0]);
    });
  });

  it("moves nothing over a step of no time", () => {
    const rig = rigOf(arm());

    stepOnBind(rig, 0);

    expect(rig.resetPending).toBe(true);
    expect(placeOf(rig, 1)).toEqual([0, 0, 0]);
  });

  it("follows the unit: a root moved between steps leaves the free joints behind", () => {
    const still = rigOf({ ...arm({ stretch: constant(1) }), gravityScale: 0 });
    const locals = bindLocals(HAIR);
    const order = parentsFirst(PARENTS);
    const root = createRoot();
    const world = createWorldPose(HAIR.joints.length);

    stepChain(still, composeWorldInto(world, locals, PARENTS, order, root), root, DT);
    root.position[2] = 5;
    stepChain(still, composeWorldInto(world, locals, PARENTS, order, root), root, DT);

    expect(placeOf(still, 0)).toEqual([0, 100, 5]);
    expect(placeOf(still, 1)).toEqual([10, 100, 0]);
  });
});

describe("writeChainInto", () => {
  it("leaves the animation as it is while nothing has moved", () => {
    const model = chain([group({ trees: [{ root: 0, excluded: [] }] })], {
      gravityScale: 0,
    });
    const rig = rigOf(model);

    const { locals, world } = stepOnBind(rig);
    const written = Float32Array.from(locals);
    writeChainInto(rig, world, 1, written);

    expect(rounded(written)).toEqual(rounded(locals));
  });

  it("writes a swung joint as a turn of its parent and leaves its own length alone", () => {
    const model = chain([group({ trees: [{ root: 0, excluded: [2, 5] }] })]);
    const rig = rigOf(model);

    const { locals, world } = stepOnBind(rig, 0.1);
    writeChainInto(rig, world, 1, locals);

    /* The joint is the root's child, and a root is never turned, so the swing is its offset. */
    const at = LOCAL_FLOATS;
    const [x, y, z] = locals.subarray(at, at + 3);
    expect(Math.hypot(x, y, z)).toBeCloseTo(10, 4);
    expect(y).toBeLessThan(0);
    expect(rounded(locals.subarray(0, 7))).toEqual([0, 100, 0, 0, 0, 0, 1]);
  });

  it("blends by the weight, the chain's envelope and the joint's own", () => {
    const swing = (envelope: number, globalEnvelope: number, weight: number) => {
      const model = chain(
        [
          group({
            trees: [{ root: 0, excluded: [2, 5] }],
            properties: properties({ envelope: constant(envelope) }),
          }),
        ],
        { globalEnvelope },
      );
      const rig = rigOf(model);
      const { locals, world } = stepOnBind(rig, 0.1);
      writeChainInto(rig, world, weight, locals);
      return locals[LOCAL_FLOATS + 1];
    };

    const full = swing(1, 1, 1);

    expect(swing(0.5, 1, 1)).toBeCloseTo(full / 2, 5);
    expect(swing(1, 0.5, 1)).toBeCloseTo(full / 2, 5);
    expect(swing(1, 1, 0.5)).toBeCloseTo(full / 2, 5);
    expect(swing(1, 1, 0)).toBe(0);
  });

  it("writes in the skeleton's units whatever scale the character is drawn at", () => {
    const model = chain([group({ trees: [{ root: 0, excluded: [2, 5] }] })], {
      gravityScale: 0,
    });
    const rig = rigOf(model, 2);

    const { locals, world } = stepOnBind(rig, DT, 2);
    writeChainInto(rig, world, 1, locals);

    expect(rounded(rig.position.subarray(3, 6))).toEqual([20, 200, 0]);
    expect(rounded(locals.subarray(LOCAL_FLOATS, LOCAL_FLOATS + 3))).toEqual([10, 0, 0]);
  });
});
