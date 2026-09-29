import type { SystemModel } from "./model";
import { GROUND_RIG, type RigModel, withCarrier, withPlayback } from "./rig";

/**
 * The rig a system picks for itself when nothing opened it in a context.
 *
 * Continuous where an emitter has no `lifetime`, since the game never ends that system, and
 * Replay otherwise. Orbit where an emitter draws a trail, so the ribbon has travel to follow,
 * and Ground otherwise. "The rig picks itself" in docs/plans/vfx-templates.md.
 */
export function autoRig(system: SystemModel | null): RigModel {
  const shown = system?.emitters.filter((emitter) => !emitter.disabled) ?? [];
  const endless = shown.some((emitter) => emitter.lifetime === null);
  const trailed = shown.some((emitter) => emitter.trail !== null);

  const carried = withCarrier(GROUND_RIG, trailed ? "orbit" : "ground");
  return withPlayback(carried, endless ? "continuous" : "replay");
}

/** What two automatic rigs differ by, so an edit that changes neither keeps the rig in hand. */
export function autoRigKey(rig: RigModel): string {
  return `${rig.motion.kind}:${rig.life}`;
}
