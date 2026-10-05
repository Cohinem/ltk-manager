import { Matrix4, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import { nameHash } from "../../../shared/utils/binHash";
import type { LeafEdit } from "../../../tree/hooks/useLeafEdit";
import type { EmitterModel } from "../../engine/model/model";
import { emitterOf, flat } from "../../engine/simulation/__tests__/emitterFixture";
import { NO_TRANSFORM, type World } from "../../engine/simulation/integrate";
import type { DrawFrame } from "../../engine/simulation/particleRead";
import { addForceEdits, commitForceValue, validForceValue } from "../forceEdits";
import {
  forceDirectionFrame,
  forceFrame,
  forceHandle,
  forceHandleValue,
  forceOrigin,
  ORBIT_GUIDE_RADIUS,
} from "../forceGeometry";
import { FORCE_DEFINITIONS, forceValue, schemaForceDefault } from "../forceModel";
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
  /** The system facing `+X`: a quarter turn that takes `+X` to `-Z` and `+Z` to `+X`. */
  const QUARTER = new Float32Array([0, 0, 1, 0, 1, 0, -1, 0, 0]);

  function frameOf(emitter: EmitterModel, world: World = NO_TRANSFORM): DrawFrame {
    return { emitter, now: 0, phase: 0, origin: [10, 20, 30], orientation: QUARTER, world };
  }

  /** `actual` against `expected`, component by component. */
  function expectPoint(actual: ArrayLike<number>, expected: readonly number[]): void {
    expect(actual).toHaveLength(expected.length);
    expected.forEach((value, axis) => expect(actual[axis]).toBeCloseTo(value, 4));
  }

  /** Where `frame` puts `point`, as a direction with no origin. */
  const turned = (frame: Matrix4, point: readonly [number, number, number]) =>
    new Vector3(...point).applyMatrix4(frame).toArray();

  const bool = (value: boolean) => ({ type: "bool" as const, value });

  it("stands a field's origin at the origin of the emitter's own frame, mirrored into the viewport", () => {
    const emitter = emitterOf(0);

    expect(forceOrigin(emitter, frameOf(emitter)).toArray()).toEqual([-10, 20, 30]);
  });

  it("carries translationOverride in a field's origin, turned by the system alone", () => {
    const emitter = emitterOf(0, {
      translationOverride: [1, 2, 3],
      rotationOverride: [0, 90, 0],
      scaleOverride: [5, 5, 5],
    });

    /* The quarter turn takes `(1, 2, 3)` to `(3, 2, -1)`, and the viewport mirrors X. */
    expectPoint(forceOrigin(emitter, frameOf(emitter)).toArray(), [-13, 22, 29]);
    expectPoint(
      forceOrigin(
        { ...emitter, localOrientation: false },
        frameOf({ ...emitter, localOrientation: false }),
      ).toArray(),
      [-11, 22, 33],
    );
  });

  it("leaves EmitterPosition out of a field's origin, under IsEmitterSpace or not", () => {
    const emitter = emitterOf(0, { emitterPosition: flat(3, 4, 5) });
    const inSpace = { ...emitter, emitterSpace: true };

    expect(forceOrigin(emitter, frameOf(emitter)).toArray()).toEqual([-10, 20, 30]);
    expect(forceOrigin(inSpace, frameOf(inSpace)).toArray()).toEqual([-10, 20, 30]);
  });

  it("stands the transform's translation in a field's origin, and none of it on the HUD layer", () => {
    const emitter = emitterOf(0, { scaleOverride: [2, 1, 1] });
    const moved: World = { ...NO_TRANSFORM, offset: [5, 0, 0] };

    /* Doubled by the override to `(10, 0, 0)`, turned to `(0, 0, -10)` by the system. */
    expectPoint(forceOrigin(emitter, frameOf(emitter, moved)).toArray(), [-10, 20, 20]);
    expectPoint(
      forceOrigin(emitter, frameOf(emitter, { ...moved, hud: true })).toArray(),
      [-10, 20, 30],
    );
  });

  it("turns a field's Position by the emitter's own frame: its override under the system's turn", () => {
    const plain = emitterOf(0);
    const scaled = emitterOf(0, { scaleOverride: [2, 1, 1] });
    const unturned = emitterOf(0, { localOrientation: false, rotationOverride: [0, 90, 0] });

    expectPoint(turned(forceFrame(plain, frameOf(plain)), [1, 0, 0]), [0, 0, -1]);
    expectPoint(turned(forceFrame(plain, frameOf(plain)), [0, 0, 1]), [-1, 0, 0]);
    expectPoint(turned(forceFrame(scaled, frameOf(scaled)), [1, 0, 0]), [0, 0, -2]);
    expectPoint(turned(forceFrame(unturned, frameOf(unturned)), [1, 0, 0]), [0, 0, -1]);
    expectPoint(turned(forceFrame(unturned, frameOf(unturned)), [0, 0, 1]), [-1, 0, 0]);
  });

  it("takes the definition's transform into a field's frame, inside the override", () => {
    const emitter = emitterOf(0, { localOrientation: false, rotationOverride: [0, 90, 0] });
    const stretched: World = {
      ...NO_TRANSFORM,
      basis: new Float32Array([3, 0, 0, 0, 1, 0, 0, 0, 1]),
    };

    expectPoint(turned(forceFrame(emitter, frameOf(emitter, stretched)), [1, 0, 0]), [0, 0, -3]);
  });

  it("draws a local-space direction under the system's orientation, inside the emitter's frame", () => {
    const emitter = emitterOf(0, { localOrientation: true });
    const frame = frameOf(emitter);
    const place = forceFrame(emitter, frame);

    const local = forceDirectionFrame(forceOf("acceleration"), emitter, frame, place);

    /* The system's turn twice: once for the field's own flag, once as the emitter's frame. */
    expectPoint(turned(local, [1, 0, 0]), [1, 0, 0]);
    expectPoint(turned(local, [0, 0, 1]), [0, 0, -1]);
  });

  it("draws a direction in the emitter's frame alone where either local-space flag is off", () => {
    const worldSpace = forceOf("acceleration", { isLocalSpace: bool(false) });
    const emitter = emitterOf(0);
    const loose = emitterOf(0, { localOrientation: false });

    const place = forceFrame(emitter, frameOf(emitter));
    expect(forceDirectionFrame(worldSpace, emitter, frameOf(emitter), place).elements).toEqual(
      place.elements,
    );

    const unturned = forceFrame(loose, frameOf(loose));
    expect(
      forceDirectionFrame(forceOf("acceleration"), loose, frameOf(loose), unturned).elements,
    ).toEqual(unturned.elements);
    expectPoint(turned(unturned, [1, 2, 3]), [-1, 2, 3]);
  });

  it("draws an orbital field's unit axis at the guide's radius", () => {
    const emitter = emitterOf(0, { localOrientation: false });
    const frame = frameOf(emitter);

    const direction = forceDirectionFrame(
      forceOf("orbital"),
      emitter,
      frame,
      forceFrame(emitter, frame),
    );

    expectPoint(turned(direction, [0, 1, 0]), [0, ORBIT_GUIDE_RADIUS, 0]);
  });

  it("roundtrips local acceleration endpoints through the viewport reflection", () => {
    const force = forceOf("acceleration");
    const emitter = emitterOf(0, { scaleOverride: [2, 1, 1] });
    const frame = frameOf(emitter);
    const place = forceFrame(emitter, frame);
    const direction = forceDirectionFrame(force, emitter, frame, place);
    const origin = forceOrigin(emitter, frame);

    const endpoint = new Vector3(2, 3, 4).applyMatrix4(direction).add(origin);

    expectPoint(
      forceHandleValue("acceleration", endpoint, origin, origin, direction, place),
      [2, 3, 4],
    );
  });

  it("reads a dragged Position back through the emitter's frame rather than the direction's", () => {
    const force = forceOf("attraction");
    const emitter = emitterOf(0, { scaleOverride: [2, 1, 1] });
    const frame = frameOf(emitter);
    const place = forceFrame(emitter, frame);
    const direction = forceDirectionFrame(force, emitter, frame, place);
    const origin = forceOrigin(emitter, frame);

    /* `(2, 5, 7)` doubles to `(4, 5, 7)`, turns to `(7, 5, -4)` and mirrors to `(-7, 5, -4)`. */
    const point = new Vector3(2, 5, 7).applyMatrix4(place).add(origin);
    expectPoint(point.toArray(), [-17, 25, 26]);

    expectPoint(forceHandleValue("Position", point, origin, origin, direction, place), [2, 5, 7]);
    expectPoint(
      forceHandleValue("Position", point, origin, origin, new Matrix4().makeScale(9, 9, 9), place),
      [2, 5, 7],
    );
  });

  it("grows a zero radius without a singular scale transform", () => {
    const center = new Vector3(10, 20, 30);
    const none = new Matrix4();
    expect(forceHandleValue("radius", new Vector3(35, 20, 30), center, center, none, none)).toEqual(
      [25],
    );
    expect(forceHandleValue("radius", new Vector3(5, 20, 30), center, center, none, none)).toEqual([
      0,
    ]);
    expect(forceHandle(forceOf("noise"), "axisFraction")).toBeNull();
  });
});

describe("schemaForceDefault", () => {
  const attraction = FORCE_DEFINITIONS.find(({ kind }) => kind === "attraction")!;
  const property = (name: string) => attraction.properties.find((each) => each.name === name)!;

  it("reads an animated property's constant off the schema's constructor", () => {
    expect(
      schemaForceDefault(property("Position"), '{"constantValue":[0,5,0],"dynamics":null}'),
    ).toEqual([0, 5, 0]);
    expect(schemaForceDefault(property("radius"), '{"constantValue":2,"dynamics":null}')).toEqual([
      2,
    ]);
  });

  it("answers null where the schema holds no default of the property's shape", () => {
    expect(schemaForceDefault(property("radius"), null)).toBeNull();
    expect(schemaForceDefault(property("Position"), '{"constantValue":1}')).toBeNull();
  });
});
