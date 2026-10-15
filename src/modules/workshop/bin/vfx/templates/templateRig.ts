import type { TemplateRig } from "@/lib/tauri";

import type { MissileFlight } from "../engine/model/missile";
import {
  FIRST_FLIGHT,
  GROUND_RIG,
  missileMotion,
  type RigModel,
  withCarrier,
  withPlayback,
} from "../engine/model/rig";

/** The circle an Orbit template turns on: once every three seconds, for as long as the run lasts. */
const ORBIT_FLIGHT: MissileFlight = {
  ...FIRST_FLIGHT,
  movement: {
    kind: "circle",
    angularVelocity: (Math.PI * 2) / 3,
    linearVelocity: 0,
    radialVelocity: 0,
    lifetime: 0,
  },
};

/** How far from its centre an Orbit template turns, in engine units. */
const ORBIT_RADIUS = 300;

/**
 * The rig a system template was tuned on, as the run drives it. ADR-0057.
 *
 * A Flight template flies a fixed-speed missile, and an Orbit template a circle.
 */
export function templateRig(rig: TemplateRig): RigModel {
  const carried = withPlayback(
    withCarrier(GROUND_RIG, rig.carrier === "ground" ? "ground" : "missile"),
    rig.playback,
  );
  if (rig.carrier === "orbit") {
    return { ...carried, motion: missileMotion(ORBIT_FLIGHT, ORBIT_RADIUS) };
  }
  if (rig.carrier === "ground" || rig.speed === null) return carried;

  const flight: MissileFlight = {
    ...FIRST_FLIGHT,
    movement: { kind: "fixedSpeed", speed: rig.speed },
  };
  return { ...carried, motion: missileMotion(flight) };
}
