import { LINGER_TYPE } from "../../engine/model/enums";
import type { EmitterModel } from "../../engine/model/model";
import { lingerSeconds } from "../../engine/model/systemModel";
import { bornSimple, bornUv } from "../../engine/simulation/emit";
import { age01, appearance, erosionDrive, scalar } from "../../engine/simulation/particleRead";
import { createPool, NOT_LINGERING, type Pool } from "../../engine/simulation/pool";
import { drawCurve, drawCurveInto } from "../../engine/utils/sampleCurve";
import { colorLookupInto } from "../../rendering/utils/colorLookup";
import { drawsAsBeam, drawsAsTrail } from "../../rendering/utils/drawKind";
import { type UvDraw, uvDraw, uvTransformInto } from "../../rendering/utils/uvTransform";

/** One particle's layers, colour, size and lookup, as scratch a caller reuses from frame to frame. */
export interface SurfaceDraw {
  readonly base: UvDraw;
  readonly mult: UvDraw;
  readonly color: Float32Array;
  readonly scale: Float32Array;
  /** The ramp's lookup and the erosion's drive, the lanes of `lookup` in quad.ts. */
  readonly lookup: Float32Array;
}

/**
 * The emitter draws what one particle's quad cannot stand for: a ribbon strung through every
 * live particle, or a beam to its target, so its preview draws it live.
 *
 * A mesh is left out: its shape is the Render Primitive node's picture, and its surface is
 * the texture the particle maps over it.
 */
export function drawnLive(emitter: EmitterModel): boolean {
  return drawsAsTrail(emitter) || drawsAsBeam(emitter);
}

export function surfaceDraw(): SurfaceDraw {
  return {
    base: uvDraw(),
    mult: uvDraw(),
    color: new Float32Array(4),
    scale: new Float32Array(3),
    lookup: new Float32Array(3),
  };
}

/** The seconds one preview particle shows: its life, then the linger that follows it. */
export interface SurfaceCycle {
  readonly life: number;
  readonly linger: number;
}

/** The life a particle is given where its own lifetime draws none. */
const FALLBACK_LIFE = 1;

/** One particle's slots, which every call rewrites whole. */
const POOL = createPool(1);

/**
 * How long one particle of `emitter`, born at the emitter's start with `chance`, shows.
 *
 * The linger is the one a particle alive when its emitter stops is given, as though the
 * emitter stopped the moment the life ran out. A `maxLifetimeAfterEmitterDies` linger only
 * cuts a life short, and an emitter that reads nothing while lingering shows none.
 */
export function surfaceCycle(emitter: EmitterModel, chance: number): SurfaceCycle {
  const drawn = scalar(drawCurve(emitter.particleLifetime, 0, chance));
  const reads = emitter.linger !== null || emitter.erosion?.lingerDrive != null;
  const outlives = emitter.lingerType !== LINGER_TYPE.maxLifetimeAfterEmitterDies;

  return {
    life: drawn > 0 ? drawn : FALLBACK_LIFE,
    linger: reads && outlives ? lingerSeconds(emitter) : 0,
  };
}

/**
 * One particle of `emitter` at `at` seconds into its `cycle`, into `out`.
 *
 * The particle is born at the emitter's start and draws every random value at `chance`,
 * as the engine's own birth does, and its colour, scale, ramp lookup and erosion drive are
 * the engine's reads. `out.mult` is left as it was for an emitter with no mult
 * layer.
 */
export function surfaceAt(
  emitter: EmitterModel,
  at: number,
  cycle: SurfaceCycle,
  chance: number,
  out: SurfaceDraw,
): void {
  const lingering = cycle.linger > 0 && at >= cycle.life;
  const age = lingering ? at : Math.min(at, cycle.life);
  const lifetime = lingering ? cycle.life + cycle.linger : cycle.life;
  born(emitter, chance, lifetime);
  POOL.lingerFrom[0] = lingering ? cycle.life : NOT_LINGERING;

  particleInto(POOL, 0, emitter, age, out);
}

/**
 * The particle at row `at` of `pool` as it draws at `now`, into `out`.
 *
 * The same reads `Quads` writes a particle's instanced attributes from.
 */
export function particleInto(
  pool: Pool,
  at: number,
  emitter: EmitterModel,
  now: number,
  out: SurfaceDraw,
): void {
  const age = now - pool.birthTime[at];
  const through = age01(pool, at, now);
  uvTransformInto(pool, at, emitter.uv, 0, age, through, now, out.base);
  if (emitter.multUv !== null) {
    uvTransformInto(pool, at, emitter.multUv, 1, age, through, now, out.mult);
  }

  appearance(pool, at, emitter, now, out);
  colorLookupInto(emitter, pool, at, through, out.lookup, 0);
  out.lookup[2] = erosionDrive(pool, at, emitter, now);
}

/** The particle a surface follows through a run, by its serial, and -1 before one is picked. */
export interface Followed {
  serial: number;
}

/**
 * The row of the particle of emitter `index` a surface follows in `pool`, and -1 while it has none.
 *
 * The followed particle holds until it dies, and the emitter's newest particle is then
 * picked, so the surface shows one life after another at the run's own births.
 */
export function followedRow(pool: Pool, index: number, followed: Followed): number {
  let newest = -1;
  for (let at = 0; at < pool.count; at += 1) {
    if (pool.emitter[at] !== index) continue;
    if (pool.serial[at] === followed.serial) return at;
    if (newest < 0 || pool.serial[at] > pool.serial[newest]) newest = at;
  }

  followed.serial = newest < 0 ? -1 : pool.serial[newest];
  return newest;
}

/** The one particle's birth: its life, scale, colour, roll and both layers' opening state. */
function born(emitter: EmitterModel, chance: number, lifetime: number): void {
  POOL.birthTime[0] = 0;
  POOL.lifetime[0] = lifetime;
  POOL.roll[0] = chance;
  POOL.birthScale.fill(1, 0, 3);
  POOL.birthColor.fill(1, 0, 4);

  if (emitter.legacySimple === null) {
    drawCurveInto(emitter.birthScale0, 0, chance, POOL.birthScale, 0);
  } else {
    bornSimple(POOL, 0, emitter.legacySimple, 0, chance);
  }
  drawCurveInto(emitter.birthColor, 0, chance, POOL.birthColor, 0);
  bornUv(POOL, 0, emitter, 0, chance, chance);
}

/**
 * The half-extents, in clip space, of a quad `across` by `up` fitted whole into a box.
 *
 * The box is `width` by `height`, and a quad with no extent on either axis fits as a square.
 */
export function fitInto(
  across: number,
  up: number,
  width: number,
  height: number,
  out: { set(x: number, y: number): unknown },
): void {
  const x = Math.abs(across);
  const y = Math.abs(up);
  if (x === 0 || y === 0 || width <= 0 || height <= 0) {
    const side = Math.min(width, height);
    out.set(side / Math.max(width, 1), side / Math.max(height, 1));
    return;
  }

  const fit = Math.min(width / x, height / y);
  out.set((x * fit) / width, (y * fit) / height);
}
