import type { ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import type { ValueMark } from "../../values/utils/valueRows";
import { tableValue } from "../../vfx/engine/utils/sampleCurve";
import { curveActivationEdits, curveLeaf } from "./curveEdits";
import { drawsFlat, randomDraw } from "./randomDraw";
import { tableEdits, type TableKey, tableKeys } from "./randomEdits";

const TABLES = nameHash("probabilityTables");
const TIMES = nameHash("times");
const VALUES = nameHash("values");
const TABLE_CLASS = "VfxProbabilityTableData";

/** The chance either side of a random sign's step, 0.002 apart so it reads as one step. */
const SIGN_STEP = { before: 0.499, after: 0.501 } as const;

/**
 * How a value row authors its value: one constant, a random draw between two ends, or a curve
 * over time. "The randomizer" in docs/ux/BIN_EDITOR.md.
 */
export type ValueMode = "constant" | "random" | "curve";

/**
 * The mode a value reads in. A curve that holds one level and carries tables is random, which
 * is how the files write a value drawn once at birth.
 */
export function valueMode(mark: ValueMark | undefined): ValueMode {
  if (mark?.curve !== true) return "constant";

  const draw = randomDraw(mark);
  return draw !== null && drawsFlat(draw) ? "random" : "curve";
}

/**
 * A random value as its two ends, one number per channel each. A particle lands between
 * `min` and `max` on each channel: a birth vector rolls each channel apart, and the UV birth
 * values share one roll. Where `sign` is set, the channel's roll picks a side too, and the
 * channel draws the ends or their negatives.
 */
export interface RandomEnds {
  readonly min: readonly number[];
  readonly max: readonly number[];
  readonly sign: readonly boolean[];
}

/** The ends a random value draws between, read off its base and tables. */
export function randomEnds(mark: ValueMark): RandomEnds | null {
  const draw = randomDraw(mark);
  if (draw === null || !drawsFlat(draw)) return null;

  const min: number[] = [];
  const max: number[] = [];
  const sign: boolean[] = [];
  for (const channel of draw.channels) {
    const base = channel.base ?? 0;
    if (channel.table === null) {
      min.push(base);
      max.push(base);
      sign.push(false);
      continue;
    }

    const last = base * tableValue(channel.table, 1);
    const split = channel.shape === "split";
    min.push(
      split ? base * innerFactor(tableKeys(channel.table)) : base * tableValue(channel.table, 0),
    );
    max.push(last);
    sign.push(split);
  }
  return { min, max, sign };
}

/** The factor nearest 0 on the side a split's last key sits on, which is where its inner end is. */
function innerFactor(keys: readonly TableKey[]): number {
  const side = Math.sign(keys.at(-1)?.factor ?? 1);
  const same = keys.filter((key) => Math.sign(key.factor) === side);
  return same.reduce(
    (near, key) => (Math.abs(key.factor) < Math.abs(near) ? key.factor : near),
    side,
  );
}

/** The ends a constant starts at when it turns random: its own value at both. */
export function startingEnds(values: readonly number[]): RandomEnds {
  return { min: [...values], max: [...values], sign: values.map(() => false) };
}

/**
 * The edits that write `ends` over a value, under its dynamics.
 *
 * The base of each channel is the end farther from 0, and the table multiplies it from
 * `min / base` to `max / base`, so a channel whose base was 0 still draws. A value with no
 * curve gets one first. Every key of the curve takes the base, which keeps it one level.
 */
export function randomizeEdits(
  mark: ValueMark,
  valueClass: string,
  ends: RandomEnds,
): ValueEdit[] | null {
  const width = ends.min.length;
  const bases = ends.min.map((least, channel) =>
    baseOf(least, ends.max[channel] ?? least, ends.sign[channel] ?? false),
  );
  const leaf = curveLeaf(mark.family, bases);
  if (leaf === null) return null;

  const edits: ValueEdit[] = [];
  let keyCount = mark.keys.length;
  if (!mark.curve) {
    const activation = curveActivationEdits(valueClass, mark.constant, "dynamics");
    if (activation === null) return null;
    edits.push(...activation);
    keyCount = 2;
  } else if (keyCount === 0) {
    const item = { index: 0, key: null, class: null };
    edits.push(
      { type: "ensureProperty", path: "", field: TIMES },
      { type: "ensureProperty", path: "", field: VALUES },
      { type: "insertItem", path: hex(TIMES), item },
      { type: "insertItem", path: hex(VALUES), item },
      { type: "setLeaf", path: `${hex(TIMES)}[0]`, value: { type: "float", value: 0 } },
    );
    keyCount = 1;
  }
  for (let at = 0; at < keyCount; at += 1) {
    edits.push({ type: "setLeaf", path: `${hex(VALUES)}[${at}]`, value: leaf });
  }

  edits.push({ type: "ensureProperty", path: "", field: TABLES });
  for (let channel = 0; channel < width; channel += 1) {
    const held = mark.tables.find((each) => each.channel === channel)?.keys.length ?? 0;
    const keys = channelKeys(
      ends.min[channel] ?? 0,
      ends.max[channel] ?? 0,
      ends.sign[channel] ?? false,
      bases[channel] ?? 0,
    );
    const written = tableEdits(channel, held, keys);
    if (written === null) return null;
    edits.push({ type: "ensurePointer", path: `${hex(TABLES)}[${channel}]`, class: TABLE_CLASS });
    edits.push(...written);
  }
  return edits;
}

/** The end farther from 0, which the channel's table multiplies. Under `sign`, its size. */
function baseOf(min: number, max: number, sign: boolean): number {
  if (sign) return Math.max(Math.abs(min), Math.abs(max));
  return Math.abs(max) >= Math.abs(min) ? max : min;
}

/** One channel's table: from `min` to `max` over `base`, or both sides of 0 under `sign`. */
function channelKeys(min: number, max: number, sign: boolean, base: number): TableKey[] {
  if (base === 0) {
    return [
      { time: 0, factor: 1 },
      { time: 1, factor: 1 },
    ];
  }

  if (!sign) {
    return [
      { time: 0, factor: min / base },
      { time: 1, factor: max / base },
    ];
  }

  const from = Math.abs(min) / base;
  const to = Math.abs(max) / base;
  return [
    { time: 0, factor: -to },
    { time: SIGN_STEP.before, factor: -from },
    { time: SIGN_STEP.after, factor: from },
    { time: 1, factor: to },
  ];
}

/**
 * The edits that leave a random value's curve drawing its base alone: every table slot back
 * to null, the schema's own default, which the engine reads as no draw.
 */
export function unrandomizeEdits(mark: ValueMark): ValueEdit[] {
  return mark.tables.map((table) => ({
    type: "replacePointer",
    path: `${hex(TABLES)}[${table.channel}]`,
    class: null,
  }));
}

function hex(hash: string): string {
  return hash.slice(2);
}
