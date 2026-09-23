import type { MapParticle } from "@/lib/tauri";

import { fnv1a32 } from "../../shared/utils/binHash";
import type { Anchor, Point, RigModel } from "../../vfx/engine/model/rig";

/** The slots of a column-major transform its translation sits in. */
const TRANSLATION = 12;

/**
 * The particles of `particles` a backdrop plays under the visibility `flags`, a mask.
 *
 * A transitional particle is the game's one-shot as the map changes, and one a script or
 * a visibility controller turns on is an event the backdrop is not in, so none of them
 * play.
 */
export function playedParticles(particles: readonly MapParticle[], flags: number): MapParticle[] {
  return particles.filter(
    (particle) =>
      (particle.visibility & flags) !== 0 &&
      !particle.transitional &&
      !particle.startDisabled &&
      particle.controller === null,
  );
}

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
