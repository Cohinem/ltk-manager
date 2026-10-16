import type { MissileSpell } from "@/lib/tauri";
// eslint-disable-next-line no-restricted-imports -- the chunk rig.ts names
import { CHAMPION_HEIGHT } from "@/modules/viewport/shared/utils/space";

import { flightOf } from "./missileSpec";
import type { EmitterModel, SystemModel } from "./model";
import {
  FLIGHT_HEIGHT,
  GROUND_RIG,
  missileMotion,
  type RigModel,
  withCarrier,
  withPlayback,
} from "./rig";

/** Shortest beam reach that `beamReach` takes from an emitter position, in engine units. */
const SHORTEST_REACH = CHAMPION_HEIGHT;

/** Largest share of its `+Z` distance that an emitter position may lie off the `+Z` axis. */
const AXIS_TOLERANCE = 0.01;

/** The rig a system picks for itself, and the spell whose missile it flies, if any. */
export interface AutoRig {
  readonly rig: RigModel;
  /** The name of the spell that fires the system as its missile, and null for none. */
  readonly spell: string | null;
}

/**
 * Returns the rig a system picks for itself when nothing opened it in a context.
 *
 * The first of `spells` whose movement can be simulated flies the system on that spell's
 * missile over its cast range, replayed. Otherwise a system with a trail flies a straight missile, so the ribbon
 * has travel to follow, and any other system stands on the ground. A ground rig of a system
 * with a beam aims at [`beamReach`] when the system has one. A system that is not a missile is
 * continuous where an emitter has no `lifetime`, since the game never ends that system, and
 * replayed otherwise. "The rig picks itself" in docs/plans/vfx-templates.md.
 */
export function autoRig(system: SystemModel | null, spells: readonly MissileSpell[] = []): AutoRig {
  for (const spell of spells) {
    const flight = flightOf(spell.missile, spell.missileSpeed ?? undefined);
    if (flight === null) continue;

    const motion = missileMotion(flight, spell.range ?? undefined);
    const rig: RigModel = { motion, life: "loop", height: FLIGHT_HEIGHT };
    return { rig, spell: spell.name };
  }

  const shown = system?.emitters.filter((emitter) => !emitter.disabled) ?? [];
  const endless = shown.some((emitter) => emitter.lifetime === null);
  const trailed = shown.some((emitter) => emitter.trail !== null);

  const carried = withCarrier(GROUND_RIG, trailed ? "missile" : "ground");
  const reach = carried.motion.kind === "still" ? beamReach(shown) : null;
  const aimed: RigModel =
    reach === null ? carried : { ...carried, motion: { kind: "still", target: [0, 0, reach] } };
  const playback = endless && !trailed ? "continuous" : "replay";
  return { rig: withPlayback(aimed, playback), spell: null };
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
export function autoRigKey({ rig, spell }: AutoRig): string {
  const target = rig.motion.kind === "still" ? (rig.motion.target?.join(",") ?? "") : "";
  return `${rig.motion.kind}:${rig.life}:${target}:${spell ?? ""}`;
}
