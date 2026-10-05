import { describe, expect, it } from "vitest";

import { ADDRESS_MODE } from "../../../engine/model/enums";
import { plainUvLayer, type UvLayer, type ValueCurve } from "../../../engine/model/model";
import { createPool, type Pool, spawn, UV, uvAt } from "../../../engine/simulation/pool";
import { cellSize, uvDraw, uvRowsInto, uvTransformInto } from "../uvTransform";

function flat(...constant: number[]): ValueCurve {
  return { constant, keys: [], tables: [] };
}

function layerOf(over: Partial<UvLayer> = {}, book: Partial<UvLayer["book"]> = {}): UvLayer {
  const plain = plainUvLayer();
  return { ...plain, ...over, book: { ...plain.book, ...book } };
}

/** A curve of `keys`, each a time and the channels it holds there. */
function keyed(...keys: [number, ...number[]][]): ValueCurve {
  return { constant: [], keys: keys.map(([time, ...values]) => ({ time, values })), tables: [] };
}

/** A pool holding one particle born at zero, living `lifetime` seconds. */
function onePool(lifetime = 1): Pool {
  const pool = createPool(4);
  spawn(pool, 0, 0, lifetime, 0.5);
  return pool;
}

describe("uvTransformInto", () => {
  it("leaves a layer with no transform on the whole texture", () => {
    const out = uvDraw();
    uvTransformInto(onePool(), 0, plainUvLayer(), 0, 0, 0, 0, out);

    expect(out).toEqual({
      turn: 0,
      scaleU: 1,
      scaleV: 1,
      offsetU: 0,
      offsetV: 0,
      cellU: 0,
      cellV: 0,
    });
  });

  it("adds the emitter's own scroll off the clock rather than the particle's age", () => {
    const out = uvDraw();
    const layer = layerOf({ emitterScrollRate: [0.25, -0.5], addressMode: ADDRESS_MODE.clamp });

    uvTransformInto(onePool(), 0, layer, 0, 0, 0, 4, out);

    expect(out.offsetU).toBe(1);
    expect(out.offsetV).toBe(-2);
  });

  it("folds a long scroll by the period its address mode repeats over", () => {
    const out = uvDraw();
    const wrapped = layerOf({ emitterScrollRate: [1, -1], addressMode: ADDRESS_MODE.wrap });
    const mirrored = layerOf({ emitterScrollRate: [1, -1], addressMode: ADDRESS_MODE.mirror });

    uvTransformInto(onePool(), 0, wrapped, 0, 0, 0, 1000.25, out);
    expect(out.offsetU).toBeCloseTo(0.25, 6);
    expect(out.offsetV).toBeCloseTo(0.75, 6);

    uvTransformInto(onePool(), 0, mirrored, 0, 0, 0, 1000.25, out);
    expect(out.offsetU).toBeCloseTo(0.25, 6);
    expect(out.offsetV).toBeCloseTo(1.75, 6);
  });

  it("reverses the emitter's scroll on an axis the layer flips, and leaves the other", () => {
    const out = uvDraw();
    const layer = layerOf({
      emitterScrollRate: [0.25, -0.5],
      flipU: true,
      addressMode: ADDRESS_MODE.clamp,
    });

    uvTransformInto(onePool(), 0, layer, 0, 0, 0, 4, out);
    expect([out.offsetU, out.offsetV]).toEqual([-1, -2]);

    uvTransformInto(onePool(), 0, { ...layer, flipU: false, flipV: true }, 0, 0, 0, 4, out);
    expect([out.offsetU, out.offsetV]).toEqual([1, 2]);
  });

  it("adds no emitter scroll for a draw that asks for none, as a mesh does", () => {
    const out = uvDraw();
    const layer = layerOf({ emitterScrollRate: [0.25, -0.5], addressMode: ADDRESS_MODE.clamp });

    uvTransformInto(onePool(), 0, layer, 0, 0, 0, 4, out, false);

    expect([out.offsetU, out.offsetV]).toEqual([0, 0]);
  });

  it("scrolls by a keyed rate's integral over the age, times the lifetime", () => {
    const out = uvDraw();
    /* A rate climbing from zero to one, whose integral is half the age fraction squared. */
    const layer = layerOf({
      scrollRate: keyed([0, 0, 2], [1, 1, 2]),
      addressMode: ADDRESS_MODE.clamp,
    });
    const pool = onePool(4);

    uvTransformInto(pool, 0, layer, 0, 2, 0.5, 0, out);
    expect(out.offsetU).toBeCloseTo(0.125 * 4, 3);
    expect(out.offsetV).toBeCloseTo(1 * 4, 5);

    uvTransformInto(pool, 0, layer, 0, 4, 1, 0, out);
    expect(out.offsetU).toBeCloseTo(0.5 * 4, 5);
    expect(out.offsetV).toBeCloseTo(2 * 4, 5);
  });

  it("turns by a keyed rotate rate's integral over the age, on top of uvRotation", () => {
    const out = uvDraw();
    const layer = layerOf({ rotation: flat(30), rotateRate: keyed([0, 60], [1, 60]) });

    uvTransformInto(onePool(2), 0, layer, 0, 1, 0.5, 0, out);

    expect(out.turn).toBeCloseTo(Math.PI / 2, 5);
  });

  it("takes a rate writing no keys as one fixed amount times the lifetime, whatever the age", () => {
    const out = uvDraw();
    const layer = layerOf({
      scrollRate: flat(0.25, -0.5),
      rotateRate: flat(45),
      addressMode: ADDRESS_MODE.clamp,
    });
    const pool = onePool(2);

    for (const [age, age01] of [
      [0, 0],
      [1, 0.5],
      [2, 1],
    ]) {
      uvTransformInto(pool, 0, layer, 0, age, age01, 0, out);
      expect([out.offsetU, out.offsetV]).toEqual([0.5, -1]);
      expect(out.turn).toBeCloseTo(Math.PI / 2, 6);
    }
  });

  it("takes no integrated scroll or turn for a particle that never expires", () => {
    const out = uvDraw();
    const layer = layerOf({
      scrollRate: flat(0.25, -0.5),
      rotateRate: flat(45),
      addressMode: ADDRESS_MODE.clamp,
    });

    uvTransformInto(onePool(Infinity), 0, layer, 0, 3, 0, 0, out);

    expect([out.offsetU, out.offsetV, out.turn]).toEqual([0, 0, 0]);
  });

  it("climbs the birth ramp over the age and wraps it into a cell", () => {
    const pool = onePool();
    pool.uv[uvAt(0, 0) + UV.birthOffsetX] = 0.5;
    pool.uv[uvAt(0, 0) + UV.birthScrollX] = 2;
    pool.uv[uvAt(0, 0) + UV.birthRotate] = 45;

    const out = uvDraw();
    const layer = layerOf({ scrollRate: flat(3, 0), addressMode: ADDRESS_MODE.clamp });
    uvTransformInto(pool, 0, layer, 0, 1, 1, 0, out);

    /* The ramp of 2.5 wraps to 0.5 on its own, and the integrated 3 lands on top. */
    expect(out.offsetU).toBeCloseTo(3.5, 6);
    expect(out.turn).toBeCloseTo(Math.PI / 4, 6);
  });

  it("holds the ramp at one cell out under uvScrollClamp and leaves the rest alone", () => {
    const pool = onePool();
    pool.uv[uvAt(0, 0) + UV.birthOffsetX] = 0.5;
    pool.uv[uvAt(0, 0) + UV.birthScrollX] = 2;
    pool.uv[uvAt(0, 0) + UV.birthScrollY] = -4;

    const out = uvDraw();
    const layer = layerOf({
      scrollClamp: true,
      scrollRate: flat(3, 0),
      addressMode: ADDRESS_MODE.clamp,
    });
    uvTransformInto(pool, 0, layer, 0, 1, 1, 0, out);

    expect(out.offsetU).toBeCloseTo(4, 6);
    expect(out.offsetV).toBeCloseTo(-1, 6);
  });

  it("walks a phase onto its own cell of the grid", () => {
    const pool = onePool();
    const book = { divisions: [4, 2] as const, frames: 8 };

    const out = uvDraw();
    for (const [phase, u, v] of [
      [0, 0, 0],
      [1, 0.25, 0],
      [3.9, 0.75, 0],
      [4, 0, 0.5],
      [7, 0.75, 0.5],
    ]) {
      pool.uv[uvAt(0, 0) + UV.phase] = phase;
      uvTransformInto(pool, 0, layerOf({}, book), 0, 0, 0, 0, out);
      expect([out.cellU, out.cellV]).toEqual([u, v]);
    }
  });

  it("wraps a phase past the end of the book back to its start", () => {
    const pool = onePool();
    pool.uv[uvAt(0, 0) + UV.phase] = 9;

    const out = uvDraw();
    uvTransformInto(pool, 0, layerOf({}, { divisions: [4, 2], frames: 8 }), 0, 0, 0, 0, out);

    expect([out.cellU, out.cellV]).toEqual([0.25, 0]);
  });

  it("runs from startFrame and wraps back to it rather than to the grid's first cell", () => {
    const pool = onePool();
    const book = { divisions: [8, 1] as const, frames: 4, start: 3 };

    const out = uvDraw();
    pool.uv[uvAt(0, 0) + UV.phase] = 0;
    uvTransformInto(pool, 0, layerOf({}, book), 0, 0, 0, 0, out);
    expect(out.cellU).toBe(3 / 8);

    pool.uv[uvAt(0, 0) + UV.phase] = 5;
    uvTransformInto(pool, 0, layerOf({}, book), 0, 0, 0, 0, out);
    expect(out.cellU).toBe(4 / 8);
  });

  it("wraps a frame past the grid around the atlas, as the sampler would", () => {
    const pool = onePool();
    const book = { divisions: [2, 2] as const, frames: 8, start: 3 };

    const out = uvDraw();
    pool.uv[uvAt(0, 0) + UV.phase] = 2;
    uvTransformInto(pool, 0, layerOf({}, book), 0, 0, 0, 0, out);

    expect([out.cellU, out.cellV]).toEqual([0.5, 0]);
  });

  it("advances the book over the particle's own age at its own rate", () => {
    const pool = onePool();
    pool.uv[uvAt(0, 0) + UV.frameRate] = 10;

    const out = uvDraw();
    const book = { divisions: [4, 1] as const, frames: 4 };

    uvTransformInto(pool, 0, layerOf({}, book), 0, 0.25, 0.25, 0, out);
    expect(out.cellU).toBe(0.5);

    uvTransformInto(pool, 0, layerOf({}, book), 0, 0.35, 0.35, 0, out);
    expect(out.cellU).toBe(0.75);
  });

  it("plays no frame at a rate at or under zero, and holds the cell the book opened on", () => {
    const pool = onePool();
    pool.uv[uvAt(0, 0) + UV.phase] = 1;

    const out = uvDraw();
    const book = { divisions: [4, 1] as const, frames: 4 };

    for (const rate of [0, -10]) {
      pool.uv[uvAt(0, 0) + UV.frameRate] = rate;
      uvTransformInto(pool, 0, layerOf({}, book), 0, 0.25, 0.25, 0, out);
      expect(out.cellU).toBe(0.25);
    }
  });

  it("reads the second layer's own slots rather than the first's", () => {
    const pool = onePool();
    pool.uv[uvAt(0, 0) + UV.birthOffsetX] = 0.25;
    pool.uv[uvAt(0, 1) + UV.birthOffsetX] = 0.75;

    const out = uvDraw();
    uvTransformInto(pool, 0, layerOf({ addressMode: ADDRESS_MODE.clamp }), 1, 0, 0, 0, out);

    expect(out.offsetU).toBe(0.75);
  });
});

describe("cellSize", () => {
  it("is the reciprocal of the grid the texture is cut into", () => {
    expect(cellSize(layerOf({}, { divisions: [4, 2] }))).toEqual([0.25, 0.5]);
  });

  it("is the whole texture for a layer that names no grid", () => {
    expect(cellSize(plainUvLayer())).toEqual([1, 1]);
  });

  it("refuses to divide by a grid of nothing", () => {
    expect(cellSize(layerOf({}, { divisions: [0, 0] }))).toEqual([1, 1]);
  });
});

describe("uvRowsInto", () => {
  it("states the layer's transform, placed in its cell, as two rows over (u, v, 1)", () => {
    const layer = layerOf({ center: [0.4, 0.6], flipU: true }, { divisions: [2, 1] });
    const draw = {
      turn: 0.3,
      scaleU: 0.8,
      scaleV: 1.2,
      offsetU: 0.1,
      offsetV: -0.2,
      cellU: 0.5,
      cellV: 0,
    };
    /* The quad fragment's `layerUv`, then the cell. */
    const atlas = (u: number, v: number) => {
      const placedU = (u - 0.4) * 0.8;
      const placedV = (v - 0.6) * 1.2;
      const turnedU = placedU * Math.cos(0.3) - placedV * Math.sin(0.3) + 0.4 + 0.1;
      const turnedV = placedU * Math.sin(0.3) + placedV * Math.cos(0.3) + 0.6 - 0.2;
      return [0.5 + (1 - turnedU) * 0.5, turnedV];
    };

    const rows = new Float32Array(8);
    uvRowsInto(draw, layer, rows);

    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [0.3, 0.9],
      [2, -1],
    ] as const) {
      const [x = 0, y = 0] = atlas(u, v);
      expect(rows[0] * u + rows[1] * v + rows[2]).toBeCloseTo(x, 5);
      expect(rows[4] * u + rows[5] * v + rows[6]).toBeCloseTo(y, 5);
    }
    expect([rows[3], rows[7]]).toEqual([0, 0]);
  });
});
