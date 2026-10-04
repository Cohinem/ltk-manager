import { useEffect, useMemo } from "react";

import {
  buildDynamics,
  createBake,
  createLive,
  cuesMove,
  STANDING,
  DEFAULT_WARM_UP,
  type DynamicsCues,
  type DynamicsModel,
  type DynamicsRig,
  hasDynamics,
  type Pose,
  simulatedPose,
} from "@/modules/viewport";

/** The milliseconds of one frame a bake may take before it yields to the next. */
const BAKE_BUDGET_MS = 6;

export interface SimulatedPoseOptions {
  /** `skinScale`, which the simulation's world is measured in. */
  readonly scale: number;
  /** Steps a second. */
  readonly rate: number;
  readonly cues: DynamicsCues;
  /** The reader moves the unit by hand, so the simulation steps live under it. */
  readonly live: boolean;
}

/**
 * Steps the live simulation: the clock's time, the seconds the frame took, and where the
 * unit stands and faces in the game's own space.
 */
export type DriveLive = (
  time: number,
  seconds: number,
  position: readonly number[],
  yaw: number,
) => void;

export interface SimulatedPoseResult {
  /** `base` with its simulated joints read from the baked pass, and null for no base. */
  readonly pose: Pose | null;
  /** The modifiers as they were built, which the overlay draws, and null for none. */
  readonly rig: DynamicsRig | null;
  /** The live simulation's step, which the viewport calls each frame, and null while none runs. */
  readonly drive: DriveLive | null;
}

/**
 * `base` with the pose modifiers of `model` simulated over it.
 *
 * "A simulated pose is a baked pass" in docs/plans/pose-dynamics-preview.md. The pose is
 * one object for as long as `base` is, and a change of the model or the rate bakes a new
 * pass under it a few milliseconds a frame, so the clock does not start over and the
 * viewport shows the last pass until the next lands. The pass is baked under a unit that
 * stands still.
 *
 * "A drag is simulated live" there. While `live` holds, the same modifiers step each frame
 * under where the unit stands, on a rig of their own, and the pose reads them in place of
 * the pass.
 */
export function useSimulatedPose(
  base: Pose | null,
  model: DynamicsModel,
  { scale, rate, cues, live }: SimulatedPoseOptions,
): SimulatedPoseResult {
  const simulated = useMemo(() => (base === null ? null : simulatedPose(base)), [base]);

  const moved = cuesMove(cues);
  const rig = useMemo(() => {
    if (base === null || !(hasDynamics(model) || moved)) return null;

    return buildDynamics(model, base.skeleton, base.parents, scale);
  }, [base, model, scale, moved]);

  useEffect(() => {
    if (simulated === null) return;
    if (rig === null || base === null) {
      simulated.setTake(null);
      return;
    }

    const bake = createBake(rig, base, STANDING, {
      rate,
      warmup: DEFAULT_WARM_UP,
      cues,
    });
    let frame = 0;
    const run = () => {
      const take = bake.run(performance.now() + BAKE_BUDGET_MS);
      if (take === null) {
        frame = requestAnimationFrame(run);
        return;
      }

      simulated.setTake(take);
    };

    run();

    return () => cancelAnimationFrame(frame);
  }, [simulated, rig, base, rate, cues]);

  /* A step moves a rig's state, so the live simulation steps one of its own. */
  const simulation = useMemo(() => {
    if (!live || base === null || !(hasDynamics(model) || moved)) return null;

    const own = buildDynamics(model, base.skeleton, base.parents, scale);
    return createLive(own, base, { rate, cues });
  }, [live, base, model, scale, moved, rate, cues]);

  useEffect(() => () => simulated?.setLive(null), [simulated, simulation]);

  const drive = useMemo<DriveLive | null>(() => {
    if (simulation === null || simulated === null) return null;

    /* The pose reads the live joints once a step has filled them. */
    let read = false;
    return (time, seconds, position, yaw) => {
      simulation.advance(time, seconds, position, yaw);
      if (!read) simulated.setLive(simulation);
      read = true;
      simulated.touch();
    };
  }, [simulation, simulated]);

  return { pose: simulated, rig, drive };
}
