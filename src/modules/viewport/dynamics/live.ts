import { axisAngleInto, folded, shortestTurn, UP } from "./math";
import { passSeconds } from "./motion";
import {
  type BakedPose,
  createStepper,
  type DynamicsCues,
  type DynamicsRig,
  NO_CUES,
} from "./take";

/** Seconds of steps a live simulation takes on its first frame, so it starts settled on the pose. */
const SETTLE_SECONDS = 1;

/** The most seconds of steps one frame takes, so a stalled frame does not step for seconds. */
const MAX_FRAME_SECONDS = 4 / 60;

export interface LiveOptions {
  /** Steps a second. */
  readonly rate: number;
  readonly cues?: DynamicsCues;
}

/** A simulation stepped as the frames come, under a unit a reader moves. */
export interface LiveSimulation {
  /** The joints the simulation writes, by slot. */
  readonly slots: Int32Array;
  /** The local transform of every joint after the last step. */
  readonly locals: Float32Array;
  /**
   * Step `seconds` of real time, with the animated pose at `time` and the unit standing at
   * `position` and facing `yaw` radians about the up axis, in the game's own space.
   */
  advance(time: number, seconds: number, position: ArrayLike<number>, yaw: number): void;
}

/**
 * The modifiers of `rig` over `pose`, stepped live.
 *
 * "A drag is simulated live" in docs/plans/pose-dynamics-preview.md. The rig is the
 * simulation's own, since a step moves its state.
 */
export function createLive(
  rig: DynamicsRig,
  pose: BakedPose,
  options: LiveOptions,
): LiveSimulation {
  const duration = passSeconds(pose.duration);
  const stepper = createStepper(rig, duration, options.cues ?? NO_CUES);
  const locals = new Float32Array(stepper.locals.length);
  const dt = 1 / options.rate;
  const settleSteps = Math.max(Math.round(SETTLE_SECONDS * options.rate), 1);

  /* Where the unit stood at the last step, and the time the pose was read at. */
  const stood = { x: 0, y: 0, z: 0, yaw: 0, time: 0, pass: 0 };
  let started = false;
  let owed = 0;

  const stand = (x: number, y: number, z: number, yaw: number) => {
    stepper.root.position[0] = x;
    stepper.root.position[1] = y;
    stepper.root.position[2] = z;
    axisAngleInto(stepper.root.rotation, 0, UP, 0, yaw);
  };

  const standAt = (x: number, y: number, z: number, yaw: number, time: number, pass: number) => {
    stood.x = x;
    stood.y = y;
    stood.z = z;
    stood.yaw = yaw;
    stood.time = time;
    stood.pass = pass;
  };

  return {
    slots: stepper.slots,
    locals,
    advance(time, seconds, position, yaw) {
      const x = position[0];
      const y = position[1];
      const z = position[2];
      const pass = folded(time, duration);

      if (!started) {
        stepper.reset();
        stepper.seek(pass);
        stand(x, y, z, yaw);
        for (let step = 0; step < settleSteps; step += 1) {
          pose.localsInto(time, stepper.locals);
          stepper.settle(dt);
        }

        locals.set(stepper.locals);
        standAt(x, y, z, yaw, time, pass);
        started = true;
        owed = 0;
        return;
      }

      owed = Math.min(owed + Math.max(seconds, 0), MAX_FRAME_SECONDS);
      const steps = Math.floor(owed / dt + 1e-9);
      if (steps === 0) return;

      owed -= steps * dt;

      let before = stood.pass;
      let moved = time - stood.time;
      if (moved < 0) {
        /* A time that ran back is a pass that looped where the way on is the short one,
           and a seek back otherwise, which the events are put in place for. */
        moved = folded(pass - stood.pass, duration);
        if (moved > duration / 2) {
          stepper.seek(pass);
          before = pass;
          moved = 0;
        }
      }

      /* A yaw wraps at a half turn, so the turn is the shortest way round. */
      const turned = stood.yaw + shortestTurn(yaw - stood.yaw);
      for (let step = 1; step <= steps; step += 1) {
        const share = step / steps;
        stand(
          stood.x + (x - stood.x) * share,
          stood.y + (y - stood.y) * share,
          stood.z + (z - stood.z) * share,
          stood.yaw + (turned - stood.yaw) * share,
        );
        pose.localsInto(time, stepper.locals);
        /* The events are crossed once, by the first step of the frame. */
        stepper.step(step === 1 ? before : before + moved, before + moved, dt);
      }

      locals.set(stepper.locals);
      standAt(x, y, z, turned, time, pass);
    },
  };
}
