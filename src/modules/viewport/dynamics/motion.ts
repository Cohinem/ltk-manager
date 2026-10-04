import type { RootTransform } from "./world";

/** How a unit moves while a pass is baked: where its root stands at any time. */
export interface Motion {
  /** The unit's place and facing `time` seconds in, into `out`, whose scale is left alone. */
  rootInto(time: number, out: RootTransform): RootTransform;
}

/** The pass a pose of no duration takes, which is the bind pose. */
export const STILL_PASS_SECONDS = 2;

/** Seconds one pass over a pose of `duration` lasts. */
export function passSeconds(duration: number): number {
  return duration > 0 ? duration : STILL_PASS_SECONDS;
}

/** A unit that stands at the origin and faces ahead, which the preview bakes a pass under. */
export const STANDING: Motion = {
  rootInto(_time, out) {
    out.position.fill(0);
    out.rotation[0] = 0;
    out.rotation[1] = 0;
    out.rotation[2] = 0;
    out.rotation[3] = 1;

    return out;
  },
};
