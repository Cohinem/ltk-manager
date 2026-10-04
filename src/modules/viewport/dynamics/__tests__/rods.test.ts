import { describe, expect, it } from "vitest";

import { buildChain } from "../build";
import { stepChain, writeChainInto } from "../chain";
import { bendCompliance } from "../curve";
import { relativeInto } from "../math";
import type { ChainModel } from "../model";
import {
  bindLocals,
  composeWorldInto,
  createRoot,
  createWorldPose,
  LOCAL_FLOATS,
  parentsFirst,
} from "../world";
import { chain, constant, group, joint, parentsOf, properties, skeletonOf } from "./fixtures";

/** A root and a strand of four joints running out along `x`, ten apart. */
const STRAND = skeletonOf(
  joint("Root", -1, [0, 100, 0]),
  joint("A", 0, [10, 0, 0]),
  joint("B", 1, [10, 0, 0]),
  joint("C", 2, [10, 0, 0]),
  joint("D", 3, [10, 0, 0]),
);
const PARENTS = parentsOf(STRAND);
const DT = 1 / 60;

function rods(over: Parameters<typeof properties>[0] = {}): ChainModel {
  return chain([
    group({
      trees: [{ root: 0, excluded: [] }],
      properties: properties({
        useRodPhysics: true,
        damping: constant(0.1),
        ...over,
      }),
    }),
  ]);
}

function run(model: ChainModel, steps: number) {
  const rig = buildChain(model, STRAND, PARENTS, 1);
  const locals = bindLocals(STRAND);
  const root = createRoot();
  const world = composeWorldInto(
    createWorldPose(STRAND.joints.length),
    locals,
    PARENTS,
    parentsFirst(PARENTS),
    root,
  );
  for (let step = 0; step < steps; step += 1) stepChain(rig, world, root, DT);
  return { rig, locals, world };
}

function span(rig: ReturnType<typeof run>["rig"], a: number, b: number): number {
  return Math.hypot(
    rig.position[b * 3] - rig.position[a * 3],
    rig.position[b * 3 + 1] - rig.position[a * 3 + 1],
    rig.position[b * 3 + 2] - rig.position[a * 3 + 2],
  );
}

describe("rod physics", () => {
  it("orients every joint with one simulated child and ties it to that child and its parent", () => {
    const { rig } = run(rods(), 1);

    /* The tip has no child, so it holds no rod of its own. */
    expect(Array.from(rig.oriented)).toEqual([1, 1, 1, 1, 0]);
    expect(rig.stretchShear.map((rod) => [rod.node, rod.child])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    expect(rig.bendTwist.map((turn) => [turn.parent, turn.node])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it("takes a rod's stretch and its shear compliance each from its own stiffness", () => {
    const { rig } = run(rods({ rodStretch: constant(0), rodShear: constant(1) }), 1);

    expect(rig.stretchShear[0].stretch).toBeCloseTo(0.1, 9);
    expect(rig.stretchShear[0].shear).toBeCloseTo(0, 12);
  });

  it("takes a bend's and a twist's compliance for the rest length the pose gives the segment", () => {
    const { rig } = run(rods({ rodBend: constant(0.2), rodTwist: constant(0.6) }), 1);

    expect(rig.bendTwist[0].bend).toBeCloseTo(bendCompliance(0.2, 10), 9);
    expect(rig.bendTwist[0].twist).toBeCloseTo(bendCompliance(0.6, 10), 9);
  });

  it("keeps a stiff strand from stretching along its rods while it hangs", () => {
    const { rig } = run(rods(), 120);

    /* One pass a substep leaves some shear unsolved, so a segment runs a little long
       across its rod and never short along it. */
    for (let node = 1; node < rig.count; node += 1) {
      expect(span(rig, node - 1, node)).toBeGreaterThan(9.9);
      expect(span(rig, node - 1, node)).toBeLessThan(12);
    }
    expect(Array.from(rig.position).every(Number.isFinite)).toBe(true);
  });

  it("sags further the softer its bend is", () => {
    const stiff = run(rods(), 120).rig;
    const soft = run(rods({ rodBend: constant(0.2) }), 120).rig;

    expect(soft.position[4 * 3 + 1]).toBeLessThan(stiff.position[4 * 3 + 1] - 1);
  });

  it("writes a rod joint's own orientation back, relative to its parent's", () => {
    const { rig, locals, world } = run(rods({ rodBend: constant(0.2) }), 60);

    writeChainInto(rig, world, 1, locals);

    const at = LOCAL_FLOATS;
    const turn = locals.subarray(at + 3, at + 7);
    const own = new Float64Array(4);
    relativeInto(own, 0, rig.orientation, 0, rig.orientation, 4);
    const alike = turn[0] * own[0] + turn[1] * own[1] + turn[2] * own[2] + turn[3] * own[3];
    /* A quaternion and its negative are one turn. */
    expect(Math.abs(alike)).toBeCloseTo(1, 5);
    expect(Math.abs(turn[3])).toBeLessThan(0.9999);
    expect(Math.hypot(locals[at], locals[at + 1], locals[at + 2])).toBeCloseTo(10, 1);
  });
});

describe("lateral links", () => {
  /** Two strands hanging side by side, four apart. */
  const PAIR = skeletonOf(
    joint("Root", -1, [0, 100, 0]),
    joint("L0", 0, [-2, 0, 0]),
    joint("L1", 1, [0, -10, 0]),
    joint("R0", 0, [2, 0, 0]),
    joint("R1", 3, [0, -10, 0]),
  );

  it("holds two strands at their bind distance while one is pushed away", () => {
    const parents = parentsOf(PAIR);
    const model = chain(
      [
        group({
          trees: [
            { root: 1, excluded: [] },
            { root: 3, excluded: [] },
          ],
          properties: properties({ stretch: constant(1) }),
          lateralLinks: true,
          lateralLinkMaterial: 0,
        }),
      ],
      { gravityOverride: [600, 0, 0] },
    );
    const rig = buildChain(model, PAIR, parents, 1);
    const root = createRoot();
    const world = composeWorldInto(
      createWorldPose(PAIR.joints.length),
      bindLocals(PAIR),
      parents,
      parentsFirst(parents),
      root,
    );

    for (let step = 0; step < 30; step += 1) stepChain(rig, world, root, DT);

    const [left, right] = [1, 3];
    expect(rig.links).toHaveLength(1);
    expect(span(rig, left, right)).toBeCloseTo(4, 2);
    expect(rig.position[left * 3]).toBeGreaterThan(5);
  });
});
