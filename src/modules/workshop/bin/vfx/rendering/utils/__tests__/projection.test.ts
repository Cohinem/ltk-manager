import { describe, expect, it } from "vitest";

import type { LegacySimpleModel } from "../../../engine/model/model";
import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
import { createPool, spawn } from "../../../engine/simulation/pool";
import { type Footprint, footprintInto, matrixTurn, modulateInto } from "../projection";

const DEGREE = Math.PI / 180;

/** The first row a yaw of `degrees` leaves, as `Mtx44_PreMultiply_RotateY` builds it. */
function yawed(degrees: number): [number, number] {
  return [Math.cos(degrees * DEGREE), -Math.sin(degrees * DEGREE)];
}

/** A basis whose first column is the row `yawed` gives, which is all the complex turn reads. */
function basisOf(degrees: number): Float32Array {
  const [m00, m02] = yawed(degrees);
  const basis = new Float32Array(9);
  basis[0] = m00;
  basis[6] = m02;
  return basis;
}

function pooled(rotationZ = 0) {
  const pool = createPool(1);
  spawn(pool, 0, 0, 1, 0);
  pool.rotation[2] = rotationZ;
  return pool;
}

function footprint(
  emitter: ReturnType<typeof emitterOf>,
  scale: number[],
  basis = basisOf(0),
  rotationZ = 0,
): Footprint {
  const out: Footprint = { halfWidth: 0, halfHeight: 0, turn: 0 };
  footprintInto(emitter, pooled(rotationZ), 0, 0, new Float32Array(scale), basis, out);
  return out;
}

const SIMPLE = {
  rotation: flat(10),
} as unknown as LegacySimpleModel;

describe("matrixTurn", () => {
  it("turns an unyawed particle's decal by nothing", () => {
    expect(matrixTurn(...yawed(0))).toBeCloseTo(0, 4);
  });

  it("undoes the particle's own yaw", () => {
    expect(matrixTurn(...yawed(30))).toBeCloseTo(-30, 4);
    expect(matrixTurn(...yawed(-45))).toBeCloseTo(45, 4);
  });
});

describe("footprintInto", () => {
  it("spans a complex particle's scale x by its scale z, turned off its basis", () => {
    const held = footprint(emitterOf(0), [40, 7, 25], basisOf(90));

    expect(held.halfWidth).toBe(40);
    expect(held.halfHeight).toBe(25);
    expect(held.turn).toBeCloseTo(-90 * DEGREE, 4);
  });

  it("spans a simple particle's scale x by its scale y, turned by its rotation and roll", () => {
    const held = footprint(emitterOf(0, { legacySimple: SIMPLE }), [40, 30, 1], basisOf(90), 5);

    expect(held.halfWidth).toBe(40);
    expect(held.halfHeight).toBe(30);
    expect(held.turn).toBeCloseTo(15 * DEGREE, 5);
  });
});

describe("modulateInto", () => {
  it("modulates a complex decal by its colour and a simple one by white", () => {
    const drawn = new Float32Array([0.5, 0.25, 1, 0.75]);
    const out = new Float32Array(4);

    modulateInto(emitterOf(0), drawn, out);
    expect(Array.from(out)).toEqual([0.5, 0.25, 1, 0.75]);

    modulateInto(emitterOf(0, { legacySimple: SIMPLE }), drawn, out);
    expect(Array.from(out)).toEqual([1, 1, 1, 1]);
  });
});
