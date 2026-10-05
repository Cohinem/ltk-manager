/**
 * Where a planar projection's decal lies, per particle, as the engine hands it to its projector.
 *
 * The two families place it differently. A simple emitter passes its scalar scale times
 * `scaleBias`, its rotation stream in degrees and a white `MODULATE_COLOR`. A complex one
 * passes its scale's `x` and `z`, a yaw read off its world matrix and its own colour. "Planar
 * projection" in docs/plans/vfx-particle-renderer.md.
 */

import type { EmitterModel } from "../../engine/model/model";
import type { Pool } from "../../engine/simulation/pool";

const DEGREE = Math.PI / 180;
const FULL_TURN = 2 * Math.PI;

/** The quarter turns the complex draw takes off its matrix's yaw, 270 degrees. */
const YAW_OFFSET = 270;

/** The white a simple emitter's decal is modulated by. */
const WHITE = [1, 1, 1, 1] as const;

/** One particle's footprint: its half-extents and the turn of its uv, in radians. */
export interface Footprint {
  halfWidth: number;
  halfHeight: number;
  turn: number;
}

/**
 * The footprint of the particle at `index`, off the scale `appearance` drew and the basis it
 * stands on, in the engine's space.
 */
export function footprintInto(
  emitter: EmitterModel,
  pool: Pool,
  index: number,
  scale: Float32Array,
  basis: Float32Array,
  out: Footprint,
): void {
  out.halfWidth = scale[0];

  if (emitter.legacySimple !== null) {
    out.halfHeight = scale[1];
    out.turn = pool.rotation[index * 3 + 2] * DEGREE;
    return;
  }

  out.halfHeight = scale[2];
  out.turn = matrixTurn(basis[0], basis[6]) * DEGREE;
}

/**
 * The degrees the complex draw turns the decal by, off its world matrix's first row.
 *
 * `atan2(-m00, m02)` wrapped into one turn, less 270, which undoes the particle's own yaw.
 */
export function matrixTurn(m00: number, m02: number): number {
  let angle = Math.atan2(-m00, m02);
  if (angle < 0) angle += FULL_TURN;
  return angle / DEGREE - YAW_OFFSET;
}

/** The colour `MODULATE_COLOR` carries: the drawn colour on a complex emitter, white on a simple one. */
export function modulateInto(emitter: EmitterModel, drawn: Float32Array, out: Float32Array): void {
  if (emitter.legacySimple !== null) {
    out.set(WHITE);
    return;
  }

  out.set(drawn);
}
