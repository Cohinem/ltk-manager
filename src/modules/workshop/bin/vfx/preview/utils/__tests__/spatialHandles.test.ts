import { describe, expect, it } from "vitest";

import { nameHash } from "../../../../shared/utils/binHash";
import type { Point } from "../../../engine/model/rig";
import { emitterOf, flat } from "../../../engine/simulation/__tests__/emitterFixture";
import {
  handleBlock,
  handleEdit,
  handleMark,
  handlePoint,
  handleScale,
  handleScaleValue,
  isOverride,
  overrideEdit,
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

  it("draws the spawn shape for the shape handles and the birth points for the mesh scale", () => {
    expect(handleMark("size")).toBe("shape");
    expect(handleMark("emit")).toBe("shape");
    expect(handleMark("meshScale")).toBe("source");
    expect(handleMark("position")).toBeNull();
    expect(handleMark("velocity")).toBeNull();
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

  describe("the mesh scale handle", () => {
    const mesh = { mesh: { path: "ring.scb", asset: null }, scale: 2, useNormal: true };
    const surface = {
      kind: "mesh",
      mesh: null,
      skeleton: null,
      submeshes: [],
      joints: [],
      scale: 3,
      maxJointWeights: 4,
      useNormal: true,
    } as const;

    it("is blocked on an emitter with no emission mesh and no skinned mesh surface", () => {
      const bones = { ...surface, kind: "skeleton" } as const;

      expect(handleBlock("meshScale", emitterOf(0))).toBe("noMesh");
      expect(handleBlock("meshScale", emitterOf(0, { emissionSurface: bones }))).toBe("noMesh");
      expect(handleBlock("meshScale", emitterOf(0, { emissionMesh: mesh }))).toBeNull();
      expect(handleBlock("meshScale", emitterOf(0, { emissionSurface: surface }))).toBeNull();
    });

    it("starts at the emission mesh's scale, or at the surface's scale without an emission mesh", () => {
      const both = emitterOf(0, { emissionMesh: mesh, emissionSurface: surface });

      expect(handleScale("meshScale", both)).toEqual([2, 2, 2]);
      expect(handleScale("meshScale", emitterOf(0, { emissionSurface: surface }))).toEqual([
        3, 3, 3,
      ]);
    });

    it("uses the axis dragged furthest as the scale of all three axes", () => {
      const emitter = emitterOf(0, { emissionMesh: mesh });

      expect(handleScaleValue("meshScale", emitter, [2, 5, 2.5], [2, 2, 2])).toEqual([5, 5, 5]);
    });

    it("writes emissionMeshScale and sets the scale on the previewed emitter", () => {
      const emitter = emitterOf(0, { emissionMesh: mesh });

      expect(withHandleValue("meshScale", emitter, [4, 4, 4]).emissionMesh?.scale).toBe(4);
      expect(handleEdit("meshScale", emitter, [4, 4, 4])).toEqual({
        field: nameHash("emissionMeshScale"),
        edits: [{ type: "setLeaf", path: "", value: { type: "float", value: 4 } }],
      });
    });

    it("writes the surface's meshScale under the surface definition", () => {
      const emitter = emitterOf(0, { emissionSurface: surface });
      const part = nameHash("EmissionSurface").slice(2);
      const scale = nameHash("meshScale");

      expect(withHandleValue("meshScale", emitter, [4, 4, 4]).emissionSurface?.scale).toBe(4);
      expect(handleEdit("meshScale", emitter, [4, 4, 4])).toEqual({
        field: nameHash("emissionSurfaceDefinition"),
        edits: [
          { type: "ensureProperty", path: part, field: scale },
          {
            type: "setLeaf",
            path: `${part}.${scale.slice(2)}`,
            value: { type: "float", value: 4 },
          },
        ],
      });
    });
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

  it("writes a missing override at zero, which draws the emitter where it already is", () => {
    expect(isOverride("offset")).toBe(true);
    expect(isOverride("position")).toBe(false);
    expect(overrideEdit("offset")).toEqual({
      field: nameHash("translationOverride"),
      edits: [{ type: "setLeaf", path: "", value: { type: "vector", values: [0, 0, 0] } }],
    });
    expect(overrideEdit("turn").field).toBe(nameHash("rotationOverride"));
  });
});
