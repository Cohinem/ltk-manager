/**
 * The client's Effects Quality setting and what it changes in a particle system.
 *
 * The tables are `VfxMgr_SetEffectsQuality` and `VfxSystem_InstantiateEmitters` of the
 * 16.17 client, per "Effects quality" in docs/plans/vfx-particle-renderer.md.
 */

/** `VfxMgr`'s effects quality, as the client's graphics settings name it. */
export const EFFECTS_QUALITY = {
  veryLow: 0,
  low: 1,
  medium: 2,
  high: 3,
  veryHigh: 4,
} as const;

export type EffectsQuality = (typeof EFFECTS_QUALITY)[keyof typeof EFFECTS_QUALITY];

/** Every effects quality, lowest first. */
export const EFFECTS_QUALITIES: readonly EffectsQuality[] = [0, 1, 2, 3, 4];

/** The fixed simulation rate in hertz, by effects quality. */
const STEP_RATE: readonly number[] = [15, 15, 20, 30, 30];

/** The spawn-rate multiplier, by effects quality and then by `importance`. */
const RATE_SCALE: readonly (readonly number[])[] = [
  [0.05, 0.1, 0.2, 1, 1, 1],
  [0.1, 0.2, 0.4, 1, 1, 1],
  [0.2, 0.4, 0.6, 1, 1, 1],
  [0.5, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1],
];

/** Whether an emitter is left uninstantiated, by effects quality and then by `importance`. */
const CULLED: readonly (readonly boolean[])[] = [
  [true, true, false, false, false, true],
  [true, true, false, false, false, true],
  [true, true, false, false, false, false],
  [true, false, false, false, true, false],
  [false, false, false, false, true, false],
];

/** The particles either side of a trail point that smoothing averages, by effects quality. */
const SMOOTHING_REACH: readonly number[] = [0, 1, 2, 3, 3];

/** Returns the fixed simulation rate in hertz at `quality`. */
export function stepRateAt(quality: EffectsQuality): number {
  return STEP_RATE[quality] ?? 30;
}

/**
 * Returns the spawn-rate multiplier of an emitter of `importance` at `quality`.
 *
 * shortcut: an `importance` past 5 reads 1, where the client reads past its table; no
 * shipped emitter authors one.
 */
export function rateScaleAt(quality: EffectsQuality, importance: number): number {
  return RATE_SCALE[quality]?.[importance] ?? 1;
}

/** Returns true if `quality` leaves an emitter of `importance` uninstantiated. */
export function culledAt(quality: EffectsQuality, importance: number): boolean {
  return CULLED[quality]?.[importance] ?? false;
}

/** Returns how many particles either side of a trail point smoothing averages at `quality`. */
export function smoothingReachAt(quality: EffectsQuality): number {
  return SMOOTHING_REACH[quality] ?? 3;
}

/** Returns true if `quality` draws the distortion passes. Low and Very Low draw neither. */
export function distortsAt(quality: EffectsQuality): boolean {
  return quality >= EFFECTS_QUALITY.medium;
}

/** Returns true if `quality` draws the shadow pass. Only High and Very High draw it. */
export function shadowsAt(quality: EffectsQuality): boolean {
  return quality >= EFFECTS_QUALITY.high;
}

/** Returns true if `quality` compiles `SOFT_PARTICLES`. Low and Very Low fade nothing. */
export function softensAt(quality: EffectsQuality): boolean {
  return quality >= EFFECTS_QUALITY.medium;
}
