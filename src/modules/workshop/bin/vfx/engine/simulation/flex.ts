/**
 * How the flex fields of an emitter combine with the flex channels of its system, per
 * "Flex values" in docs/plans/vfx-particle-renderer.md.
 *
 * Every term is additive or a guarded multiply, so a channel of 0 changes nothing.
 */

import type { FlexScale, FlexValue, ValueCurve } from "../model/model";
import { drawChannelsInto, sampleCurve } from "../utils/sampleCurve";
import { flexChannel } from "./pool";

/** The smallest flex multiplier the client applies. A smaller one leaves the value as it is. */
const SMALLEST_SCALE = 1e-5;

/** Scratch a particle's own draw of a flex value lands in. */
const DRAWN = new Float32Array(3);

/** Returns the value of the channel `value` names, and 0 for no value. */
export function channelOf(flex: Float32Array, value: FlexValue | FlexScale | null): number {
  return value === null ? 0 : flexChannel(flex, value.channel);
}

/** Returns `value`'s emitter-step term at `phase`, its first channel times its channel's value. */
export function flexTerm(flex: Float32Array, value: FlexValue | null, phase: number): number {
  const channel = channelOf(flex, value);
  if (value === null || channel === 0) return 0;
  return (sampleCurve(value.value, phase)[0] ?? 0) * channel;
}

/**
 * Adds `value`'s flex terms to the birth value in `out` at `slot`, `width` channels of it.
 *
 * The client adds the emitter step's `F * ch` to the base, then each particle's own
 * `ch * F~`. If `value` draws no table, the particle term is `ch` times the base plus the
 * step's term rather than `F~`.
 */
export function addFlexInto(
  flex: Float32Array,
  value: FlexValue | null,
  base: ValueCurve,
  phase: number,
  draw: () => number,
  pinned: number | null,
  out: Float32Array,
  slot: number,
  width: number,
): void {
  const channel = channelOf(flex, value);
  if (value === null || channel === 0) return;

  const step = sampleCurve(value.value, phase);
  const held = sampleCurve(base, phase);
  if (value.value.tables.length > 0) drawChannelsInto(value.value, phase, draw, pinned, DRAWN, 0);

  for (let axis = 0; axis < width; axis += 1) {
    const term = (step[axis] ?? 0) * channel;
    const particle = value.value.tables.length > 0 ? (DRAWN[axis] ?? 0) : (held[axis] ?? 0) + term;
    out[slot + axis] += term + channel * particle;
  }
}

/** Returns the multiplier `scale` applies through its channel, and 1 below the client's guard. */
export function flexScaleOf(flex: Float32Array, scale: FlexScale | null): number {
  const factor = channelOf(flex, scale) * (scale?.value ?? 0);
  return factor > SMALLEST_SCALE ? factor : 1;
}

/** Returns the factor `FlexInstanceScale` multiplies a particle's scale by: its channel, above the guard. */
export function instanceScaleOf(flex: Float32Array, scale: FlexScale | null): number {
  const channel = channelOf(flex, scale);
  return scale !== null && channel > SMALLEST_SCALE ? channel : 1;
}
