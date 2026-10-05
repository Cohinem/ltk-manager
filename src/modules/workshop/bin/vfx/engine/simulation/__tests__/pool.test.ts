import { describe, expect, it } from "vitest";

import {
  copyRows,
  createPool,
  FRAME_SLOTS,
  liveByteLength,
  NOT_LINGERING,
  type Pool,
  retire,
  rowsByteLength,
  spawn,
  UV,
  UV_LAYERS,
  UV_SLOTS,
  uvAt,
  writeRows,
} from "../pool";

function fill(pool: Pool, count: number): void {
  for (let at = 0; at < count; at += 1) spawn(pool, at, at, 1 + at, at / 10);
}

type Column = Int32Array | Uint32Array | Uint8Array | Float32Array;

/** Every column of `pool` by name, which is each of its fields that is not a count. */
function columnsOf(pool: Pool): [string, Column][] {
  return Object.entries(pool).filter(
    (entry): entry is [string, Column] => typeof entry[1] !== "number",
  );
}

/** The numbers every column holds for the particle at `at`, by the column's name. */
function rowOf(pool: Pool, at: number): Record<string, number[]> {
  const row: Record<string, number[]> = {};
  for (const [name, column] of columnsOf(pool)) {
    const width = column.length / pool.capacity;
    row[name] = Array.from(column.subarray(at * width, (at + 1) * width));
  }
  return row;
}

/** Every number of the particle at `at` set apart from every default, a different one per slot. */
function mark(pool: Pool, at: number): void {
  for (const [, column] of columnsOf(pool)) {
    const width = column.length / pool.capacity;
    for (let slot = 0; slot < width; slot += 1) column[at * width + slot] = 2 + slot;
  }
}

describe("createPool", () => {
  it("sizes every array to the capacity, three wide for a vector and four for a colour", () => {
    const pool = createPool(4);

    expect(pool.count).toBe(0);
    expect(pool.emitter).toHaveLength(4);
    expect(pool.birthTime).toHaveLength(4);
    expect(pool.position).toHaveLength(12);
    expect(pool.velocity).toHaveLength(12);
    expect(pool.birthScale).toHaveLength(12);
    expect(pool.birthColor).toHaveLength(16);
  });

  it("holds a flag, a matrix translation, an anchor and a carried travel for each particle", () => {
    const pool = createPool(4);

    expect(pool.fresh).toHaveLength(4);
    expect(pool.birthAcceleration).toHaveLength(12);
    expect(pool.birthRotation).toHaveLength(12);
    expect(pool.placed).toHaveLength(12);
    expect(pool.drift).toHaveLength(12);
    expect(pool.anchor).toHaveLength(12);
    expect(pool.bound).toHaveLength(12);
    expect(pool.frame).toHaveLength(4 * FRAME_SLOTS);
  });

  it("holds seven birth numbers for each of a particle's two layers", () => {
    const pool = createPool(4);

    expect(UV_SLOTS).toBe(7);
    expect(Object.values(UV).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(pool.uv).toHaveLength(4 * UV_LAYERS * UV_SLOTS);
    expect(uvAt(0, 1)).toBe(7);
    expect(uvAt(3, 0)).toBe(42);
  });
});

describe("spawn", () => {
  it("numbers each particle in birth order, and keeps counting past a retire", () => {
    const pool = createPool(4);
    fill(pool, 3);
    retire(pool, 0);
    spawn(pool, 9, 5, 1, 0);

    expect(Array.from(pool.serial.subarray(0, 3))).toEqual([2, 1, 3]);
    expect(pool.born).toBe(4);
  });

  it("packs the live particles at the front, in the order they were born", () => {
    const pool = createPool(8);

    expect(spawn(pool, 3, 1.5, 2, 0.25)).toBe(0);
    expect(spawn(pool, 4, 1.5, 2, 0.75)).toBe(1);
    expect(pool.count).toBe(2);
    expect(Array.from(pool.emitter.subarray(0, 2))).toEqual([3, 4]);
    expect(pool.birthTime[0]).toBeCloseTo(1.5, 6);
    expect(pool.roll[1]).toBeCloseTo(0.75, 6);
  });

  it("starts a particle at the origin, at rest, at the identity of both products", () => {
    const pool = createPool(2);
    const at = spawn(pool, 0, 0, 1, 0);

    expect(at).toBe(0);
    expect(Array.from(pool.position.subarray(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(pool.velocity.subarray(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(pool.birthScale.subarray(0, 3))).toEqual([1, 1, 1]);
    expect(Array.from(pool.birthColor.subarray(0, 4))).toEqual([1, 1, 1, 1]);
    expect(Array.from(pool.frame.subarray(0, 9))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("scrubs the slot a retired particle left behind", () => {
    const pool = createPool(2);
    spawn(pool, 0, 0, 1, 0);
    pool.position.set([5, 5, 5], 0);
    retire(pool, 0);

    expect(spawn(pool, 0, 0, 1, 0)).toBe(0);
    expect(Array.from(pool.position.subarray(0, 3))).toEqual([0, 0, 0]);
  });

  it("scrubs every column of that slot, so a birth reads nothing of the last particle", () => {
    const used = createPool(2);
    spawn(used, 0, 0, 1, 0);
    mark(used, 0);
    retire(used, 0);
    spawn(used, 3, 1.5, 2, 0.25);

    /* The same two births over a slot nothing wrote to, so the serials agree. */
    const clean = createPool(2);
    spawn(clean, 0, 0, 1, 0);
    retire(clean, 0);
    spawn(clean, 3, 1.5, 2, 0.25);

    expect(rowOf(used, 0)).toEqual(rowOf(clean, 0));
  });

  it("marks a newborn as born this step, standing nowhere and not lingering", () => {
    const pool = createPool(2);
    spawn(pool, 0, 0, 1, 0);

    expect(pool.fresh[0]).toBe(1);
    expect(pool.lingerFrom[0]).toBe(NOT_LINGERING);
    expect(Array.from(pool.placed.subarray(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(pool.drift.subarray(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(pool.anchor.subarray(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(pool.bound.subarray(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(pool.birthAcceleration.subarray(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(pool.birthRotation.subarray(0, 3))).toEqual([0, 0, 0]);
  });

  it("keeps the lifetime of a particle that never expires", () => {
    const pool = createPool(2);
    spawn(pool, 0, 0, Infinity, 0);

    expect(pool.lifetime[0]).toBe(Infinity);
  });

  it("refuses a spawn once the pool is full", () => {
    const pool = createPool(2);
    fill(pool, 2);

    expect(spawn(pool, 9, 0, 1, 0)).toBeNull();
    expect(pool.count).toBe(2);
  });
});

describe("retire", () => {
  it("swaps the last live particle into the slot it frees", () => {
    const pool = createPool(4);
    fill(pool, 4);
    retire(pool, 1);

    expect(pool.count).toBe(3);
    expect(Array.from(pool.emitter.subarray(0, 3))).toEqual([0, 3, 2]);
    expect(pool.lifetime[1]).toBeCloseTo(4, 6);
    expect(pool.roll[1]).toBeCloseTo(0.3, 6);
  });

  it("carries every array of the swapped particle across, one index per particle", () => {
    const pool = createPool(2);
    fill(pool, 2);
    pool.position.set([1, 2, 3], 3);
    pool.velocity.set([4, 5, 6], 3);
    pool.birthScale.set([7, 8, 9], 3);
    pool.birthColor.set([0.1, 0.2, 0.3, 0.4], 4);
    pool.frame.set([0, 0, 1, 0, 1, 0, -1, 0, 0], 9);
    retire(pool, 0);

    expect(Array.from(pool.position.subarray(0, 3))).toEqual([1, 2, 3]);
    expect(Array.from(pool.velocity.subarray(0, 3))).toEqual([4, 5, 6]);
    expect(Array.from(pool.birthScale.subarray(0, 3))).toEqual([7, 8, 9]);
    expect(Array.from(pool.frame.subarray(0, 9))).toEqual([0, 0, 1, 0, 1, 0, -1, 0, 0]);
    expect(Array.from(pool.birthColor.subarray(0, 4)).map((c) => Math.round(c * 10))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("carries every column of the swapped particle, the ones a step rebuilds included", () => {
    const pool = createPool(2);
    fill(pool, 2);
    mark(pool, 1);
    const last = rowOf(pool, 1);

    retire(pool, 0);

    expect(rowOf(pool, 0)).toEqual(last);
  });

  it("drops the last particle without swapping anything into it", () => {
    const pool = createPool(3);
    fill(pool, 3);
    retire(pool, 2);

    expect(pool.count).toBe(2);
    expect(Array.from(pool.emitter.subarray(0, 2))).toEqual([0, 1]);
  });

  it("leaves the pool alone for an index no live particle holds", () => {
    const pool = createPool(3);
    fill(pool, 2);
    retire(pool, 2);
    retire(pool, -1);

    expect(pool.count).toBe(2);
  });
});

describe("copyRows", () => {
  it("copies the live rows of every column, and nothing past them", () => {
    const pool = createPool(4);
    fill(pool, 2);
    mark(pool, 1);
    mark(pool, 2);

    const rows = copyRows(pool);

    expect(rows.count).toBe(2);
    expect(rows.born).toBe(2);
    expect(rows.columns).toHaveLength(columnsOf(pool).length);
    columnsOf(pool).forEach(([, column], at) => {
      const width = column.length / pool.capacity;
      expect(Array.from(rows.columns[at])).toEqual(Array.from(column.subarray(0, 2 * width)));
    });
  });

  it("holds the bytes the live rows were measured at before the copy", () => {
    const pool = createPool(8);
    fill(pool, 3);

    expect(rowsByteLength(copyRows(pool))).toBe(liveByteLength(pool));
    expect(liveByteLength(createPool(8))).toBe(0);
  });

  it("stands a pool back where the rows were taken, whatever it has done since", () => {
    const pool = createPool(4);
    fill(pool, 3);
    mark(pool, 1);
    const rows = copyRows(pool);
    const held = [rowOf(pool, 0), rowOf(pool, 1), rowOf(pool, 2)];

    retire(pool, 0);
    spawn(pool, 9, 5, 1, 0.5);
    mark(pool, 0);
    writeRows(pool, rows);

    expect(pool.count).toBe(3);
    expect(pool.born).toBe(3);
    expect([rowOf(pool, 0), rowOf(pool, 1), rowOf(pool, 2)]).toEqual(held);
  });
});
