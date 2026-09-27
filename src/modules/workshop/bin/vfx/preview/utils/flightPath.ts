import type { EmitterModel, SystemModel } from "../../engine/model/model";
import { createDriver } from "../../engine/simulation/driver";
import { drawnPlace, drawnPlaceInto, frameOf } from "../../engine/simulation/particleRead";

/** How many steps a flight is simulated in, whatever its length. */
const STEPS = 90;

/** A single particle's room, with a few to spare for a seed that emits on its first step. */
const CAPACITY = 8;

/** The seed a flight is simulated with, fixed so a redraw draws the same path. */
const SEED = 1;

/** One particle's flight, as the engine moves it. */
export interface FlightPath {
  /** Where it is at each step, three per point, from where it was born, in the engine's space. */
  readonly points: Float32Array;
  readonly count: number;
  /** Its life in seconds, which the points span. */
  readonly life: number;
}

const PLACED = drawnPlace();

/**
 * The path one particle of `emitter` flies over its life, with every random value at `chance`.
 *
 * The particle is the engine's own, stepped by a driver of its own over a copy of `system` in
 * which every other emitter is disabled and this one emits a single particle at its origin at
 * the start. So its birth velocity, acceleration, drag, velocity over life, forces and world
 * acceleration are all the run's.
 */
export function flightPath(system: SystemModel, emitter: EmitterModel, chance: number): FlightPath {
  const alone: SystemModel = {
    ...system,
    emitters: system.emitters.map((each) =>
      each.index === emitter.index ? launched(each) : { ...each, disabled: true },
    ),
  };
  const driver = createDriver(SEED, { capacity: CAPACITY, seekable: false });
  driver.swap(alone);
  driver.pin(chance);
  driver.restart();

  const points = new Float32Array((STEPS + 1) * 3);
  let count = 0;
  let born: number[] | null = null;
  let life = 0;
  let dt = 1 / 60;

  for (let step = 0; step <= STEPS; step += 1) {
    const at = rowOf(driver.pool, emitter.index);
    if (at < 0) {
      if (born !== null) break;
      driver.advance(dt);
      continue;
    }

    if (born === null) {
      life = driver.pool.lifetime[at];
      dt = life > 0 ? life / STEPS : dt;
    }
    drawnPlaceInto(driver.pool, at, frameOf(driver, emitter), PLACED);
    born ??= [PLACED.place[0], PLACED.place[1], PLACED.place[2]];
    for (let axis = 0; axis < 3; axis += 1) {
      points[count * 3 + axis] = PLACED.place[axis] - born[axis];
    }
    count += 1;
    driver.advance(dt);
  }

  return { points, count, life };
}

/** `emitter` as a flight simulates it: on, one particle, born at the start from its origin. */
function launched(emitter: EmitterModel): EmitterModel {
  const shape = emitter.shape;
  const offset =
    shape.kind === "point"
      ? shape.offset
      : shape.kind === "legacy"
        ? ([
            shape.offset.constant[0] ?? 0,
            shape.offset.constant[1] ?? 0,
            shape.offset.constant[2] ?? 0,
          ] as const)
        : ([0, 0, 0] as const);

  return {
    ...emitter,
    disabled: false,
    singleParticle: true,
    timeBeforeFirstEmission: 0,
    lifetime: null,
    shape: { kind: "point", offset },
    childSet: null,
  };
}

function rowOf(pool: { count: number; emitter: Int32Array }, index: number): number {
  for (let at = 0; at < pool.count; at += 1) {
    if (pool.emitter[at] === index) return at;
  }
  return -1;
}
