import type { TemplateRig } from "@/lib/tauri";

import { GROUND_RIG, type RigModel, withCarrier, withPlayback } from "../engine/model/rig";

/** The rig a system template was tuned on, as the run drives it. ADR-0057. */
export function templateRig(rig: TemplateRig): RigModel {
  const carried = withPlayback(withCarrier(GROUND_RIG, rig.carrier), rig.playback);
  if (carried.motion.kind !== "path" || rig.speed === null) return carried;

  return { ...carried, motion: { ...carried.motion, speed: rig.speed } };
}
