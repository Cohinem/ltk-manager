import { describe, expect, it } from "vitest";

import type { LeafValue, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import type { ProbabilityTable, ValueMark } from "../../../values/utils/valueRows";
import {
  type RandomEnds,
  randomEnds,
  randomizeEdits,
  unrandomizeEdits,
  valueMode,
} from "../randomizer";

const VECTOR3 = nameHash("ValueVector3");
const TABLES = nameHash("probabilityTables").slice(2);
const VALUES = nameHash("values").slice(2);
const KEY_TIMES = nameHash("keyTimes").slice(2);
const KEY_VALUES = nameHash("keyValues").slice(2);

function mark(over: Partial<ValueMark> = {}): ValueMark {
  return {
    family: "vector",
    constant: { type: "vector", values: [0, 0, 0] },
    keys: [],
    tables: [],
    curve: false,
    slots: 0,
    ...over,
  };
}

/** The mark a reader sees once `edits` land on a flat curve: its base and its tables. */
function landed(edits: readonly ValueEdit[]): ValueMark {
  const leaves = new Map(
    edits.flatMap((edit) => (edit.type === "setLeaf" ? [[edit.path, edit.value] as const] : [])),
  );
  const number = (value: LeafValue | undefined) =>
    value?.type === "float" ? (value.value ?? 0) : 0;
  const base = leaves.get(`${VALUES}[0]`);
  const tables: ProbabilityTable[] = [0, 1, 2].map((channel) => {
    const keys = [];
    for (let at = 0; leaves.has(`${TABLES}[${channel}].${KEY_TIMES}[${at}]`); at += 1) {
      keys.push({
        time: number(leaves.get(`${TABLES}[${channel}].${KEY_TIMES}[${at}]`)),
        values: [number(leaves.get(`${TABLES}[${channel}].${KEY_VALUES}[${at}]`))],
      });
    }
    return { channel, single: 1, keys };
  });
  const values = base?.type === "vector" ? base.values.map((each) => each ?? 0) : [];
  return mark({ curve: true, keys: [{ time: 0, values }], tables, slots: 3 });
}

describe("valueMode", () => {
  it("reads no curve as constant, a flat curve with tables as random, and the rest as a curve", () => {
    const table = { channel: 0, single: 1, keys: [] };

    expect(valueMode(mark())).toBe("constant");
    expect(valueMode(mark({ curve: true, keys: [{ time: 0, values: [1, 1, 1] }] }))).toBe("curve");
    expect(
      valueMode(
        mark({ curve: true, keys: [{ time: 0, values: [1, 1, 1] }], tables: [table], slots: 3 }),
      ),
    ).toBe("random");
  });
});

describe("randomizeEdits", () => {
  it("writes the end farther from 0 as the base, and the table over it", () => {
    const ends: RandomEnds = {
      min: [-1200, 100, 0],
      max: [-510, 400, 0],
      sign: [false, false, false],
    };
    const written = landed(randomizeEdits(mark(), VECTOR3, ends) ?? []);

    expect(written.keys[0]?.values).toEqual([-1200, 400, 0]);
    expect(written.tables[1]?.keys.map((key) => key.values[0])).toEqual([0.25, 1]);
    expect(randomEnds(written)).toEqual(ends);
  });

  it("gives a random sign both halves of one step", () => {
    const ends: RandomEnds = { min: [2, 0, 0], max: [8, 0, 0], sign: [true, false, false] };
    const written = landed(randomizeEdits(mark(), VECTOR3, ends) ?? []);

    expect(written.tables[0]?.keys.map((key) => key.values[0])).toEqual([-1, -0.25, 0.25, 1]);
    expect(randomEnds(written)).toEqual(ends);
  });

  it("gives a value with no curve one first", () => {
    const edits = randomizeEdits(mark(), VECTOR3, {
      min: [1, 1, 1],
      max: [1, 1, 1],
      sign: [false, false, false],
    });

    expect(edits?.[0]).toMatchObject({ type: "ensurePointer", path: "" });
  });
});

describe("unrandomizeEdits", () => {
  it("clears every table slot back to null", () => {
    const tables = [0, 1].map((channel) => ({ channel, single: 1, keys: [] }));

    expect(unrandomizeEdits(mark({ tables }))).toEqual([
      { type: "replacePointer", path: `${TABLES}[0]`, class: null },
      { type: "replacePointer", path: `${TABLES}[1]`, class: null },
    ]);
  });
});
