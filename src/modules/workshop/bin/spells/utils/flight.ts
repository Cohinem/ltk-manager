import type { MissileSpec } from "@/lib/tauri";

import type { SystemModel } from "../../vfx/engine/model/model";
import { distance, type Point, type RigModel } from "../../vfx/engine/model/rig";
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

/** A straight, level flight between explicit preview anchors, using the written movement rate. */
export function compileFlight(spec: MissileSpec, from: Point, to: Point): Flight | null {
  const delay = spec.startDelay ?? 0;
  if (![...from, ...to, delay].every(Number.isFinite) || delay < 0 || from[1] !== to[1])
    return null;
  if ([...from, ...to].some((value) => Math.abs(value) > 100_000)) return null;
  const length = distance(from, to);
  let duration: number;
  const movement = spec.movement;
  if (movement.kind === "fixedSpeed") {
    if (movement.speed === null || !Number.isFinite(movement.speed) || movement.speed <= 0)
      return null;
    duration = length / movement.speed;
  } else if (movement.kind === "fixedTime") {
    if (movement.duration === null || !Number.isFinite(movement.duration) || movement.duration <= 0)
      return null;
    duration = movement.duration;
  } else return null;
  if (!Number.isFinite(duration) || duration + delay > MAX_FLIGHT_SECONDS) return null;
  return {
    delay,
    duration,
    rig: {
      motion: { kind: "path", from, to, speed: length === 0 ? 1 : length / duration },
      height: 0,
      life: "once",
      stopAt: duration,
    },
  };
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
