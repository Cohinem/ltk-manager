import type { BinRow, BinRows, BinValue } from "@/lib/tauri";

import type { ReadRequest } from "../../documents/hooks/useBinRead";
import { nameHash } from "../../shared/utils/binHash";
import { fieldHash, rowKey } from "../../tree/utils/binRows";
import type { CurveKey, ProbabilityTable } from "../../vfx/engine/model/curve";
import { tableValue } from "../../vfx/engine/utils/sampleCurve";
export type { CurveKey, ProbabilityTable } from "../../vfx/engine/model/curve";

/** How a value class draws its constant. "A value family on its row" in docs/ux/BIN_EDITOR.md. */
export type ValueFamily = "color" | "scalar" | "vector";

/**
 * The classes whose collapsed row draws its constant, by class hash.
 *
 * `ValueColorRgb` carries three channels where `ValueColor` carries four, and is read as
 * a colour with a full alpha rather than as a vector, because what it holds is a colour.
 * An `IntegratedValue*` class adds no field to the class it derives from.
 */
const FAMILY: ReadonlyMap<string, ValueFamily> = new Map([
  [nameHash("ValueColor"), "color" as const],
  [nameHash("ValueColorRgb"), "color" as const],
  [nameHash("ValueFloat"), "scalar" as const],
  [nameHash("ValueVector2"), "vector" as const],
  [nameHash("ValueVector3"), "vector" as const],
  [nameHash("IntegratedValueFloat"), "scalar" as const],
  [nameHash("IntegratedValueVector2"), "vector" as const],
  [nameHash("IntegratedValueVector3"), "vector" as const],
]);

/** The value every class of the family holds under one field hash. */
const CONSTANT = nameHash("constantValue");

/** The curve, which is a pointer and is null on a value that does not animate. */
const DYNAMICS = nameHash("dynamics");

/** The dynamics' two lists: when a stop lands, and the value there. */
const TIMES = nameHash("times");
const VALUES = nameHash("values");

/** One `VfxProbabilityTableData` per channel of the family, each slot a nullable pointer. */
const TABLES = nameHash("probabilityTables");

/** A table's own two lists, and the one value it holds instead of them. */
const KEY_TIMES = nameHash("keyTimes");
const KEY_VALUES = nameHash("keyValues");
const SINGLE = nameHash("singleValue");

/** What a table with no keys is worth, which the schema writes as the field's default. */
const SINGLE_DEFAULT = 1;

/** The alpha a colour written without one carries, which is the opaque the engine samples. */
const OPAQUE = 1;

const NO_KEYS: readonly CurveKey[] = [];
const NO_PAGES: ReadonlyMap<string, BinRows> = new Map();

/** The family a row's value belongs to, or null for every other value. */
export function valueFamily(value: BinValue): ValueFamily | null {
  if (value.type !== "struct") return null;
  return classFamily(value.classHash);
}

/** The family a class belongs to, or null for every other class. */
export function classFamily(classHash: string): ValueFamily | null {
  return FAMILY.get(classHash) ?? null;
}

/**
 * What a surface reads a curve for.
 *
 * A colour band is the keys of a colour and of nothing else, which is what every surface
 * drawing a row already pays for. A curve is every family's keys and probability tables,
 * which only the dock and the inspector's sections on screen afford.
 */
export type CurveRead = "bands" | "curves";

/** What a value-family row draws after its class, as far as the read has answered. */
export interface ValueMark {
  readonly family: ValueFamily;
  /** The row's `constantValue`. Null until the first level answers. */
  readonly constant: BinValue | null;
  /** The authored constant's exact address and type, when the read holds it. */
  readonly constantRow?: BinRow;
  /** The curve's keys, in its own order. Empty until the read asks for them. */
  readonly keys: readonly CurveKey[];
  /** The curve's probability tables, which only a curve read asks for. */
  readonly tables: readonly ProbabilityTable[];
  /** How many slots the table list holds, a null one included. Absent until the curve is read. */
  readonly slots?: number;
  /** The row's `dynamics` points at a curve, so the constant is not the whole value. */
  readonly curve: boolean;
}

/**
 * What every level of the projected read answered, by the key each page sits under.
 *
 * The last three are a curve read's alone, so a caller that asked for bands leaves them
 * out and every row it drew reads its tables as empty.
 */
export interface CurvePages {
  readonly constants: ReadonlyMap<string, BinRows>;
  readonly dynamics: ReadonlyMap<string, BinRows>;
  readonly stops: ReadonlyMap<string, BinRows>;
  readonly tables?: ReadonlyMap<string, BinRows>;
  readonly tableFields?: ReadonlyMap<string, BinRows>;
  readonly tableKeys?: ReadonlyMap<string, BinRows>;
}

/** The first level: every family row in view, whose children are its constant and its curve. */
export function constantRequests(rows: readonly BinRow[]): ReadRequest[] {
  return rows.flatMap((row) =>
    row.value.type === "struct" && FAMILY.has(row.value.classHash)
      ? [{ key: rowKey(row), rows: row.value.len }]
      : [],
  );
}

/** The second level: the curve of every row whose first level answered one and `read` wants. */
export function dynamicsRequests(
  rows: readonly BinRow[],
  constants: ReadonlyMap<string, BinRows>,
  read: CurveRead,
): ReadRequest[] {
  return rows
    .filter((row) => {
      const family = valueFamily(row.value);
      return family !== null && (read === "curves" || family === "color");
    })
    .map((row) => readOf(under(constants.get(rowKey(row)), DYNAMICS), "struct"))
    .filter(isRead);
}

/** The third level: the two lists of every curve the second level answered for. */
export function stopRequests(dynamics: ReadonlyMap<string, BinRows>): ReadRequest[] {
  return [...dynamics.values()].flatMap((page) => listReads(page, [TIMES, VALUES]));
}

/** The fourth level: the table list of every curve, which a band read never asks for. */
export function tableRequests(
  dynamics: ReadonlyMap<string, BinRows>,
  read: CurveRead,
): ReadRequest[] {
  if (read === "bands") return [];
  return [...dynamics.values()].flatMap((page) => listReads(page, [TABLES]));
}

/** The fifth level: each table the slots point at. A null slot is a channel with none. */
export function tableFieldRequests(tables: ReadonlyMap<string, BinRows>): ReadRequest[] {
  return [...tables.values()].flatMap((page) =>
    page.rows.map((slot) => readOf(slot, "struct")).filter(isRead),
  );
}

/** The sixth level: the two lists of every table the level above answered for. */
export function tableKeyRequests(fields: ReadonlyMap<string, BinRows>): ReadRequest[] {
  return [...fields.values()].flatMap((page) => listReads(page, [KEY_TIMES, KEY_VALUES]));
}

/** What every family row in `rows` draws, out of the levels the read answered. */
export function valueMarks(
  rows: readonly BinRow[],
  pages: CurvePages,
): ReadonlyMap<string, ValueMark> {
  const marks = new Map<string, ValueMark>();
  for (const row of rows) {
    const family = valueFamily(row.value);
    if (family === null) continue;

    const key = rowKey(row);
    const page = pages.constants.get(key);
    const constant = under(page, CONSTANT);
    const curve = under(page, DYNAMICS);
    const curvePage = curve === null ? undefined : pages.dynamics.get(rowKey(curve));
    const slots = tableSlots(curvePage, pages);

    marks.set(key, {
      family,
      constant: constant?.value ?? null,
      ...(constant === null ? {} : { constantRow: constant }),
      keys: zipKeys(curvePage, [TIMES, VALUES], pages.stops, components),
      tables: probabilityTables(curvePage, pages),
      curve: curve?.value.type === "struct",
      ...(slots === undefined ? {} : { slots }),
    });
  }
  return marks;
}

/**
 * The probability table of every channel the curve writes one for.
 *
 * The list carries one slot per channel and the slots are nullable, so a channel is the
 * slot's own index and a null one contributes no table rather than shifting the rest.
 */
function probabilityTables(curvePage: BinRows | undefined, pages: CurvePages): ProbabilityTable[] {
  const slots = listRows(curvePage, TABLES, pages.tables ?? NO_PAGES);
  const tableFields = pages.tableFields ?? NO_PAGES;

  const out: ProbabilityTable[] = [];
  for (const [channel, slot] of slots.entries()) {
    if (slot.value.type !== "struct") continue;

    const fields = tableFields.get(rowKey(slot));
    if (mismatched(fields)) {
      out.push({ channel, single: 0, keys: [], mismatched: true });
      continue;
    }

    const single = under(fields, SINGLE)?.value;
    out.push({
      channel,
      single: single?.type === "float" ? (single.value ?? SINGLE_DEFAULT) : SINGLE_DEFAULT,
      keys: zipKeys(fields, [KEY_TIMES, KEY_VALUES], pages.tableKeys ?? NO_PAGES, scalar),
    });
  }
  return out;
}

/**
 * How many slots the curve's table list holds, a null one included.
 *
 * Zero for a curve writing no list, and undefined until the curve's keys, every table and
 * both its lists have answered. A table half read would pass for one holding only its
 * default, and a draw read before its keys would pass for one over a still base.
 */
function tableSlots(curvePage: BinRows | undefined, pages: CurvePages): number | undefined {
  if (curvePage === undefined || pages.tables === undefined) return undefined;
  if (!listsAnswered(curvePage, [TIMES, VALUES], pages.stops)) return undefined;

  const list = readOf(under(curvePage, TABLES), "container");
  if (list === null) return 0;

  const slots = pages.tables.get(list.key)?.rows;
  if (slots === undefined) return undefined;

  const answered = slots.every((slot) => {
    if (readOf(slot, "struct") === null) return true;

    const fields = pages.tableFields?.get(rowKey(slot));
    return fields !== undefined && listsAnswered(fields, [KEY_TIMES, KEY_VALUES], pages.tableKeys);
  });
  return answered ? slots.length : undefined;
}

/** Every list `page` holds under `fields` is empty or has answered in `answered`. */
function listsAnswered(
  page: BinRows,
  fields: readonly string[],
  answered: ReadonlyMap<string, BinRows> | undefined,
): boolean {
  return listReads(page, fields).every((read) => answered?.has(read.key) === true);
}

/** The table's two lists declare two lengths, and it has keys at all. */
function mismatched(fields: BinRows | undefined): boolean {
  const times = under(fields, KEY_TIMES)?.value;
  const values = under(fields, KEY_VALUES)?.value;
  const timeCount = times?.type === "container" ? times.len : 0;
  const valueCount = values?.type === "container" ? values.len : 0;
  return timeCount > 0 && timeCount !== valueCount;
}

/** The row `page` holds under `field`, or null where it holds none. */
function under(page: BinRows | undefined, field: string): BinRow | null {
  return page?.rows.find((row) => fieldHash(row.path) === field) ?? null;
}

/** The read of the rows under `row`, or null where it is not a `type` holding any. */
function readOf(row: BinRow | null, type: "container" | "struct"): ReadRequest | null {
  if (row === null) return null;

  const { value } = row;
  const held = value.type === "container" || value.type === "struct" ? value.len : 0;
  if (value.type !== type || held === 0) return null;
  return { key: rowKey(row), rows: held };
}

/** The reads of the lists `page` holds under `fields`, leaving out the empty ones. */
function listReads(page: BinRows, fields: readonly string[]): ReadRequest[] {
  return fields.map((field) => readOf(under(page, field), "container")).filter(isRead);
}

function isRead(read: ReadRequest | null): read is ReadRequest {
  return read !== null;
}

/** The rows of the list `page` holds under `field`, as the level below answered them. */
function listRows(
  page: BinRows | undefined,
  field: string,
  answered: ReadonlyMap<string, BinRows>,
): readonly BinRow[] {
  const row = under(page, field);
  if (row === null) return [];
  return answered.get(rowKey(row))?.rows ?? [];
}

/**
 * The keys of a times list and a values list `page` holds, with `read` taking each value.
 *
 * The two lists are written in step, so a key is one index of each, and a list longer
 * than the other contributes nothing past where they agree.
 */
function zipKeys(
  page: BinRows | undefined,
  [timesField, valuesField]: readonly [string, string],
  answered: ReadonlyMap<string, BinRows>,
  read: (value: BinValue | undefined) => number[] | null,
): CurveKey[] {
  const times = listRows(page, timesField, answered);
  const values = listRows(page, valuesField, answered);

  const out: CurveKey[] = [];
  for (let at = 0; at < Math.min(times.length, values.length); at += 1) {
    const time = times[at]?.value;
    const held = read(values[at]?.value);
    if (time?.type !== "float" || time.value === null || held === null) continue;
    out.push({ time: time.value, values: held });
  }
  return out;
}

/** A key's value as its channels, or null for one JSON could not carry whole. */
function components(value: BinValue | undefined): number[] | null {
  if (value?.type === "float") return scalar(value);
  if (value?.type !== "vector") return null;
  const held = value.values.filter((component) => component !== null);
  return held.length === value.values.length ? held : null;
}

/** A table key's one float, or null for any other value. */
function scalar(value: BinValue | undefined): number[] | null {
  if (value?.type !== "float" || value.value === null) return null;
  return [value.value];
}

/** The value a mark draws as one: its lone key where the curve holds one, else its constant. */
export function markValue(mark: ValueMark): BinValue | null {
  const [key, ...rest] = mark.keys;
  if (key === undefined || rest.length > 0) return mark.constant;

  if (mark.family !== "scalar") return { type: "vector", values: [...key.values] };

  const [first] = key.values;
  return first === undefined ? mark.constant : { type: "float", value: first };
}

/**
 * The value a value-family row draws, as the one string Copy value takes.
 *
 * Null until the read lands, so the row offers no copy of a value it is not drawing.
 */
export function markText(mark: ValueMark | undefined): string | null {
  const value = mark === undefined ? null : markValue(mark);
  if (value == null) return null;
  if (mark?.family === "color") {
    const rgba = channels(value);
    return rgba === null ? null : colorHex(rgba);
  }
  if (value.type === "float") return String(value.value);
  if (value.type === "vector") return value.values.join(", ");
  return null;
}

/** The keys a row draws as a sparkline, which a colour has none of because its band draws them. */
export function sparkKeys(mark: ValueMark | undefined): readonly CurveKey[] {
  if (mark === undefined || mark.family === "color") return NO_KEYS;
  return mark.keys;
}

/** The least and the most one channel of a random value draws. */
export interface ValueRange {
  readonly least: number;
  readonly most: number;
}

/** Significant digits a bound keeps, past which a product of two `f32`s reads as noise. */
const BOUND_DIGITS = 6;

/**
 * The range each channel of `mark` draws at birth, null for a channel no table widens.
 *
 * "The inspector" in docs/ux/BIN_EDITOR.md. A draw multiplies the sampled value by its
 * channel's table (`drawCurve` in `vfx/sampleCurve.ts`), so a bound is a corner of the
 * two reaches. Null for a colour, for a value that animates, and for a mark whose tables
 * were not read.
 */
export function markRanges(mark: ValueMark | undefined): readonly (ValueRange | null)[] | null {
  if (mark === undefined || mark.family === "color" || mark.tables.length === 0) return null;
  if (mark.keys.length > 1) return null;
  return sampledChannels(mark).map((values, channel) => {
    const table = mark.tables.find((each) => each.channel === channel);
    if (table === undefined || values.length === 0) return null;
    return corners(values, tableReach(table));
  });
}

/** Each channel's values the sampler reads: the keys where there are some, else the constant. */
function sampledChannels(mark: ValueMark): number[][] {
  if (mark.keys.length > 0) {
    const width = Math.max(...mark.keys.map((key) => key.values.length));
    return Array.from({ length: width }, (_, channel) =>
      mark.keys.flatMap((key) => key.values[channel] ?? []),
    );
  }

  const constant = mark.constant;
  if (constant?.type === "float") return [constant.value === null ? [] : [constant.value]];
  if (constant?.type === "vector") {
    return constant.values.map((each) => (each === null ? [] : [each]));
  }
  return [];
}

/** The least and the most `table` is worth over a draw from 0 to 1, flat past its keys. */
function tableReach(table: ProbabilityTable): ValueRange {
  const inner = table.keys.filter((key) => key.time > 0 && key.time < 1);
  const worth = [
    tableValue(table, 0),
    tableValue(table, 1),
    ...inner.map((key) => key.values[0] ?? table.single),
  ];
  return { least: Math.min(...worth), most: Math.max(...worth) };
}

/** The range `values` times `factor` spans, which a sign in either can turn over. */
function corners(values: readonly number[], factor: ValueRange): ValueRange {
  const least = Math.min(...values);
  const most = Math.max(...values);
  const products = [
    least * factor.least,
    least * factor.most,
    most * factor.least,
    most * factor.most,
  ];
  return { least: bound(Math.min(...products)), most: bound(Math.max(...products)) };
}

function bound(value: number): number {
  return Number(value.toPrecision(BOUND_DIGITS));
}

/** The window a curve is drawn over, in the shares of a particle's life its times are. */
export interface TimeSpan {
  readonly first: number;
  readonly last: number;
}

/** The particle's own life, which a curve with no key outside it is read against. */
const LIFE: TimeSpan = { first: 0, last: 1 };

/**
 * The window `times` are drawn over: the particle's life, widened to hold every key.
 *
 * A key time is a share of that life, so 0 to 1 is the reading a modder wants and a
 * ramp keyed over the middle of it has to look like one. A file holds times outside
 * that range, and those widen the window rather than being clipped out of it.
 */
export function timeSpan(times: readonly number[]): TimeSpan {
  if (times.length === 0) return LIFE;
  return { first: Math.min(LIFE.first, ...times), last: Math.max(LIFE.last, ...times) };
}

/** Where `time` lands in `span`, as a share of it from 0 to 1. */
export function placeTime(time: number, span: TimeSpan): number {
  const width = span.last - span.first;
  return width === 0 ? 0 : (time - span.first) / width;
}

/** One stop of a colour's dynamics: when it lands, and the channels there, each 0 to 1. */
export interface ColorStop {
  readonly time: number;
  readonly rgba: readonly [number, number, number, number];
}

/** The keys of a colour as the stops its band paints, a key with no alpha being opaque. */
export function colorStops(keys: readonly CurveKey[]): ColorStop[] {
  const out: ColorStop[] = [];
  for (const key of keys) {
    const [r, g, b, a] = key.values;
    if (r === undefined || g === undefined || b === undefined) continue;
    out.push({ time: key.time, rgba: [r, g, b, a ?? OPAQUE] });
  }
  return out;
}

/**
 * A `vec4` or a `vec3` as four channels, or null for any other value.
 *
 * A component is null where the float is one JSON does not carry, and a colour missing a
 * channel is one nothing can paint. A `vec3` is a `ValueColorRgb`, which is opaque.
 */
export function channels(value: BinValue | null | undefined): ColorStop["rgba"] | null {
  if (value?.type !== "vector") return null;

  const held = components(value);
  if (held === null || (held.length !== 4 && held.length !== 3)) return null;
  return [held[0] ?? 0, held[1] ?? 0, held[2] ?? 0, held[3] ?? OPAQUE];
}

/** A colour as Copy value takes it, the channels rounded to bytes. */
export function colorHex(rgba: ColorStop["rgba"]): string {
  return `#${rgba.map(hexByte).join("")}`;
}

/** The CSS a channel set paints with, the alpha kept as a fraction. */
export function colorCss(rgba: ColorStop["rgba"]): string {
  const [r, g, b, a] = rgba;
  return `rgba(${byte(r)}, ${byte(g)}, ${byte(b)}, ${clamp(a)})`;
}

/**
 * The stops as a CSS gradient, each at its own time in the window they span.
 *
 * The outermost colours hold flat to the ends of the window, which is the value the
 * engine samples outside the keyed range. A curve whose stops share one time draws the
 * last of them.
 */
export function gradientCss(stops: readonly ColorStop[]): string {
  const [only] = stops;
  if (only === undefined) return "";
  if (stops.length === 1) {
    const css = colorCss(only.rgba);
    return `linear-gradient(to right, ${css}, ${css})`;
  }

  const span = timeSpan(stops.map((stop) => stop.time));
  const placed = stops.map((stop) => {
    const at = placeTime(stop.time, span) * 100;
    return `${colorCss(stop.rgba)} ${at.toFixed(2)}%`;
  });
  return `linear-gradient(to right, ${placed.join(", ")})`;
}

function hexByte(channel: number): string {
  return byte(channel).toString(16).padStart(2, "0").toUpperCase();
}

function byte(channel: number): number {
  return Math.round(clamp(channel) * 255);
}

function clamp(channel: number): number {
  return Math.min(Math.max(channel, 0), 1);
}
