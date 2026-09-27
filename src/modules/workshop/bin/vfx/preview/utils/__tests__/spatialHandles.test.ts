import { describe, expect, it } from "vitest";

import { nameHash } from "../../../../shared/utils/binHash";
import type { Point } from "../../../engine/model/rig";
import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
import {
  handleBlock,
  handleEdit,
  handlePoint,
  pointValue,
  scaleValue,
  withHandleValue,
} from "../spatialHandles";

const BASE: Point = [10, 20, 30];

describe("spatialHandles", () => {
  it("blocks a handle on an animated value or a shape that lacks it", () => {
    const keyed = {
      constant: [0, 0, 0],
      keys: [{ time: 0, values: [0, 0, 0] }],
      tables: [],
    };

    expect(handleBlock("position", emitterOf(0, { emitterPosition: keyed }))).toBe("animated");
    expect(handleBlock("position", emitterOf(0))).toBeNull();
    expect(handleBlock("size", emitterOf(0))).toBe("noShape");
    expect(
      handleBlock("size", emitterOf(0, { shape: { kind: "sphere", radius: 5, volume: false } })),
    ).toBeNull();
    expect(handleBlock("emit", emitterOf(0))).toBeNull();
  });

  it("reads back the value a translate handle stands for", () => {
    const emitter = emitterOf(0, {
      shape: { kind: "point", offset: [1, 2, 3] },
      birthVelocity: flat(0, 100, 0),
    });

    for (const kind of ["emit", "velocity"] as const) {
      const at = handlePoint(kind, emitter, BASE, 2);
      const value = pointValue(kind, emitter, at, BASE, 2);
      const back = withHandleValue(kind, emitter, value);

      expect(handlePoint(kind, back, BASE, 2)).toEqual(at);
    }
    expect(handlePoint("velocity", emitter, BASE, 2)).toEqual([11, 222, 33]);
  });

  it("moves the emitter position by the handle's own travel", () => {
    const emitter = emitterOf(0, { emitterPosition: flat(4, 5, 6) });

    expect(pointValue("position", emitter, [11, 20, 30], BASE, 1)).toEqual([5, 5, 6]);
  });

  it("takes a sphere's radius off the axis dragged furthest, and a cylinder's height off up", () => {
    const sphere = { kind: "sphere", radius: 2, volume: false } as const;
    const cylinder = { kind: "cylinder", radius: 2, height: 4, volume: false } as const;

    expect(scaleValue(sphere, [2, 5, 2], [2, 2, 2])).toEqual([5, 5, 5]);
    expect(scaleValue(cylinder, [3, 6, 2], [2, 4, 2])).toEqual([3, 6, 3]);
  });

  it("writes a value family's constant, and a shape's own fields under its pointer", () => {
    const position = handleEdit("position", emitterOf(0), [1, 2, 3]);
    const size = handleEdit(
      "size",
      emitterOf(0, { shape: { kind: "cylinder", radius: 1, height: 1, volume: false } }),
      [3, 7, 3],
    );

    expect(position.field).toBe(nameHash("EmitterPosition"));
    expect(position.edits.at(-1)).toEqual({
      type: "setLeaf",
      path: nameHash("constantValue").slice(2),
      value: { type: "vector", values: [1, 2, 3] },
    });
    expect(size.field).toBe(nameHash("SpawnShape"));
    expect(size.edits).toContainEqual({
      type: "setLeaf",
      path: nameHash("height").slice(2),
      value: { type: "float", value: 7 },
    });
  });
});
