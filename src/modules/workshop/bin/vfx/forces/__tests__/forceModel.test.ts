import { Matrix4, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import type { LeafEdit } from "../../../tree/hooks/useLeafEdit";
import { emitterOf, flat } from "../../engine/simulation/__tests__/emitterFixture";
import type { DrawFrame } from "../../engine/simulation/particleRead";
import { addForceEdits, commitForceValue, validForceValue } from "../forceEdits";
import { forceDirectionFrame, forceHandle, forceHandleValue, forceOrigin } from "../forceGeometry";
import { FORCE_DEFINITIONS, forceValue } from "../forceModel";
import { previewForceValue, projectForces } from "../forcePreview";
import { forceOf, forceSystem, struct, vector } from "./forceFixture";

describe("typed force edits", () => {
  it("models all five force types with their exact editable fields", () => {
    expect(FORCE_DEFINITIONS.map(({ kind }) => kind)).toEqual([
      "acceleration",
      "attraction",
      "noise",
      "drag",
      "orbital",
    ]);
    const orbit = forceOf("orbital");
    expect(orbit.definition.properties.map(({ name }) => name)).toEqual([
      "direction",
      "isLocalSpace",
    ]);
    expect(forceValue(orbit, orbit.definition.properties[0])).toMatchObject({
      value: [0, 1, 0],
      authored: false,
      valid: true,
    });
  });

  it("appends a force through a single batch without rebuilding sibling lists", () => {
    const edits = addForceEdits(FORCE_DEFINITIONS[0]);
    expect(edits.map(({ type }) => type)).toEqual([
      "ensurePointer",
      "ensureProperty",
      "insertItem",
    ]);
    expect(edits[2]).toMatchObject({
      item: { index: null, class: "VfxFieldAccelerationDefinitionData" },
    });
  });

  it("writes an existing constant at its exact address", async () => {
    const force = forceOf("acceleration", { acceleration: vector(1, 2, 3) });
    const commit = vi.fn().mockResolvedValue(true);
    const edit: LeafEdit = { commit, refused: new Map() };

    await expect(
      commitForceValue(edit, force, force.definition.properties[0], [4, 5, 6]),
    ).resolves.toBe(true);
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `${force.row.path}.${nameHash("acceleration").slice(2)}.${nameHash("constantValue").slice(2)}`,
      }),
      { ok: true, leaf: { type: "vector", values: [4, 5, 6] } },
    );
  });

  it("creates an absent value and constant in one undoable operation", async () => {
    const force = forceOf("acceleration");
    const editProperty = vi.fn().mockResolvedValue(true);
    const edit: LeafEdit = { commit: vi.fn(), editProperty, refused: new Map() };

    await expect(
      commitForceValue(edit, force, force.definition.properties[0], [1, 2, 3]),
    ).resolves.toBe(true);
    expect(editProperty).toHaveBeenCalledWith(force.row, nameHash("acceleration"), [
      { type: "ensureProperty", path: "", field: nameHash("constantValue") },
      {
        type: "setLeaf",
        path: nameHash("constantValue").slice(2),
        value: { type: "vector", values: [1, 2, 3] },
      },
    ]);
  });

  it("rejects wrong shapes and float overflow before saving", () => {
    const property = FORCE_DEFINITIONS[0].properties[0];
    expect(validForceValue(property, [1, 2])).toBe(false);
    expect(validForceValue(property, [Infinity, 0, 0])).toBe(false);
    expect(validForceValue(property, [1e100, 0, 0])).toBe(false);
    expect(validForceValue(property, true)).toBe(false);
    expect(
      forceValue(forceOf("acceleration", { acceleration: struct("ValueFloat") }), property).valid,
    ).toBe(false);
  });
});

describe("force preview isolation", () => {
  it("mutes contributions without changing list order or noise clocks", () => {
    const system = forceSystem();
    const projected = projectForces(system, new Set(["0:noise:0"]), null);
    const fields = projected.emitters[0].fields!;

    expect(fields.noise).toHaveLength(2);
    expect(fields.noise[0].velocityDelta.constant).toEqual([0]);
    expect(fields.noise[0].frequency).toBe(system.emitters[0].fields!.noise[0].frequency);
    expect(fields.noise[1]).toBe(system.emitters[0].fields!.noise[1]);
    expect(system.emitters[0].fields!.noise[0].velocityDelta.constant).toEqual([4]);
  });

  it("solos one force across every force kind", () => {
    const system = projectForces(forceSystem(), new Set(), "0:attraction:0");
    const fields = system.emitters[0].fields!;
    expect(fields.attraction[0].acceleration.constant).toEqual([6]);
    expect(fields.acceleration[0].acceleration.constant).toEqual([0, 0, 0]);
    expect(fields.drag[0].strength.constant).toEqual([0]);
    expect(fields.orbital[0].direction.constant).toEqual([0, 0, 0]);
    expect(fields.noise[1].velocityDelta.constant).toEqual([0]);
  });

  it("changes one preview value without altering the source or its siblings", () => {
    const system = forceSystem();
    const preview = previewForceValue(system, forceOf("attraction"), "Position", [8, 9, 10]);
    expect(preview.emitters[0].fields!.attraction[0].position.constant).toEqual([8, 9, 10]);
    expect(system.emitters[0].fields!.attraction[0].position.constant).toEqual([1, 2, 3]);
    expect(preview.emitters[0].fields!.noise).toBe(system.emitters[0].fields!.noise);
  });
});

describe("force handles", () => {
  const frame: DrawFrame = {
    now: 0,
    phase: 0,
    origin: [10, 20, 30],
    orientation: new Float32Array([0, 0, 1, 0, 1, 0, -1, 0, 0]),
    worldAcceleration: new Float32Array(3),
  };
  const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

  it("does not apply spawn offsets to ordinary field origins", () => {
    const emitter = emitterOf(0, {
      translationOverride: [99, 99, 99],
      emitterPosition: flat(3, 4, 5),
    });
    expect(forceOrigin(emitter, frame, identity).toArray()).toEqual([-10, 20, 30]);
    expect(forceOrigin({ ...emitter, emitterSpace: true }, frame, identity).toArray()).toEqual([
      -15, 24, 27,
    ]);
  });

  it("roundtrips local acceleration endpoints through the viewport reflection", () => {
    const force = forceOf("acceleration");
    const direction = forceDirectionFrame(force, emitterOf(0), frame);
    const origin = new Vector3(-10, 20, 30);
    const endpoint = new Vector3(2, 3, 4).applyMatrix4(direction).add(origin);
    expect(forceHandleValue("acceleration", endpoint, origin, origin, direction)).toEqual([
      2, 3, 4,
    ]);
    expect(
      forceHandleValue("Position", new Vector3(-12, 25, 37), origin, origin, direction),
    ).toEqual([2, 5, 7]);
  });

  it("grows a zero radius without a singular scale transform", () => {
    const center = new Vector3(10, 20, 30);
    expect(
      forceHandleValue("radius", new Vector3(35, 20, 30), center, center, new Matrix4()),
    ).toEqual([25]);
    expect(
      forceHandleValue("radius", new Vector3(5, 20, 30), center, center, new Matrix4()),
    ).toEqual([0]);
    expect(forceHandle(forceOf("noise"), "axisFraction")).toBeNull();
  });
});
