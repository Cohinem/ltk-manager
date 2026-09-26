import type { ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import type { ProbabilityTable, ValueRange } from "../../values/utils/valueRows";
import type { ChannelDraw } from "./randomDraw";

const TABLES = nameHash("probabilityTables");
const KEY_TIMES = nameHash("keyTimes");
const KEY_VALUES = nameHash("keyValues");
const TABLE_CLASS = "VfxProbabilityTableData";

/** The chance either side of a split's step, 0.002 apart so it reads as one step. */
const STEP = { before: 0.499, after: 0.501 } as const;

/** How far a new range opens either side of a fixed factor, as a share of it. */
const OPENING = 0.25;

/** One key of a probability table: a chance, and the factor the table reads there. */
export interface TableKey {
  readonly time: number;
  readonly factor: number;
}

/** The shapes a channel can be switched to. A custom table keeps its own keys. */
export type PickedShape = "fixed" | "uniform" | "split";

/** A table that multiplies every draw by 1. */
const FIXED: readonly TableKey[] = [
  { time: 0, factor: 1 },
  { time: 1, factor: 1 },
];

/** A table's keys, a table holding only `singleValue` read as that value on both ends. */
export function tableKeys(table: ProbabilityTable): TableKey[] {
  if (table.keys.length === 0) {
    return [
      { time: 0, factor: table.single },
      { time: 1, factor: table.single },
    ];
  }
  return table.keys.map((key) => ({ time: key.time, factor: key.values[0] ?? table.single }));
}

/**
 * The edits that write `keys` over the table of `channel`, which holds `held` keys now. Paths
 * are under the curve's dynamics, so a caller sends them through `CURVE_DYNAMICS`.
 */
export function tableEdits(
  channel: number,
  held: number,
  keys: readonly TableKey[],
): ValueEdit[] | null {
  if (!keys.every((key) => writable(key.time) && writable(key.factor))) return null;

  const slot = `${hex(TABLES)}[${channel}]`;
  const times = `${slot}.${hex(KEY_TIMES)}`;
  const values = `${slot}.${hex(KEY_VALUES)}`;
  const edits: ValueEdit[] = [
    { type: "ensureProperty", path: slot, field: KEY_TIMES },
    { type: "ensureProperty", path: slot, field: KEY_VALUES },
  ];

  for (let at = held - 1; at >= keys.length; at -= 1) {
    edits.push({ type: "removeItem", path: `${times}[${at}]` });
    edits.push({ type: "removeItem", path: `${values}[${at}]` });
  }
  keys.forEach((key, at) => {
    if (at >= held) {
      const item = { index: at, key: null, class: null };
      edits.push({ type: "insertItem", path: times, item });
      edits.push({ type: "insertItem", path: values, item });
    }
    edits.push({ type: "setLeaf", path: `${times}[${at}]`, value: float(key.time) });
    edits.push({ type: "setLeaf", path: `${values}[${at}]`, value: float(key.factor) });
  });
  return edits;
}

/**
 * The edits that give a curve with no tables a fixed one on each of its `width` channels.
 * The schema's list starts as one null slot per channel, and a set is whole or absent.
 */
export function addRandomEdits(width: number): ValueEdit[] {
  const edits: ValueEdit[] = [{ type: "ensureProperty", path: "", field: TABLES }];
  for (let channel = 0; channel < width; channel += 1) {
    edits.push({ type: "ensurePointer", path: `${hex(TABLES)}[${channel}]`, class: TABLE_CLASS });
    edits.push(...(tableEdits(channel, 0, FIXED) ?? []));
  }
  return edits;
}

/**
 * What one unit of a channel's fields is worth in factor: its base where it reads results,
 * and 1 where it reads the factor alone.
 */
export function fieldScale(channel: ChannelDraw): number {
  if (channel.results === null || channel.base === null || channel.base === 0) return 1;
  return channel.base;
}

/** The least and the most factor `keys` read. */
function factorSpan(keys: readonly TableKey[]): ValueRange {
  const factors = keys.map((key) => key.factor);
  return { least: Math.min(...factors), most: Math.max(...factors) };
}

/** `range` in field units as factors, least first, which a negative scale turns over. */
function asFactors(range: ValueRange, scale: number): ValueRange {
  const ends = [range.least / scale, range.most / scale];
  return { least: Math.min(...ends), most: Math.max(...ends) };
}

/**
 * `keys` stretched so what they draw spans `to`, in field units, with the shape kept. Keys
 * that all read one factor open into a uniform range.
 */
export function withSpan(keys: readonly TableKey[], scale: number, to: ValueRange): TableKey[] {
  const target = asFactors(to, scale);
  const from = factorSpan(keys);
  if (from.most - from.least <= 0) {
    return [
      { time: 0, factor: target.least },
      { time: 1, factor: target.most },
    ];
  }

  const stretch = (target.most - target.least) / (from.most - from.least);
  return keys.map((key) => ({
    time: key.time,
    factor: target.least + (key.factor - from.least) * stretch,
  }));
}

/**
 * A split's keys with their sizes stretched to span `to`, in field units, and each key's
 * sign kept, so both halves move together.
 */
export function withReach(keys: readonly TableKey[], scale: number, to: ValueRange): TableKey[] {
  const target = asFactors({ least: Math.abs(to.least), most: Math.abs(to.most) }, Math.abs(scale));
  const sizes = keys.map((key) => Math.abs(key.factor));
  const from = { least: Math.min(...sizes), most: Math.max(...sizes) };
  const stretch =
    from.most - from.least <= 0 ? 0 : (target.most - target.least) / (from.most - from.least);

  return keys.map((key) => {
    const size =
      stretch === 0 ? target.most : target.least + (Math.abs(key.factor) - from.least) * stretch;
    return { time: key.time, factor: Math.sign(key.factor) * size };
  });
}

/** The reach of a split in field units: its smallest and its largest size. */
export function splitReach(channel: ChannelDraw): ValueRange | null {
  if (channel.table === null) return null;

  const scale = Math.abs(fieldScale(channel));
  const sizes = tableKeys(channel.table).map((key) => Math.abs(key.factor) * scale);
  return { least: Math.min(...sizes), most: Math.max(...sizes) };
}

/**
 * The keys that turn `channel` into `shape`, opened from what it draws now: a range spans
 * the factors it reads, and a split takes their sizes on either side of 0.
 */
export function shapeKeys(channel: ChannelDraw, shape: PickedShape): TableKey[] {
  if (shape === "fixed" || channel.table === null) return [...FIXED];

  const { least, most } = factorSpan(tableKeys(channel.table));
  const opened =
    most - least > 0
      ? { least, most }
      : { least: least * (1 - OPENING), most: most * (1 + OPENING) };
  if (shape === "uniform") {
    return [
      { time: 0, factor: opened.least },
      { time: 1, factor: opened.most },
    ];
  }

  const sizes = [Math.abs(opened.least), Math.abs(opened.most)];
  let small = Math.min(...sizes);
  const large = Math.max(...sizes);
  if (opened.least < 0 && opened.most > 0) small = large / 2;
  return [
    { time: 0, factor: -large },
    { time: STEP.before, factor: -small },
    { time: STEP.after, factor: small },
    { time: 1, factor: large },
  ];
}

/** `keys` with the key at `at` moved to `key`, kept in chance order. */
export function withKey(keys: readonly TableKey[], at: number, key: TableKey): TableKey[] {
  return keys.map((each, index) => (index === at ? key : each)).sort((a, b) => a.time - b.time);
}

function float(value: number) {
  return { type: "float", value } as const;
}

function writable(value: number): boolean {
  return Number.isFinite(value) && Number.isFinite(Math.fround(value));
}

function hex(hash: string): string {
  return hash.slice(2);
}
