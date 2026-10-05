import type { EmitterModel } from "../../engine/model/model";
import { birth, sampleShape } from "../../engine/simulation/spawnShape";
import { identityInto } from "../../engine/utils/basis";
import { Rng } from "../../engine/utils/Rng";
import { placeInto, spawnFrameInto } from "../../rendering/utils/emitterShape";

/** Where a run of births lands about its emitter. */
export interface SpawnCloud {
  /** Each birth's place, three floats each, turned and mirrored as the viewport draws it. */
  readonly places: Float32Array;
  /** The least and the greatest place on each axis. */
  readonly low: Triple;
  readonly high: Triple;
  /** The least and the greatest offset the shape draws on each axis, before the spawn frame. */
  readonly localLow: Triple;
  readonly localHigh: Triple;
}

type Triple = readonly [number, number, number];

/** How many births a cloud draws, enough to show a spread and few enough to redraw on an edit. */
const CLOUD_BIRTHS = 160;

/** The least reach a cloud is framed and marked at, so a point or a small shape still has room. */
const LEAST_REACH = 25;

/** A fixed seed, so a cloud draws the same on every read of the same emitter. */
const SEED = 0x5eed;

const IDENTITY = identityInto(new Float32Array(9));

/**
 * The births of `emitter` spread evenly across its life, each placed by the engine's own
 * `sampleShape` and spawn frame as `emit` places one, at one seeded chance per birth.
 *
 * The emitter's position and the system's motion are left out, so the cloud is the shape
 * alone about its emitter.
 */
export function spawnCloud(emitter: EmitterModel, births = CLOUD_BIRTHS): SpawnCloud {
  const rng = new Rng(SEED);
  const drawn = birth();
  const frame = new Float32Array(9);
  spawnFrameInto(emitter, IDENTITY, IDENTITY, frame);

  const places = new Float32Array(births * 3);
  const low: [number, number, number] = [Infinity, Infinity, Infinity];
  const high: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const localLow: [number, number, number] = [Infinity, Infinity, Infinity];
  const localHigh: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let at = 0; at < births; at += 1) {
    const t01 = (at + 0.5) / births;
    const chance = rng.unitFloat();
    sampleShape(emitter.shape, rng, t01, chance, drawn);
    for (let axis = 0; axis < 3; axis += 1) {
      places[at * 3 + axis] = drawn.offset[axis];
      localLow[axis] = Math.min(localLow[axis], drawn.offset[axis]);
      localHigh[axis] = Math.max(localHigh[axis], drawn.offset[axis]);
    }
    placeInto(places, at * 3, frame, emitter.translationOverride);

    for (let axis = 0; axis < 3; axis += 1) {
      low[axis] = Math.min(low[axis], places[at * 3 + axis]);
      high[axis] = Math.max(high[axis], places[at * 3 + axis]);
    }
  }

  return { places, low, high, localLow, localHigh };
}

/**
 * How far the cloud reaches from its emitter at most, never under `LEAST_REACH`, which is what
 * a preview frames with the emitter's origin inside and sizes its marks by.
 */
export function cloudReach(cloud: Pick<SpawnCloud, "low" | "high">): number {
  const far = [0, 1, 2].map((axis) =>
    Math.max(Math.abs(cloud.low[axis]!), Math.abs(cloud.high[axis]!)),
  );
  return Math.max(Math.hypot(...far), LEAST_REACH);
}
