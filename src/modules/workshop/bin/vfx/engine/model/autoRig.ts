// eslint-disable-next-line no-restricted-imports -- the chunk rig.ts names
import { CHAMPION_HEIGHT } from "@/modules/viewport/shared/utils/space";

import type { EmitterModel, SystemModel } from "./model";
import { GROUND_RIG, type RigModel, withCarrier, withPlayback } from "./rig";

/** Shortest beam reach that `beamReach` takes from an emitter position, in engine units. */
const SHORTEST_REACH = CHAMPION_HEIGHT;

/** Largest share of its `+Z` distance that an emitter position may lie off the `+Z` axis. */
const AXIS_TOLERANCE = 0.01;

/**
 * The rig a system picks for itself when nothing opened it in a context.
 *
 * Continuous where an emitter has no `lifetime`, since the game never ends that system, and
 * Replay otherwise. Orbit where an emitter draws a trail, so the ribbon has travel to follow,
 * and Ground otherwise. A Ground rig of a system with a beam aims at [`beamReach`] when the
 * system has one. "The rig picks itself" in docs/plans/vfx-templates.md.
 */
export function autoRig(system: SystemModel | null): RigModel {
  const shown = system?.emitters.filter((emitter) => !emitter.disabled) ?? [];
  const endless = shown.some((emitter) => emitter.lifetime === null);
  const trailed = shown.some((emitter) => emitter.trail !== null);

  const carried = withCarrier(GROUND_RIG, trailed ? "orbit" : "ground");
  const reach = carried.motion.kind === "still" ? beamReach(shown) : null;
  const aimed: RigModel =
    reach === null ? carried : { ...carried, motion: { kind: "still", target: [0, 0, reach] } };
  return withPlayback(aimed, endless ? "continuous" : "replay");
}

/**
 * Returns the distance along local `+Z` at which a beam system places its far-end emitters.
 *
 * Reads the constant `EmitterPosition` of each emitter that draws no beam, and returns the
 * largest `+Z` of a position that lies on the `+Z` axis within `AXIS_TOLERANCE`. Returns null
 * if no emitter draws a beam, or if no such position is at least `SHORTEST_REACH` away.
 */
export function beamReach(emitters: readonly EmitterModel[]): number | null {
  if (!emitters.some((emitter) => emitter.beam !== null)) return null;

  let reach: number | null = null;
  for (const emitter of emitters) {
    if (emitter.beam !== null || emitter.emitterPosition.keys.length > 0) continue;

    const [x = 0, y = 0, z = 0] = emitter.emitterPosition.constant;
    const off = Math.hypot(x, y);
    if (z < SHORTEST_REACH || off > z * AXIS_TOLERANCE) continue;

    reach = Math.max(reach ?? 0, z);
  }
  return reach;
}

/** What two automatic rigs differ by, so an edit that changes neither keeps the rig in hand. */
export function autoRigKey(rig: RigModel): string {
  const target = rig.motion.kind === "still" ? (rig.motion.target?.join(",") ?? "") : "";
  return `${rig.motion.kind}:${rig.life}:${target}`;
}
