import type { MapParticle } from "@/lib/tauri";
import { layerVisible, type MapVisibility, placeableVisible } from "@/modules/viewport";

import { fnv1a32 } from "../../shared/utils/binHash";
import type { Anchor, Point, RigModel } from "../../vfx/engine/model/rig";
import { itemId } from "./mapOutline";

/** The slots of a column-major transform its translation sits in. */
const TRANSLATION = 12;

/**
 * The particles of `particles` that a backdrop plays under `visibility`.
 *
 * A transitional particle never plays, because the game plays it once when the map
 * changes. A particle that starts disabled, or whose controller is not visible, is an
 * event. An event plays only if its layer mask is drawn under the active flags and either
 * `events` is on or `picked` contains its `itemId`.
 */
export function playedParticles(
  particles: readonly MapParticle[],
  visibility: MapVisibility,
  events = false,
  picked: ReadonlySet<string> = NONE_PICKED,
): MapParticle[] {
  return particles.filter((particle) => {
    if (particle.transitional) return false;

    const visible =
      !particle.startDisabled &&
      placeableVisible(visibility, particle.visibility, particle.controller);
    if (visible) return true;

    return (
      layerVisible(particle.visibility, visibility.flags) &&
      (events || picked.has(itemId(particle.chunk, particle.key)))
    );
  });
}

const NONE_PICKED: ReadonlySet<string> = new Set();

/** `particles` under the system each plays, in the order a system is first met. */
export function particlesBySystem(
  particles: readonly MapParticle[],
): Map<string, readonly MapParticle[]> {
  const held = new Map<string, MapParticle[]>();
  for (const particle of particles) {
    const group = held.get(particle.system);
    if (group === undefined) held.set(particle.system, [particle]);
    else group.push(particle);
  }
  return held;
}

/** Where a map stands `particle`, in the map's own space. */
export function particleOrigin({ transform }: MapParticle): Point {
  return [
    transform[TRANSLATION] ?? 0,
    transform[TRANSLATION + 1] ?? 0,
    transform[TRANSLATION + 2] ?? 0,
  ];
}

/**
 * Where a map stands `particle`, as the anchor its system rides.
 *
 * The transform is the engine's own and so is a pool's space, so it reaches the driver as
 * it stands. A column's length is the placeable's scale, which a turn does not carry, as
 * a joint's is not.
 */
export function particleAnchor(particle: MapParticle): Anchor {
  const m = particle.transform.map((component) => component ?? 0);
  const origin = particleOrigin(particle);
  const basis = new Float32Array(9);
  for (let column = 0; column < 3; column += 1) {
    const length = Math.hypot(m[column * 4], m[column * 4 + 1], m[column * 4 + 2]) || 1;
    for (let row = 0; row < 3; row += 1) basis[row * 3 + column] = m[column * 4 + row] / length;
  }
  return {
    originAt: () => origin,
    basisInto: (_, out) => {
      out.set(basis);
      return out;
    },
  };
}

/** The rig a map's particle runs on: stood where the map has it, for as long as it is drawn. */
export function particleRig(particle: MapParticle): RigModel {
  return {
    motion: { kind: "bone", anchor: particleAnchor(particle), target: null },
    life: "once",
    height: 0,
  };
}

/** A seed off a placeable's own name, so sixty braziers of one system do not flicker as one. */
export function particleSeed(name: string): number {
  return fnv1a32(name);
}
