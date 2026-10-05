import type { CurveKey, ProbabilityTable } from "../model/curve";
import type { ValueCurve } from "../model/model";

/**
 * What `value` is worth at `t01`: its keys where it has them, and its constant otherwise.
 *
 * `t01` is already a share of whichever lifetime drives the curve, and the caller is
 * where it is normalized and clamped, because only the caller knows the denominator.
 * A time outside the keyed range reads the nearest key flat, which is what the engine
 * draws past both ends of a curve.
 */
export function sampleCurve(value: ValueCurve, t01: number): readonly number[] {
  if (value.keys.length === 0) return value.constant;
  return keysAt(value.keys, t01);
}

/** What `keys` are worth at `t01`, one number per channel, and none for no keys. */
export function keysAt(keys: readonly CurveKey[], t01: number): number[] {
  if (keys.length === 0) return [];
  const out = new Array<number>(keys[0].values.length).fill(0);
  blendInto(keys, t01, out, 0);
  return out;
}

/**
 * `sampleCurve` written into `out` from `at`, one slot per channel the curve holds.
 *
 * A channel past the end of `out` is dropped, and a channel `out` holds that the curve
 * does not reach keeps whatever the caller left there.
 */
export function sampleCurveInto(
  value: ValueCurve,
  t01: number,
  out: Float32Array,
  at: number,
): void {
  const { keys } = value;
  if (keys.length === 0) {
    const width = Math.min(value.constant.length, out.length - at);
    for (let channel = 0; channel < width; channel += 1)
      out[at + channel] = value.constant[channel];
    return;
  }
  blendInto(keys, t01, out, at);
}

/** The keys blended at `t01`, written channel by channel from `at`. */
function blendInto(
  keys: readonly CurveKey[],
  t01: number,
  out: number[] | Float32Array,
  at: number,
): void {
  const under = lowerKey(keys, t01);
  const lo = keys[Math.max(under, 0)];
  const hi = keys[under + 1];
  const span = hi === undefined ? 0 : hi.time - lo.time;
  const into = Math.min(lo.values.length, out.length - at);

  for (let channel = 0; channel < into; channel += 1) {
    const from = lo.values[channel];
    if (hi === undefined || span <= 0) {
      out[at + channel] = from;
      continue;
    }
    const to = hi.values[channel] ?? from;
    out[at + channel] = from + (to - from) * ((t01 - lo.time) / span);
  }
}

/**
 * `sampleCurve` for a birth value: each channel's probability table at `chance`, multiplied in.
 *
 * The factor multiplies the sampled value and never replaces or adds to it. One chance
 * serves every channel here, which is how the UV birth values and a particle's shared
 * number read their tables. A birth vector draws per channel instead, through
 * [`drawChannelsInto`]. A table is the value against the probability, so a table of `1` to
 * `360` is a uniform angle and one key alone a fixed multiplier.
 */
export function drawCurve(value: ValueCurve, t01: number, chance: number): number[] {
  const out = [...sampleCurve(value, t01)];
  for (const table of value.tables) {
    if (table.channel < out.length) out[table.channel] *= tableValue(table, chance);
  }
  return out;
}

/** `drawCurve` written into `out` from `at`, one slot per channel the curve holds. */
export function drawCurveInto(
  value: ValueCurve,
  t01: number,
  chance: number,
  out: Float32Array,
  at: number,
): void {
  const drawn = drawCurve(value, t01, chance);
  const width = Math.min(drawn.length, out.length - at);
  for (let channel = 0; channel < width; channel += 1) out[at + channel] = drawn[channel];
}

/**
 * What a table is worth at the unit draw `u`: its keys read flat past both ends.
 *
 * No keys is the single value, and otherwise the two keys around `u` are blended.
 */
export function tableValue(table: ProbabilityTable, u: number): number {
  const { keys } = table;
  if (keys.length === 0) return table.single;

  const under = lowerKey(keys, u);
  const lo = keys[Math.max(under, 0)];
  const hi = keys[under + 1];
  const from = lo.values[0] ?? table.single;
  if (hi === undefined || under < 0) return from;

  const span = hi.time - lo.time;
  const to = hi.values[0] ?? from;
  return span > 0 ? from + (to - from) * ((u - lo.time) / span) : from;
}

/** The last key at or before `t01`, and -1 where every key lands after it. */
function lowerKey(keys: readonly CurveKey[], t01: number): number {
  let under = -1;
  for (let at = 0; at < keys.length; at += 1) {
    if (keys[at].time > t01) break;
    under = at;
  }
  return under;
}

/**
 * `sampleCurveInto` for a birth vector: each channel's table multiplied in at a draw of its own.
 *
 * The birth vectors and `birthColor` draw once per channel per particle, so a table on
 * each axis of a scale spreads the three apart. `pinned` stands in for every draw where
 * the reader pins one, the stream still being drawn so a pin moves nothing after it.
 */
export function drawChannelsInto(
  value: ValueCurve,
  t01: number,
  draw: () => number,
  pinned: number | null,
  out: Float32Array,
  at: number,
): void {
  sampleCurveInto(value, t01, out, at);
  const width = channelsOf(value);
  for (const table of value.tables) {
    const drawn = draw();
    if (table.channel < width) out[at + table.channel] *= tableValue(table, pinned ?? drawn);
  }
}

/**
 * The tables of a value sampled over a particle's life, multiplied into `out` from `at`.
 *
 * The engine reads such a table at a fresh draw on every step, so the value flickers. The
 * draw is hashed off `seed`, the particle's serial, and the step's own time rather than
 * taken from the stream, so a seek and a second read of one step answer alike.
 */
export function flickerInto(
  value: ValueCurve,
  seed: number,
  now: number,
  out: Float32Array,
  at: number,
): void {
  if (value.tables.length === 0) return;

  const width = channelsOf(value);
  STEP_TIME[0] = now;
  const step = Math.imul(seed + 1, 0x9e3779b1) ^ STEP_BITS[0];
  for (let slot = 0; slot < value.tables.length; slot += 1) {
    const table = value.tables[slot];
    if (table.channel >= width) continue;
    out[at + table.channel] *= tableValue(table, unitHash(step + Math.imul(slot, 0x85ebca6b)));
  }
}

/** A step's time as the bits a hash mixes. */
const STEP_TIME = new Float32Array(1);
const STEP_BITS = new Uint32Array(STEP_TIME.buffer);

/** One over 2^32, which lands a 32-bit hash in `[0, 1)`. */
const HASH_UNIT = 1 / 2 ** 32;

/** A unit draw hashed off `value`, by a 32-bit integer finaliser. */
function unitHash(value: number): number {
  let held = value | 0;
  held = Math.imul(held ^ (held >>> 16), 0x7feb352d);
  held = Math.imul(held ^ (held >>> 15), 0x846ca68b);
  return ((held ^ (held >>> 16)) >>> 0) * HASH_UNIT;
}

/** How many channels `value` holds: its first key's, and its constant's where it has no keys. */
export function channelsOf(value: ValueCurve): number {
  return value.keys.length === 0 ? value.constant.length : value.keys[0].values.length;
}

/** How many entries the engine bakes an integrated value's table to. */
const INTEGRAL_SAMPLES = 64;

/** How many pieces each table interval is cut into where the second integral is summed. */
const SECOND_INTEGRAL_CUTS = 8;

/** Each curve's baked integral, once and twice over, built when first read. */
const BAKED: [WeakMap<ValueCurve, Float32Array>, WeakMap<ValueCurve, Float32Array>] = [
  new WeakMap(),
  new WeakMap(),
];

/**
 * An integrated value at the age fraction `age01`, into `out` from `at`.
 *
 * The engine replaces the curve of an `IntegratedValue` by its running integral over the
 * unit interval as the definition loads, 64 entries read linearly, and a caller scales the
 * result by the particle's lifetime to make seconds of it. `order` is 2 for
 * `worldAcceleration`, whose curve is integrated twice. Only a curve is integrated: a
 * value writing no `dynamics` reads as its constant, so it is one fixed amount rather than
 * a rate.
 */
export function integratedInto(
  value: ValueCurve,
  age01: number,
  order: 1 | 2,
  out: Float32Array,
  at: number,
): void {
  if (value.keys.length === 0) {
    const held = Math.min(value.constant.length, out.length - at);
    for (let channel = 0; channel < held; channel += 1) out[at + channel] = value.constant[channel];
    return;
  }

  const baked = bakedOf(value, order);
  const width = channelsOf(value);
  const placed = Math.min(Math.max(age01, 0), 1) * (INTEGRAL_SAMPLES - 1);
  const under = Math.min(Math.floor(placed), INTEGRAL_SAMPLES - 2);
  const share = placed - under;
  const into = Math.min(width, out.length - at);
  for (let channel = 0; channel < into; channel += 1) {
    const from = baked[under * width + channel];
    const to = baked[(under + 1) * width + channel];
    out[at + channel] = from + (to - from) * share;
  }
}

function bakedOf(value: ValueCurve, order: 1 | 2): Float32Array {
  const cache = BAKED[order - 1];
  let baked = cache.get(value);
  if (baked === undefined) {
    baked = order === 1 ? bakeIntegral(value) : bakeSecondIntegral(value);
    cache.set(value, baked);
  }
  return baked;
}

/** The running integral of `value`'s curve at each of the table's entries, channel by channel. */
function bakeIntegral(value: ValueCurve): Float32Array {
  const width = channelsOf(value);
  const out = new Float32Array(INTEGRAL_SAMPLES * width);
  for (let entry = 0; entry < INTEGRAL_SAMPLES; entry += 1) {
    const upTo = entry / (INTEGRAL_SAMPLES - 1);
    for (let channel = 0; channel < width; channel += 1) {
      out[entry * width + channel] = integralTo(value.keys, channel, upTo);
    }
  }
  return out;
}

/** The running integral of the running integral, summed by Simpson's rule between entries. */
function bakeSecondIntegral(value: ValueCurve): Float32Array {
  const width = channelsOf(value);
  const out = new Float32Array(INTEGRAL_SAMPLES * width);
  const cut = 1 / ((INTEGRAL_SAMPLES - 1) * SECOND_INTEGRAL_CUTS);
  for (let channel = 0; channel < width; channel += 1) {
    let sum = 0;
    for (let entry = 1; entry < INTEGRAL_SAMPLES; entry += 1) {
      const from = (entry - 1) / (INTEGRAL_SAMPLES - 1);
      for (let piece = 0; piece < SECOND_INTEGRAL_CUTS; piece += 1) {
        const a = from + piece * cut;
        sum +=
          (cut / 6) *
          (integralTo(value.keys, channel, a) +
            4 * integralTo(value.keys, channel, a + cut / 2) +
            integralTo(value.keys, channel, a + cut));
      }
      out[entry * width + channel] = sum;
    }
  }
  return out;
}

/** The integral of one channel of a linear curve from zero to `upTo`, held flat past both ends. */
function integralTo(keys: readonly CurveKey[], channel: number, upTo: number): number {
  const first = keys[0];
  let sum = (first.values[channel] ?? 0) * Math.min(upTo, Math.max(first.time, 0));
  for (let at = 0; at + 1 < keys.length; at += 1) {
    const lo = keys[at];
    const hi = keys[at + 1];
    const from = Math.max(lo.time, 0);
    const to = Math.min(hi.time, upTo);
    if (to <= from || hi.time <= lo.time) continue;

    const span = hi.time - lo.time;
    const a = lo.values[channel] ?? 0;
    const b = hi.values[channel] ?? a;
    const start = a + (b - a) * ((from - lo.time) / span);
    const end = a + (b - a) * ((to - lo.time) / span);
    sum += ((start + end) / 2) * (to - from);
  }

  const last = keys[keys.length - 1];
  if (upTo > last.time) sum += (last.values[channel] ?? 0) * (upTo - Math.max(last.time, 0));
  return sum;
}
