import type { MissileSpec } from "@/lib/tauri";

import { flightOf } from "../../vfx/engine/model/missileSpec";
import type { SystemModel } from "../../vfx/engine/model/model";
import { flightTime, type Motion, type Point, type RigModel } from "../../vfx/engine/model/rig";
import { createDriver, type Driver } from "../../vfx/engine/simulation/driver";

export const FLIGHT_STEP = 1 / 60;
export const MAX_FLIGHT_SECONDS = 30;
export const FLIGHT_SEED = 1337;

/** The first fixed step after arrival with no particles or child effects left. */
export async function measureFlight(system: SystemModel, flight: Flight, signal: AbortSignal) {
  const driver = createDriver(FLIGHT_SEED);
  driver.swap(system);
  driver.steer(flight.rig);
  const steps = Math.floor((60 - flight.delay) / FLIGHT_STEP);
  let slice = performance.now();
  for (let step = 1; step <= steps; step += 1) {
    signal.throwIfAborted();
    driver.advance(FLIGHT_STEP);
    const time = step * FLIGHT_STEP;
    if (driver.time >= flight.duration && driver.pool.count === 0 && driver.liveChildren() === 0)
      return { duration: flight.delay + time, limited: false };
    if (performance.now() - slice >= 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      slice = performance.now();
    }
  }
  signal.throwIfAborted();
  return { duration: 60, limited: true };
}

export interface Flight {
  readonly rig: RigModel;
  readonly delay: number;
  readonly duration: number;
}

/**
 * The missile of `spec` flown from `from` toward `to`, launched at the height of `from`.
 *
 * Returns null if the movement cannot be simulated or writes no positive speed or travel time,
 * if a point is not finite or out of reach, or if the flight with its delay outlasts
 * `MAX_FLIGHT_SECONDS` or never arrives. A missing speed is refused rather than defaulted.
 */
export function compileFlight(spec: MissileSpec, from: Point, to: Point): Flight | null {
  const delay = spec.startDelay ?? 0;
  if (![...from, ...to, delay].every(Number.isFinite) || delay < 0) return null;
  if ([...from, ...to].some((value) => Math.abs(value) > 100_000)) return null;
  if (!writesPace(spec.movement)) return null;

  const flight = flightOf(spec);
  if (flight === null) return null;

  const motion: Motion = {
    kind: "missile",
    from: [from[0], 0, from[2]],
    to: [to[0], 0, to[2]],
    flight,
  };
  const duration = flightTime(motion, from[1]);
  if (duration <= 0 || duration + delay > MAX_FLIGHT_SECONDS) return null;

  return {
    delay,
    duration,
    rig: { motion, height: from[1], life: "once", stopAt: duration },
  };
}

/** Returns true if `movement` writes the positive speed or travel time that it flies by. */
function writesPace(movement: MissileSpec["movement"]): boolean {
  const positive = (value: number | null) => value !== null && Number.isFinite(value) && value > 0;
  switch (movement.kind) {
    case "fixedSpeed":
    case "fixedSpeedSpline":
      return positive(movement.speed);
    case "fixedTime":
    case "fixedTimeSpline":
      return positive(movement.duration);
    default:
      return true;
  }
}

/** A fixed-step clock shared by continuous playback and backwards seeking. */
export function flightSampler(driver: Pick<Driver, "advance" | "restart">) {
  let reached = 0;
  return (time: number) => {
    if (!Number.isFinite(time)) return;
    const wanted = Math.max(0, Math.round(Math.min(time, 60) / FLIGHT_STEP));
    if (wanted < reached) {
      driver.restart();
      reached = 0;
    }
    while (reached < wanted) {
      driver.advance(FLIGHT_STEP);
      reached += 1;
    }
  };
}
