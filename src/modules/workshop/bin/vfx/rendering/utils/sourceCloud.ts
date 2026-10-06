import type { EmitterModel } from "../../engine/model/model";
import type { EmitterSurfaces, SurfaceBirth } from "../../engine/simulation/emissionSurface";
import { Rng } from "../../engine/utils/Rng";

/** The number of births the overlay samples. */
export const CLOUD_BIRTHS = 320;

/** The length of a direction line, in engine units. */
const TICK = 10;

/** A fixed seed, so the same pose gives the same points on every frame. */
const SEED = 0x5eed;

const BIRTH: SurfaceBirth = { position: new Float32Array(3), normal: new Float32Array(3) };

const DIRECTION = new Float32Array(3);

/** The number of births written, and how many of them have a direction line. */
export interface CloudCount {
  readonly births: number;
  readonly directed: number;
}

/**
 * Samples births from an emitter's emission mesh and surface at `time`, in the emitter's space.
 *
 * Each birth is `stands`, the sampled `EmitterPosition`, plus the mesh point and the surface
 * point, each times its scale, as in `emit`. The position is written to `points`, three floats
 * per birth. A birth whose normal switch is on writes a line to `ticks`, two positions per
 * birth, along the surface normal, or along the mesh normal when the surface gives none. The
 * spawn shape is not applied, because its rotation is drawn per particle.
 */
export function sourceCloudInto(
  surfaces: EmitterSurfaces,
  emitter: EmitterModel,
  time: number,
  stands: Float32Array,
  points: Float32Array,
  ticks: Float32Array,
): CloudCount {
  const rng = new Rng(SEED);
  const most = Math.min(Math.floor(points.length / 3), Math.floor(ticks.length / 6));
  let births = 0;
  let directed = 0;

  for (let born = 0; born < most; born += 1) {
    const at = births * 3;
    let placed = false;
    let aimed = false;
    points.set(stands, at);

    if (surfaces.mesh?.sample(time, rng, BIRTH)) {
      const scale = emitter.emissionMesh?.scale ?? 1;
      for (let axis = 0; axis < 3; axis += 1) points[at + axis] += BIRTH.position[axis] * scale;
      placed = true;
      aimed = emitter.emissionMesh?.useNormal === true;
      if (aimed) DIRECTION.set(BIRTH.normal);
    }
    if (surfaces.surface?.sample(time, rng, BIRTH)) {
      const scale = emitter.emissionSurface?.scale ?? 1;
      for (let axis = 0; axis < 3; axis += 1) points[at + axis] += BIRTH.position[axis] * scale;
      placed = true;
      if (emitter.emissionSurface?.useNormal === true) {
        aimed = true;
        DIRECTION.set(BIRTH.normal);
      }
    }
    if (!placed) break;

    if (aimed) {
      const tick = directed * 6;
      for (let axis = 0; axis < 3; axis += 1) {
        ticks[tick + axis] = points[at + axis];
        ticks[tick + 3 + axis] = points[at + axis] + DIRECTION[axis] * TICK;
      }
      directed += 1;
    }
    births += 1;
  }

  return { births, directed };
}
