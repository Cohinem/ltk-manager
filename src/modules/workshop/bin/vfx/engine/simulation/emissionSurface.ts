import type { EmitterModel } from "../model/model";
import type { Rng } from "../utils/Rng";

/** A birth position and its surface normal, in the emitter's own space. */
export interface SurfaceBirth {
  readonly position: Float32Array;
  readonly normal: Float32Array;
}

/** A loaded surface sampled at simulation time, including during seeks. */
export interface EmissionSampler {
  sample(time: number, rng: Rng, out: SurfaceBirth): boolean;
}

export type EmissionSurfaces = ReadonlyMap<EmitterModel, EmissionSampler>;
