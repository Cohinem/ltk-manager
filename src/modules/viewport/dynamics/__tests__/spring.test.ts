import { describe, expect, it } from "vitest";

import { axisAngleInto, UP, yawOf } from "../math";
import type { SpringModel } from "../model";
import { applySpringInto, buildSpring, springRests, stepSpring } from "../spring";
import { bindLocals, composeWorldInto, createRoot, createWorldPose, parentsFirst } from "../world";
import { joint, parentsOf, skeletonOf } from "./fixtures";

/** A root and a pauldron beside it. */
const ARMOURED = skeletonOf(joint("Root", -1, [0, 100, 0]), joint("Pauldron", 0, [20, 0, 0]));
const PARENTS = parentsOf(ARMOURED);
const ORDER = parentsFirst(PARENTS);
const DT = 1 / 60;

function spring(over: Partial<SpringModel> = {}): SpringModel {
  return {
    joint: 1,
    name: null,
    mass: 0.1,
    stiffness: 2.5,
    damping: 1,
    doTranslation: false,
    doRotation: true,
    maxDistance: 0,
    maxAngle: 0,
    invert: false,
    defaultOn: true,
    ...over,
  };
}

/** A spring past its warm-up under a unit that has not moved. */
function warmed(model: SpringModel) {
  const rig = buildSpring(model);
  const root = createRoot();
  stepSpring(rig, root, DT);
  stepSpring(rig, root, DT);
  return { rig, root };
}

/** How far the pauldron is turned about the up axis in the world, with `angle` on the spring. */
function turnedBy(model: SpringModel, angle: number, weight: number, unitYaw: number): number {
  const rig = buildSpring(model);
  rig.angle = angle;
  const root = createRoot();
  axisAngleInto(root.rotation, 0, UP, 0, unitYaw);
  const locals = bindLocals(ARMOURED);
  const world = createWorldPose(PARENTS.length);

  composeWorldInto(world, locals, PARENTS, ORDER, root);
  applySpringInto(rig, world, PARENTS, root, weight, locals);
  composeWorldInto(world, locals, PARENTS, ORDER, root);
  return yawOf(world.rotations.subarray(4, 8));
}

describe("stepSpring", () => {
  it("rests under a unit that stands still", () => {
    const { rig, root } = warmed(spring({ doTranslation: true }));

    stepSpring(rig, root, DT);

    expect(springRests(rig)).toBe(true);
  });

  it("takes a turn of the unit as its angle, the way the unit turned, and pulls it back", () => {
    const { rig, root } = warmed(spring());

    axisAngleInto(root.rotation, 0, UP, 0, 0.3);
    stepSpring(rig, root, DT);

    const spin = -(2.5 / 0.1) * 0.3 * DT;
    expect(rig.spin).toBeCloseTo(spin, 9);
    expect(rig.angle).toBeCloseTo(0.3 + spin * DT, 9);
    expect(springRests(rig)).toBe(false);
  });

  it("puts an angle past its limit back just inside it, at rest", () => {
    const { rig, root } = warmed(spring({ maxAngle: 10 }));

    axisAngleInto(root.rotation, 0, UP, 0, 0.3);
    stepSpring(rig, root, DT);

    expect(rig.angle).toBeCloseTo(((10 * Math.PI) / 180) * 0.99, 9);
    expect(rig.spin).toBe(0);
  });

  it("starts over when its values run away to no number", () => {
    /* A drag this far past what a step can take doubles the velocity many times a step. */
    const { rig, root } = warmed(spring({ doTranslation: true, doRotation: false, mass: 1e-6 }));

    for (let step = 1; step <= 400; step += 1) {
      root.position[0] = step;
      stepSpring(rig, root, DT);

      expect(Number.isFinite(rig.offset[0] + rig.velocity[0])).toBe(true);
    }
  });
});

describe("applySpringInto", () => {
  it("turns the joint about the up axis by the angle, on top of the unit's own turn", () => {
    expect(turnedBy(spring(), 0.2, 1, 0)).toBeCloseTo(0.2, 6);
    expect(turnedBy(spring(), 0.2, 1, 0.3)).toBeCloseTo(0.5, 6);
  });

  it("turns the other way when inverted, and by a part of the angle at a part of the weight", () => {
    expect(turnedBy(spring({ invert: true }), 0.2, 1, 0.3)).toBeCloseTo(0.1, 6);
    expect(turnedBy(spring(), 0.2, 0.5, 0.3)).toBeCloseTo(0.4, 6);
  });

  it("lays nothing over the joint at no weight", () => {
    expect(turnedBy(spring(), 0.2, 0, 0.3)).toBeCloseTo(0.3, 6);
  });
});
