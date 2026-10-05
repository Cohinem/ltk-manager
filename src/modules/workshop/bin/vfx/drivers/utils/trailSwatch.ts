import type { EmitterModel } from "../../engine/model/model";
import { bornSimple, bornUv } from "../../engine/simulation/emit";
import { appearance, scalar } from "../../engine/simulation/particleRead";
import { createPool, type Pool, spawn } from "../../engine/simulation/pool";
import { drawCurve, drawCurveInto } from "../../engine/utils/sampleCurve";

/** How many points a trail's swatch strings per particle life, which its smoothness follows. */
const POINTS_PER_LIFE = 48;

/** The most points a swatch holds, which lets a particle outlive the middle life by five. */
export const SWATCH_POINTS = POINTS_PER_LIFE * 5;

/** The share of the path one middle life of the ribbon spans. */
const PATH_SHARE = 0.6;

/** The path's half-extent across as a factor of the ribbon's widest half-width. */
const PATH_REACH = 5;

/** The path's height as a share of its width, a figure eight a little wider than tall. */
const PATH_HEIGHT = 0.8;

/** The life a particle is given where its own lifetime draws none. */
const FALLBACK_LIFE = 1;

/** The chance a swatch's measure is read at, the middle of every table. */
const MIDDLE = 0.5;

/** The ages the ribbon's widest point is looked for at. */
const WIDTH_SAMPLES = 16;

/** How many even steps of arc length the path is kept at. */
const PATH_STEPS = 256;

/** The unit path, `x = sin(t)` and `y = sin(2t)` scaled, at even steps of its own length. */
const PATH = unitPath();

/** What one emitter's swatch is measured at, once per emitter. */
export interface SwatchMeasure {
  /** The middle particle's life, in seconds. */
  readonly life: number;
  /** The ribbon's widest half-width over a life, in engine units. */
  readonly reach: number;
  /** The path's half-extent across, in engine units. */
  readonly across: number;
  /** How far along the path the head moves per second, in engine units. */
  readonly speed: number;
  /** The frame the camera holds whole: the path plus the ribbon's own width, each way. */
  readonly halfWidth: number;
  readonly halfHeight: number;
}

const MEASURE_POOL = createPool(1);
const MEASURED = { scale: new Float32Array(3), color: new Float32Array(4) };

/** The size, speed and frame of `emitter`'s swatch, read off one middle particle. */
export function swatchMeasure(emitter: EmitterModel): SwatchMeasure {
  const life = lifeAt(emitter, MIDDLE);
  const reach = widestScale(emitter);
  const across = reach * PATH_REACH;
  return {
    life,
    reach,
    across,
    speed: (PATH_SHARE * PATH.length * across) / life,
    halfWidth: across + reach,
    halfHeight: across * PATH_HEIGHT + reach,
  };
}

/**
 * The widest `scale0.x` one middle particle of `emitter` draws at over its life, and 1 where
 * it draws none: a trail's half-width, and a beam's whole width.
 */
export function widestScale(emitter: EmitterModel): number {
  const life = lifeAt(emitter, MIDDLE);

  MEASURE_POOL.count = 0;
  const at = spawn(MEASURE_POOL, emitter.index, 0, life, MIDDLE)!;
  bornScale(MEASURE_POOL, at, emitter, MIDDLE);

  let widest = 0;
  for (let sample = 0; sample <= WIDTH_SAMPLES; sample += 1) {
    appearance(MEASURE_POOL, at, emitter, (sample / WIDTH_SAMPLES) * life, MEASURED);
    widest = Math.max(widest, Math.abs(MEASURED.scale[0]));
  }
  return widest > 0 ? widest : 1;
}

/** The clock a swatch opens at, late enough that its oldest points have been born. */
export function swatchWarmth(measure: SwatchMeasure): number {
  return (SWATCH_POINTS / POINTS_PER_LIFE) * measure.life;
}

/**
 * `emitter`'s ribbon laid flat on a figure eight at `now` seconds, into `pool`.
 *
 * Particles are born at even steps of the middle life and stay where they were born, so
 * the head runs along the path and the ribbon follows it. Each birth draws its own chance
 * unless `pinned` holds one, and its odometer is the path walked, which a wake trail's
 * texture is pinned to.
 */
export function swatchInto(
  pool: Pool,
  emitter: EmitterModel,
  measure: SwatchMeasure,
  now: number,
  pinned: number | null,
): void {
  const step = measure.life / POINTS_PER_LIFE;
  const newest = Math.floor(now / step);
  pool.count = 0;

  for (let serial = newest; serial > newest - pool.capacity && serial >= 0; serial -= 1) {
    const birth = serial * step;
    const chance = pinned ?? noise(serial);
    const life = lifeAt(emitter, chance);
    const age = now - birth;
    if (age > life) continue;

    const at = spawn(pool, emitter.index, birth, life, noise(serial + ROLL_OFFSET))!;
    pool.serial[at] = serial;

    const walked = birth * measure.speed;
    pathInto(walked / measure.across, pool.placed, at * 3);
    pool.placed[at * 3] *= measure.across;
    pool.placed[at * 3 + 1] *= measure.across;
    pool.odometer[at] = walked;

    bornScale(pool, at, emitter, chance);
    drawCurveInto(emitter.birthColor, 0, chance, pool.birthColor, at * 4);
    bornUv(pool, at, emitter, 0, pool.roll[at], chance);
    if (emitter.trail !== null) {
      const tiling = drawCurve(emitter.trail.tiling, 0, chance);
      pool.tiling[at * 2] = tiling[0] ?? 0;
      pool.tiling[at * 2 + 1] = tiling[1] ?? 0;
    }
  }
}

/** Where the serial's roll is read, apart from its chance. */
const ROLL_OFFSET = 0.5;

/** A stable draw in `[0, 1)` for `serial`, so a point keeps its chance from frame to frame. */
function noise(serial: number): number {
  const value = Math.sin(serial * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function lifeAt(emitter: EmitterModel, chance: number): number {
  const drawn = scalar(drawCurve(emitter.particleLifetime, 0, chance));
  return drawn > 0 ? drawn : FALLBACK_LIFE;
}

function bornScale(pool: Pool, at: number, emitter: EmitterModel, chance: number): void {
  if (emitter.legacySimple === null) {
    drawCurveInto(emitter.birthScale0, 0, chance, pool.birthScale, at * 3);
  } else {
    bornSimple(pool, at, emitter.legacySimple, 0, chance);
  }
}

/** The unit path's point `walked` units along it, wrapping at its length, into `out`. */
export function pathInto(walked: number, out: Float32Array, offset: number): void {
  const wrapped = ((walked % PATH.length) + PATH.length) % PATH.length;
  const place = (wrapped / PATH.length) * PATH_STEPS;
  const low = Math.floor(place) % PATH_STEPS;
  const share = place - Math.floor(place);
  const high = (low + 1) % PATH_STEPS;

  out[offset] = PATH.points[low * 2] + (PATH.points[high * 2] - PATH.points[low * 2]) * share;
  out[offset + 1] =
    PATH.points[low * 2 + 1] + (PATH.points[high * 2 + 1] - PATH.points[low * 2 + 1]) * share;
  out[offset + 2] = 0;
}

/** The unit figure eight resampled at even steps of its length, and that length. */
function unitPath(): { points: Float32Array; length: number } {
  const fine = PATH_STEPS * 16;
  const at = (turn: number): [number, number] => [Math.sin(turn), Math.sin(turn * 2) * PATH_HEIGHT];

  const walked = new Float64Array(fine + 1);
  let [lastX, lastY] = at(0);
  for (let index = 1; index <= fine; index += 1) {
    const [x, y] = at((index / fine) * Math.PI * 2);
    walked[index] = walked[index - 1] + Math.hypot(x - lastX, y - lastY);
    lastX = x;
    lastY = y;
  }
  const length = walked[fine];

  const points = new Float32Array(PATH_STEPS * 2);
  let index = 0;
  for (let step = 0; step < PATH_STEPS; step += 1) {
    const target = (step / PATH_STEPS) * length;
    while (walked[index + 1] < target) index += 1;

    const share = (target - walked[index]) / (walked[index + 1] - walked[index] || 1);
    const [x0, y0] = at((index / fine) * Math.PI * 2);
    const [x1, y1] = at(((index + 1) / fine) * Math.PI * 2);
    points[step * 2] = x0 + (x1 - x0) * share;
    points[step * 2 + 1] = y0 + (y1 - y0) * share;
  }

  return { points, length };
}
