import type { ProbabilityTable } from "../../engine/model/curve";
import type { ValueCurve } from "../../engine/model/model";
import { keysAt } from "../../engine/utils/sampleCurve";

/** The least and the most one channel of a random value draws. */
export interface ChannelRange {
  readonly channel: number;
  readonly least: number;
  readonly most: number;
}

/** How many times across a life a keyed random value's band is read at. */
export const RANGE_STEPS = 32;

/** Whether the value draws per particle: a table with more than one factor on some channel. */
export function drawsRandom(curve: ValueCurve): boolean {
  return curve.tables.some((table) => table.keys.length > 1);
}

/**
 * The span each channel of `curve` draws at life ratio `t01`: its base there times the least
 * and the most factor its table holds, and the base alone on a channel without a table.
 *
 * A table is linear between its keys, so its extremes are among its keys' factors.
 */
export function rangeAt(curve: ValueCurve, t01: number): ChannelRange[] {
  const base = curve.keys.length > 0 ? keysAt(curve.keys, t01) : curve.constant;
  return base.map((value, channel) => {
    const table = curve.tables.find((each) => each.channel === channel);
    if (table === undefined) return { channel, least: value, most: value };

    const factors = factorsOf(table);
    const ends = [value * Math.min(...factors), value * Math.max(...factors)];
    return { channel, least: Math.min(...ends), most: Math.max(...ends) };
  });
}

function factorsOf(table: ProbabilityTable): number[] {
  if (table.keys.length === 0) return [table.single];
  return table.keys.map((key) => key.values[0] ?? 0);
}
