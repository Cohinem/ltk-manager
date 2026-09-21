import { Matrix4 } from "three";
import { describe, expect, it } from "vitest";

import type { VfxValue } from "@/lib/tauri";
import { createPose, type ClipModel, type SkeletonModel } from "@/modules/viewport";

import { nameHash } from "../../../shared/utils/binHash";
import { originAt } from "../../../vfx/engine/model/rig";
import { readVfxSystem } from "../../../vfx/engine/parsing/readVfxSystem";
import {
  abilityRecipeSchema,
  arrivalOf,
  readAbilities,
  type AbilityRecipe,
} from "../abilityRecipe";
import { abilityInstance, abilitySteps, measureAbility, oncePose } from "../abilitySequence";

const RECIPE: AbilityRecipe = {
  version: 1,
  id: "q",
  name: "Q",
  character: "Galio",
  clip: "q",
  bone: "hand",
  release: 0.5,
  castEffect: "cast",
  projectileEffect: "projectile",
  flightDuration: 1,
  impactEffect: "impact",
  impactDuration: 0.2,
  target: [500, 0, 0],
};
const SKELETON: SkeletonModel = {
  joints: [
    {
      name: "hand",
      hash: 1,
      parent: -1,
      translation: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      inverseBind: new Float32Array(new Matrix4().elements),
    },
  ],
  influences: new Uint32Array([0]),
};
const CLIP: ClipModel = {
  fps: 1,
  frames: 2,
  joints: new Uint32Array([1]),
  poses: new Float32Array([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 100, 0, 0, 0, 0, 0, 1, 1, 1, 1]),
};
const pose = oncePose(createPose(SKELETON, CLIP));

function system() {
  const struct = (name: string, fields: Record<string, VfxValue>): VfxValue => ({
    type: "struct",
    classHash: nameHash(name),
    class: name,
    object: null,
    fields: Object.entries(fields).map(([name, value]) => ({ name, hash: nameHash(name), value })),
  });
  const scalar = (value: number) =>
    struct("ValueFloat", { constantValue: { type: "number", value } });
  const root = struct("VfxSystemDefinitionData", {
    complexEmitterDefinitionData: {
      type: "container",
      items: [
        struct("VfxEmitterDefinitionData", { rate: scalar(60), particleLifetime: scalar(0.5) }),
      ],
    },
  });
  return readVfxSystem({
    materials: [],
    entry: "0x1",
    name: null,
    classHash: nameHash("VfxSystemDefinitionData"),
    class: "VfxSystemDefinitionData",
    root,
  });
}

describe("authored ability sequence", () => {
  it("captures the launch bone at release and follows it only during casting", () => {
    const [cast, missile, impact] = abilitySteps(RECIPE, pose, 2);
    expect(originAt(cast.rig.motion, 0.25)).toEqual([50, 0, 0]);
    expect(originAt(missile.rig.motion, 0)).toEqual([100, 0, 0]);
    expect(originAt(missile.rig.motion, 0.5)).toEqual([300, 0, 0]);
    expect(originAt(missile.rig.motion, 1)).toEqual(RECIPE.target);
    expect(impact.start).toBe(1.5);
    expect(originAt(impact.rig.motion, 0)).toEqual(RECIPE.target);
  });

  it("places a non-projectile impact at release and rejects a missing named bone", () => {
    const recipe = { ...RECIPE, projectileEffect: null };
    expect(arrivalOf(recipe)).toBe(0.5);
    expect(abilitySteps(recipe, pose, 1).map((step) => [step.id, step.start])).toEqual([
      ["cast", 0],
      ["impact", 0.5],
    ]);
    expect(() => abilitySteps({ ...recipe, bone: "missing" }, pose, 1)).toThrow("Missing bone");
  });

  it("holds the last animation pose through the particle tail", () => {
    const out = new Float32Array(10);
    pose.localsInto(5, out);
    expect(out[0]).toBeCloseTo(100, 2);
    pose.localsInto(0.25, out);
    expect(out[0]).toBe(25);
  });

  it("replays the same particles after seeking back across an event", () => {
    const step = { ...abilitySteps(RECIPE, pose, 1)[2], system: system() };
    const instance = abilityInstance(step);
    instance.sample(1.7);
    const expected = Array.from(instance.driver.pool.position);
    const count = instance.driver.pool.count;
    expect(count).toBeGreaterThan(0);
    instance.sample(0);
    expect(instance.driver.pool.count).toBe(0);
    instance.sample(1.7);
    expect(instance.driver.pool.count).toBe(count);
    expect(Array.from(instance.driver.pool.position)).toEqual(expected);
  });

  it("measures past the last action until its particles die and cancels obsolete scans", async () => {
    const steps = abilitySteps(RECIPE, pose, 1).map((step) => ({ ...step, system: system() }));
    const end = await measureAbility(steps, pose.duration, new AbortController().signal);
    expect(end.limited).toBe(false);
    expect(end.duration).toBeGreaterThan(1.7);
    expect(end.duration).toBeLessThan(2.3);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(measureAbility(steps, 1, cancelled.signal)).rejects.toThrow();
    expect(await measureAbility([], 2, new AbortController().signal)).toEqual({
      duration: 2,
      limited: false,
    });
  });

  it("rejects invalid saved timing and ignores unknown recipe versions", () => {
    for (const release of [NaN, Infinity, -1, 30])
      expect(abilityRecipeSchema.safeParse({ ...RECIPE, release }).success).toBe(false);
    expect(
      readAbilities([
        RECIPE,
        { ...RECIPE, version: 2 },
        { ...RECIPE, id: "invalid", target: [Infinity, 0, 0] },
      ]),
    ).toEqual([RECIPE]);
    expect(abilityRecipeSchema.safeParse({ ...RECIPE, flightDuration: 0 }).success).toBe(false);
  });
});

it("delays projectile launch after release and captures the bone at launch", () => {
  const recipe = { ...RECIPE, missileDelay: 0.25 };
  const [cast, projectile, impact] = abilitySteps(recipe, pose, 2);
  expect(cast.stop).toBe(0.5);
  expect(projectile.start).toBe(0.75);
  expect(originAt(projectile.rig.motion, 0)).toEqual([150, 0, 0]);
  expect(impact.start).toBe(1.75);
  expect(arrivalOf({ ...recipe, projectileEffect: null })).toBe(0.5);
  expect(abilityRecipeSchema.safeParse({ ...recipe, release: 29 }).success).toBe(false);
});

it("rejects unresolved cast timing and preserves optional guidance when saving", () => {
  expect(abilityRecipeSchema.safeParse({ ...RECIPE, timingConflict: [0.25, 0] }).success).toBe(
    false,
  );
  const recipe = {
    ...RECIPE,
    missileDelay: 0.2,
    guides: { range: 825, radius: 100, secondaryRadius: 200, coneAngle: 45, coneDistance: 400 },
  };
  expect(readAbilities([recipe, RECIPE])).toEqual([RECIPE]);
  expect(readAbilities([recipe])).toEqual([recipe]);
});
