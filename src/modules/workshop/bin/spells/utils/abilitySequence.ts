import { jointAnchor, type Pose } from "@/modules/viewport";

import type { SystemModel } from "../../vfx/engine/model/model";
import { distance, type Anchor, type RigModel } from "../../vfx/engine/model/rig";
import { createDriver } from "../../vfx/engine/simulation/driver";
import { launchOf, arrivalOf, type AbilityRecipe } from "./abilityRecipe";
import { FLIGHT_STEP, flightSampler } from "./flight";

export interface AbilityStep {
  readonly id: "cast" | "projectile" | "impact";
  readonly key: string;
  readonly start: number;
  readonly stop: number;
  readonly rig: RigModel;
  readonly seed: number;
}

/** A clip held on its final pose while the effects finish. */
export function oncePose(pose: Pose): Pose {
  const at = (time: number) => Math.max(0, Math.min(time, pose.duration - 0.000001));
  return {
    ...pose,
    localsInto: (time, out) => pose.localsInto(at(time), out),
    worldInto: (slot, time, out) => pose.worldInto(slot, at(time), out),
  };
}

/** Explicit cast, release and arrival events for one visual recipe. */
export function abilitySteps(recipe: AbilityRecipe, pose: Pose, scale: number): AbilityStep[] {
  const slot = recipe.bone === "" ? -1 : pose.jointNamed(recipe.bone);
  if (recipe.bone !== "" && slot < 0) throw new Error(`Missing bone: ${recipe.bone}`);
  const anchor = jointAnchor(pose, slot, [0, 0, 0], scale);
  const target: Anchor = {
    originAt: () => recipe.target,
    basisInto: (_time, out) => {
      out.set([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      return out;
    },
  };
  const result: AbilityStep[] = [];
  if (recipe.castEffect !== null)
    result.push({
      id: "cast",
      key: recipe.castEffect,
      start: 0,
      stop: recipe.release,
      seed: 1337,
      rig: {
        motion: { kind: "bone", anchor, target },
        height: 0,
        life: "once",
        stopAt: recipe.release,
        joints: (name) => {
          const joint = pose.jointNamed(name);
          return joint < 0 ? null : jointAnchor(pose, joint, [0, 0, 0], scale);
        },
      },
    });
  const arrival = arrivalOf(recipe);
  if (recipe.projectileEffect !== null) {
    const from = anchor.originAt(launchOf(recipe));
    const length = distance(from, recipe.target);
    result.push({
      id: "projectile",
      key: recipe.projectileEffect,
      start: launchOf(recipe),
      stop: arrival,
      seed: 7331,
      rig: {
        motion: {
          kind: "path",
          from,
          to: recipe.target,
          speed: length === 0 ? 1 : length / recipe.flightDuration,
        },
        height: 0,
        life: "once",
        stopAt: recipe.flightDuration,
      },
    });
  }
  if (recipe.impactEffect !== null)
    result.push({
      id: "impact",
      key: recipe.impactEffect,
      start: arrival,
      stop: arrival + recipe.impactDuration,
      seed: 3137,
      rig: {
        motion: { kind: "bone", anchor: target, target: null },
        height: 0,
        life: "once",
        stopAt: recipe.impactDuration,
      },
    });
  return result;
}

export interface ResolvedStep extends AbilityStep {
  readonly system: SystemModel;
}

export function abilityInstance(step: ResolvedStep) {
  const driver = createDriver(step.seed);
  driver.swap(step.system);
  driver.steer(step.rig);
  const sample = flightSampler(driver);
  return { step, driver, sample: (time: number) => sample(Math.max(0, time - step.start)) };
}

/** The first fixed step after all actions with no particles or children left. */
export async function measureAbility(
  steps: readonly ResolvedStep[],
  animationDuration: number,
  signal: AbortSignal,
) {
  const instances = steps.map(abilityInstance);
  const earliest = Math.max(animationDuration, ...steps.map((step) => step.stop));
  let slice = performance.now();
  for (let frame = 0; frame <= 3600; frame += 1) {
    signal.throwIfAborted();
    const time = frame * FLIGHT_STEP;
    for (const instance of instances) instance.sample(time);
    if (
      time >= earliest &&
      instances.every(
        ({ driver, step }) =>
          driver.time + 1e-8 >= step.stop - step.start &&
          driver.pool.count === 0 &&
          driver.liveChildren() === 0,
      )
    )
      return { duration: Math.max(FLIGHT_STEP, time), limited: false };
    if (performance.now() - slice >= 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      slice = performance.now();
    }
  }
  return { duration: 60, limited: true };
}
