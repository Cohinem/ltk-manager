import { describe, expect, it } from "vitest";

import { axisAngleInto, rotateInto } from "../math";
import type { OrientationModel, Vec3 } from "../model";
import { aimInto, applyOrientationInto, buildOrientation } from "../orientation";
import {
  bindLocals,
  composeWorldInto,
  createRoot,
  createWorldPose,
  LOCAL_FLOATS,
  parentsFirst,
} from "../world";
import { joint, parentsOf, skeletonOf } from "./fixtures";

/** A root, an arm on it standing 10 up, and a hand on the arm. */
const ARMED = skeletonOf(
  joint("Root", -1, [0, 0, 0]),
  joint("Arm", 0, [0, 10, 0]),
  joint("Hand", 1, [0, 0, -5]),
);
const PARENTS = parentsOf(ARMED);
const ORDER = parentsFirst(PARENTS);

function orientation(over: Partial<OrientationModel> = {}): OrientationModel {
  return {
    joints: [1],
    planeConstraint: 1,
    tiltAxis: 0,
    aimAxis: 3,
    aimNegated: true,
    flipped: false,
    maxAngle: 180,
    defaultOn: true,
    source: { vector: [1, 0, 0], position: false, rides: false },
    ...over,
  };
}

/** Where the rotation `aimInto` answers for `direction` carries `axis`. */
function carried(model: OrientationModel, direction: Vec3, axis: Vec3): number[] {
  const turn = aimInto(new Float64Array(4), buildOrientation(model), direction);
  const out = new Float64Array(3);
  rotateInto(out, 0, turn, 0, axis, 0);
  return Array.from(out, (value) => Math.round(value * 1000) / 1000 + 0);
}

/** The pose after one step of `model` at `weight`, with the unit turned `yaw` degrees. */
function stepped(model: OrientationModel, weight: number, yaw = 0) {
  const locals = bindLocals(ARMED);
  const world = createWorldPose(PARENTS.length);
  const root = createRoot();
  axisAngleInto(root.rotation, 0, [0, 1, 0], 0, (yaw * Math.PI) / 180);
  const compose = () => composeWorldInto(world, locals, PARENTS, ORDER, root);
  compose();
  applyOrientationInto(buildOrientation(model), world, PARENTS, root, weight, locals, compose);
  compose();
  return { locals, world };
}

/** Where joint `slot` points its `-z` axis in the world. */
function facing(world: ReturnType<typeof createWorldPose>, slot: number): number[] {
  const out = new Float64Array(3);
  rotateInto(out, 0, world.rotations, slot * 4, [0, 0, -1], 0);
  return Array.from(out, (value) => Math.round(value * 1000) / 1000 + 0);
}

describe("aimInto", () => {
  it("points the aim axis along a direction in its plane", () => {
    expect(carried(orientation(), [1, 0, 0], [0, 0, -1])).toEqual([1, 0, 0]);
    expect(carried(orientation(), [0, 0, 5], [0, 0, -1])).toEqual([0, 0, 1]);
  });

  it("points the positive axis where the aim is not negated", () => {
    expect(carried(orientation({ aimNegated: false }), [1, 0, 0], [0, 0, 1])).toEqual([1, 0, 0]);
  });

  it("turns no further than its limit", () => {
    const sine = Math.round(Math.sin((12 * Math.PI) / 180) * 1000) / 1000;
    const cosine = Math.round(Math.cos((12 * Math.PI) / 180) * 1000) / 1000;
    expect(carried(orientation({ maxAngle: 12 }), [1, 0, 0], [0, 0, -1])).toEqual([
      sine,
      0,
      -cosine,
    ]);
  });

  it("tilts its plane to hold a direction off it", () => {
    const along = Math.round(Math.SQRT1_2 * 1000) / 1000;
    expect(carried(orientation({ tiltAxis: 1 }), [0, 1, -1], [0, 0, -1])).toEqual([
      0,
      along,
      -along,
    ]);
  });

  it("takes an axis that is the plane's normal for no axis", () => {
    expect(carried(orientation({ aimAxis: 2 }), [1, 0, 0], [0, 0, -1])).toEqual([0, 0, -1]);
  });

  it("turns half way round the normal first when flipped", () => {
    expect(carried(orientation({ flipped: true, aimAxis: 0 }), [1, 0, 0], [0, 0, -1])).toEqual([
      0, 0, 1,
    ]);
  });
});

describe("applyOrientationInto", () => {
  it("turns the joint to the direction whatever its parent is turned to", () => {
    expect(facing(stepped(orientation(), 1).world, 1)).toEqual([1, 0, 0]);
    expect(facing(stepped(orientation(), 1, 70).world, 1)).toEqual([1, 0, 0]);
  });

  it("turns part of the way at part of the weight, and nothing at none", () => {
    const along = Math.round(Math.SQRT1_2 * 1000) / 1000;
    expect(facing(stepped(orientation(), 0.5).world, 1)).toEqual([along, 0, -along]);
    expect(facing(stepped(orientation(), 0).world, 1)).toEqual([0, 0, -1]);
  });

  it("turns each joint toward a place from where the joint stands", () => {
    const source = {
      vector: [10, 10, 0] as const,
      position: true,
      rides: false,
    };
    expect(facing(stepped(orientation({ source }), 1).world, 1)).toEqual([1, 0, 0]);
  });

  it("carries a source that rides the unit with the unit", () => {
    const source = {
      vector: [0, 0, -1] as const,
      position: false,
      rides: true,
    };
    expect(facing(stepped(orientation({ source }), 1, 90).world, 1)).toEqual([-1, 0, 0]);
  });

  it("turns a joint under an earlier joint of the list over the earlier joint's turn", () => {
    const { world } = stepped(orientation({ joints: [1, 2] }), 1);
    expect(facing(world, 2)).toEqual([1, 0, 0]);
  });

  it("turns nothing with no source and leaves the rest of the pose alone", () => {
    const { locals } = stepped(orientation({ source: null }), 1);
    expect(Array.from(locals)).toEqual(Array.from(bindLocals(ARMED)));
    const moved = stepped(orientation(), 1).locals;
    expect(Array.from(moved.subarray(0, LOCAL_FLOATS))).toEqual(
      Array.from(bindLocals(ARMED).subarray(0, LOCAL_FLOATS)),
    );
  });
});
