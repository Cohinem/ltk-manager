import type { Source } from "../../engine/simulation/particleRead";

/**
 * The longest a beam's swatch shows it, as a factor of the width it shows it at.
 *
 * A beam is often tens of times longer than it is wide, which across a preview box is a
 * line a few pixels high. Past this the swatch draws it taller rather than shorter, so its
 * length, and the texture's repeats along it, stay the beam's own.
 */
export const LONGEST = 4;

/** Where a beam's swatch lays it and how far it stands it up. */
export interface BeamFrame {
  /** The length the beam draws at, in engine units. */
  readonly length: number;
  /** How many times taller than its width the beam is shown, 1 for a beam no longer than `LONGEST` widths. */
  readonly stretch: number;
  /** The frame the camera holds whole, each way, in the shown units. */
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/**
 * The first of `sources` holding a particle of the emitter at `index`, and null while none
 * does, which is the one system a beam's swatch shows.
 */
export function heldSource(sources: readonly Source[], index: number): Source | null {
  for (const source of sources) {
    const { pool } = source;
    for (let at = 0; at < pool.count; at += 1) {
      if (pool.emitter[at] === index) return source;
    }
  }
  return null;
}

/** How far `source` reaches from its origin to its target, the raw length a beam's colour reads. */
export function reachOf(source: Source): number {
  const { origin, target } = source;
  return Math.hypot(target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]);
}

/**
 * The frame a beam `width` wide and `length` long is shown in.
 *
 * A beam of no length, or of none known, draws `LONGEST` widths long.
 */
export function beamFrame(width: number, length: number): BeamFrame {
  const drawn = length > 0 && Number.isFinite(length) ? length : width * LONGEST;
  const stretch = Math.max(1, drawn / LONGEST / width);
  return { length: drawn, stretch, halfWidth: drawn / 2, halfHeight: (width * stretch) / 2 };
}
