import { describe, expect, it } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import type { ProbabilityTable, ValueMark } from "../../../values/utils/valueRows";
import { type ChannelDraw, randomDraw, tableShape } from "../randomDraw";
import {
  addRandomEdits,
  shapeKeys,
  tableEdits,
  type TableKey,
  withKey,
  withReach,
  withSpan,
} from "../randomEdits";

const TABLES = nameHash("probabilityTables").slice(2);
const TIMES = nameHash("keyTimes").slice(2);
const VALUES = nameHash("keyValues").slice(2);

function channel(base: number, keys: [number, number][]): ChannelDraw {
  const table: ProbabilityTable = {
    channel: 0,
    single: 1,
    keys: keys.map(([time, value]) => ({ time, values: [value] })),
  };
  const mark: ValueMark = {
    family: "scalar",
    constant: { type: "float", value: base },
    keys: [],
    tables: [table],
    curve: true,
    slots: 1,
  };
  return randomDraw(mark)!.channels[0]!;
}

const factors = (keys: readonly TableKey[]) => keys.map((key) => key.factor);

describe("withSpan", () => {
  it("writes a result range as the factors over the base", () => {
    const keys = withSpan(
      [
        { time: 0, factor: 1 },
        { time: 1, factor: 2 },
      ],
      -600,
      { least: -1200, most: -300 },
    );

    expect(factors(keys)).toEqual([0.5, 2]);
  });

  it("stretches a custom table's keys and keeps their shape", () => {
    const keys = withSpan(
      [
        { time: 0, factor: 0 },
        { time: 0.8, factor: 0.5 },
        { time: 1, factor: 1 },
      ],
      10,
      { least: 0, most: 20 },
    );

    expect(factors(keys)).toEqual([0, 1, 2]);
  });

  it("opens a fixed table into a uniform range", () => {
    const keys = withSpan(
      [
        { time: 0, factor: 1 },
        { time: 1, factor: 1 },
      ],
      4,
      { least: 2, most: 8 },
    );

    expect(keys).toEqual([
      { time: 0, factor: 0.5 },
      { time: 1, factor: 2 },
    ]);
  });
});

describe("withReach", () => {
  it("moves both halves of a split together, each keeping its sign", () => {
    const keys = withReach(
      shapeKeys(
        channel(10, [
          [0, 1],
          [1, 2],
        ]),
        "split",
      ),
      10,
      {
        least: 5,
        most: 30,
      },
    );

    expect(factors(keys)).toEqual([-3, -0.5, 0.5, 3]);
  });
});

describe("shapeKeys", () => {
  it("opens a fixed channel a quarter either side into a range", () => {
    expect(
      factors(
        shapeKeys(
          channel(5, [
            [0, 1],
            [1, 1],
          ]),
          "uniform",
        ),
      ),
    ).toEqual([0.75, 1.25]);
  });

  it("gives a split a step the reading names a split", () => {
    const keys = shapeKeys(
      channel(5, [
        [0, 1],
        [1, 2],
      ]),
      "split",
    );
    const table: ProbabilityTable = {
      channel: 0,
      single: 1,
      keys: keys.map((key) => ({ time: key.time, values: [key.factor] })),
    };

    expect(factors(keys)).toEqual([-2, -1, 1, 2]);
    expect(tableShape(table)).toBe("split");
  });
});

describe("withKey", () => {
  it("keeps the keys in chance order", () => {
    const keys = withKey(
      [
        { time: 0, factor: 1 },
        { time: 0.5, factor: 2 },
        { time: 1, factor: 3 },
      ],
      0,
      { time: 0.75, factor: 1 },
    );

    expect(keys.map((key) => key.time)).toEqual([0.5, 0.75, 1]);
  });
});

describe("tableEdits", () => {
  it("sets the keys it keeps, inserts the ones it adds and removes the rest last first", () => {
    const grown = tableEdits(1, 1, [
      { time: 0, factor: 1 },
      { time: 1, factor: 2 },
    ]);
    const shrunk = tableEdits(1, 3, [{ time: 0, factor: 1 }]);

    expect(grown).toContainEqual({
      type: "insertItem",
      path: `${TABLES}[1].${TIMES}`,
      item: { index: 1, key: null, class: null },
    });
    expect(grown).toContainEqual({
      type: "setLeaf",
      path: `${TABLES}[1].${VALUES}[1]`,
      value: { type: "float", value: 2 },
    });
    expect(shrunk?.filter((edit) => edit.type === "removeItem").map((edit) => edit.path)).toEqual([
      `${TABLES}[1].${TIMES}[2]`,
      `${TABLES}[1].${VALUES}[2]`,
      `${TABLES}[1].${TIMES}[1]`,
      `${TABLES}[1].${VALUES}[1]`,
    ]);
  });

  it("refuses a key no float holds", () => {
    expect(tableEdits(0, 0, [{ time: 0, factor: Number.POSITIVE_INFINITY }])).toBeNull();
  });
});

describe("addRandomEdits", () => {
  it("gives every slot of the set a fixed table", () => {
    const edits = addRandomEdits(3);

    expect(edits[0]).toEqual({
      type: "ensureProperty",
      path: "",
      field: nameHash("probabilityTables"),
    });
    expect(edits.filter((edit) => edit.type === "ensurePointer").map((edit) => edit.path)).toEqual([
      `${TABLES}[0]`,
      `${TABLES}[1]`,
      `${TABLES}[2]`,
    ]);
  });
});
