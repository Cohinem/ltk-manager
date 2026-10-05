import { describe, expect, it } from "vitest";

import type { ChildSetModel, EmitterModel, SystemModel, ValueCurve } from "../../model/model";
import type { Point } from "../../model/rig";
import { emptySystem } from "../../model/systemModel";
import {
  childIndex,
  childPath,
  childPrefix,
  childSteps,
  createChildren,
  createLineage,
  feedOf,
} from "../children";
import { NO_TRANSFORM } from "../integrate";
import type { Source } from "../particleRead";
import { createPool, type Pool, spawn } from "../pool";
import { emitterOf, flat } from "./emitterFixture";

function constant(...values: number[]): ValueCurve {
  return { constant: values, keys: [], tables: [] };
}

function setOf(count: number, over: Partial<ChildSetModel> = {}): ChildSetModel {
  return {
    children: Array.from({ length: count }, (_, at) => emptySystem(`0x${at}`)),
    bones: [],
    probability: constant(0),
    onDeath: false,
    inheritance: null,
    ...over,
  };
}

/** A draw that counts how often it was asked, so a test can say the stream was left alone. */
function counted(value = 0.5) {
  const draw = () => {
    draw.calls += 1;
    return value;
  };
  draw.calls = 0;
  return draw;
}

describe("childIndex", () => {
  it("takes the one child without reading the probability or the stream", () => {
    const draw = counted();

    expect(childIndex(setOf(1, { probability: constant(7) }), 0, draw)).toBe(0);
    expect(draw.calls).toBe(0);
  });

  it("spawns nothing for a set naming no children", () => {
    expect(childIndex(setOf(0), 0, counted())).toBeNull();
  });

  it("spawns nothing for a set naming bones, which spawns through the bone path instead", () => {
    expect(childIndex(setOf(2, { bones: ["R_Hand", "L_Hand"] }), 0, counted())).toBeNull();
    expect(childIndex(setOf(2, { bones: ["R_Hand"] }), 0, counted())).toBeNull();
  });

  it("reads the probability as an index, wrapped over the children and floored at zero", () => {
    expect(childIndex(setOf(3, { probability: constant(2.5) }), 0, counted())).toBe(2);
    expect(childIndex(setOf(3, { probability: constant(3.5) }), 0, counted())).toBe(0);
    expect(childIndex(setOf(3, { probability: constant(-4) }), 0, counted())).toBe(0);
  });

  it("picks by the draw where the probability carries a table", () => {
    const table: ValueCurve = {
      constant: [1],
      keys: [],
      tables: [
        {
          channel: 0,
          single: 1,
          keys: [
            { time: 0, values: [0] },
            { time: 1, values: [4] },
          ],
        },
      ],
    };
    const draw = counted(0.6);

    expect(childIndex(setOf(4, { probability: table }), 0, draw)).toBe(2);
    expect(draw.calls).toBe(1);
  });

  it("reads the probability at the time it is given, which a death spawn sets to the lifetime", () => {
    const keyed: ValueCurve = {
      constant: [0],
      keys: [
        { time: 0, values: [0] },
        { time: 2, values: [1] },
      ],
      tables: [],
    };

    expect(childIndex(setOf(2, { probability: keyed }), 0, counted())).toBe(0);
    expect(childIndex(setOf(2, { probability: keyed }), 2, counted())).toBe(1);
  });
});

describe("createChildren", () => {
  const UPRIGHT = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const STEP = 1 / 60;

  /** A translation of 500 along X, as a definition's `transform` lays it out. */
  const MOVED = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 500, 0, 0, 1];

  /**
   * A child system of one emitter that spawns nothing and never ends.
   *
   * `HasVariableStartTime` is what lets a rate of zero spawn none: a first emission that
   * counts to nothing is otherwise raised to one particle.
   */
  function childOf(over: Partial<EmitterModel> = {}, system: Partial<SystemModel> = {}) {
    const silent = emitterOf(0, { hasVariableStartTime: true, ...over });
    return { ...emptySystem("0x9"), emitters: [silent], ...system };
  }

  /** A system of one emitter whose every particle carries `child`. */
  function carrying(child: SystemModel): SystemModel {
    const set = setOf(1, { children: [child] });
    return { ...emptySystem("0x1"), emitters: [emitterOf(0, { childSet: set })] };
  }

  /** A pool of one particle, given its matrix translation, its anchor and its carried travel. */
  function riding(placed: Point, anchor: Point, bound: Point): Pool {
    const pool = createPool(2);
    spawn(pool, 0, 0, 10, 0);
    pool.placed.set(placed, 0);
    pool.anchor.set(anchor, 0);
    pool.bound.set(bound, 0);
    return pool;
  }

  /** The children of `system` over `pool`, stepped once at the first frame of a run. */
  function spawned(system: SystemModel, pool: Pool) {
    const lineage = createLineage(1);
    const children = createChildren(lineage, "", 0);
    const parent: Source = {
      pool,
      time: 0,
      elapsed: 0,
      origin: [0, 0, 0],
      target: [0, 0, 0],
      orientation: UPRIGHT,
      world: NO_TRANSFORM,
    };
    let now = 0;
    const step = () => {
      now += STEP;
      children.step(parent, system, STEP, now);
    };
    step();
    return { lineage, children, feed: feedOf(lineage, "0.0"), step };
  }

  it("stands a child on its particle's matrix translation, anchor and carried travel", () => {
    const pool = riding([1, 2, 3], [10, 0, 0], [0, 0, 5]);
    const { feed } = spawned(carrying(childOf()), pool);

    expect(feed).toHaveLength(1);
    expect(feed[0].origin).toEqual([11, 2, 8]);
  });

  it("turns that translation, and the child, by the frame the particle was born in", () => {
    const pool = riding([1, 2, 3], [10, 0, 0], [0, 0, 0]);
    pool.frame.set([0, 0, 1, 0, 1, 0, -1, 0, 0], 0);
    const { feed } = spawned(carrying(childOf()), pool);

    expect(feed[0].origin).toEqual([13, 2, -1]);
    expect(Array.from(feed[0].orientation, (cell) => cell + 0)).toEqual([
      0, 0, 1, 0, 1, 0, -1, 0, 0,
    ]);
  });

  it("leaves a child's own transform out of where it stands", () => {
    const pool = riding([1, 2, 3], [10, 0, 0], [0, 0, 5]);
    const { feed } = spawned(carrying(childOf({}, { transform: MOVED })), pool);

    expect(feed[0].origin).toEqual([11, 2, 8]);
    expect(feed[0].world.offset).toEqual([500, 0, 0]);
    expect(feed[0].world.hud).toBe(false);
  });

  it("moves a HUD-layer child by its transform's translation", () => {
    const pool = riding([1, 2, 3], [10, 0, 0], [0, 0, 5]);
    const hud = childOf({ hudLayer: true }, { transform: MOVED, hudLayer: true });
    const { feed, step } = spawned(carrying(hud), pool);

    expect(feed[0].origin).toEqual([511, 2, 8]);

    /* It follows its particle by the same rule on every later step. */
    pool.anchor.set([20, 0, 0], 0);
    step();
    expect(feed[0].origin).toEqual([521, 2, 8]);
  });

  it("reaps a child whose every emitter its ChanceToNotExist left out of the run", () => {
    const pool = riding([0, 0, 0], [0, 0, 0], [0, 0, 0]);
    const absent = childOf({ rate: flat(60), chanceToNotExist: 1 });
    const { lineage, feed, step } = spawned(carrying(absent), pool);

    expect(feed).toHaveLength(1);

    step();
    expect(feed).toHaveLength(0);
    expect(lineage.live).toBe(0);
    expect(lineage.births).toHaveLength(1);
  });

  it("keeps a child that spawns nothing until its emitter's end time has passed", () => {
    const pool = riding([0, 0, 0], [0, 0, 0], [0, 0, 0]);
    const { feed, step } = spawned(carrying(childOf({ lifetime: 0.04 })), pool);

    step();
    step();
    expect(feed).toHaveLength(1);

    step();
    expect(feed).toHaveLength(0);
  });

  it("keeps a child whose emitter has no end for as long as its particle lives", () => {
    const pool = riding([0, 0, 0], [0, 0, 0], [0, 0, 0]);
    const { feed, step } = spawned(carrying(childOf()), pool);

    for (let at = 0; at < 120; at += 1) step();

    expect(feed).toHaveLength(1);
  });
});

describe("childSteps", () => {
  it("reads no step off the opened system's path", () => {
    expect(childSteps("")).toEqual([]);
  });

  it("reads back each step childPath joined, from the opened system down", () => {
    const path = childPath(childPrefix(childPath("", 3, 0)), 5, 1);

    expect(path).toBe("3.0/5.1");
    expect(childSteps(path)).toEqual([
      { emitter: 3, slot: 0 },
      { emitter: 5, slot: 1 },
    ]);
  });
});
