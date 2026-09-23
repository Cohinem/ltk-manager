import type { BinRow, BinValue, LeafValue, ValueEdit } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import type { LeafEdit } from "../../tree/hooks/useLeafEdit";
import type { CurveKey, ValueFamily } from "../../values/utils/valueRows";
import { keysAt } from "../../vfx/engine/utils/sampleCurve";

export const CURVE_DYNAMICS = nameHash("dynamics");
const TIMES_FIELD = nameHash("times");
const VALUES_FIELD = nameHash("values");
const TIMES = TIMES_FIELD.slice(2);
const VALUES = VALUES_FIELD.slice(2);

interface CurveDynamics {
  readonly className: string;
  readonly family: ValueFamily;
}

const DYNAMICS: ReadonlyMap<string, CurveDynamics> = new Map([
  [nameHash("ValueColor"), { className: "VfxAnimatedColor", family: "color" }],
  [nameHash("ValueColorRgb"), { className: "0x8152c1ec", family: "color" }],
  [nameHash("ValueFloat"), { className: "VfxAnimatedFloat", family: "scalar" }],
  [nameHash("ValueVector2"), { className: "VfxAnimatedVector2f", family: "vector" }],
  [nameHash("ValueVector3"), { className: "VfxAnimatedVector3f", family: "vector" }],
]);

/** The current animated dynamics class accepted by one value-family class. */
export function curveDynamicsClass(valueClass: string | null | undefined): string | null {
  return valueClass === null || valueClass === undefined
    ? null
    : (DYNAMICS.get(valueClass)?.className ?? null);
}

/** Edits that enable a flat, immediately editable curve without changing its visible value. */
export function curveActivationEdits(
  valueClass: string,
  constant: BinValue | null,
  scope: "dynamics" | "value",
): ValueEdit[] | null {
  const dynamics = DYNAMICS.get(valueClass);
  if (dynamics === undefined) return null;

  const values = constantValues(constant, dynamics.family);
  const leaf = curveLeaf(dynamics.family, values);
  if (leaf === null) return null;

  const dynamicsPath = scope === "value" ? CURVE_DYNAMICS.slice(2) : "";
  const timesPath = childPath(dynamicsPath, TIMES);
  const valuesPath = childPath(dynamicsPath, VALUES);
  const edits: ValueEdit[] = [];

  if (scope === "value") {
    edits.push({ type: "ensureProperty", path: "", field: CURVE_DYNAMICS });
  }

  edits.push(
    { type: "ensurePointer", path: dynamicsPath, class: dynamics.className },
    { type: "ensureProperty", path: dynamicsPath, field: TIMES_FIELD },
    { type: "ensureProperty", path: dynamicsPath, field: VALUES_FIELD },
  );

  for (const [at, time] of [0, 1].entries()) {
    const item = { index: at, key: null, class: null };

    edits.push(
      { type: "insertItem", path: timesPath, item },
      { type: "insertItem", path: valuesPath, item },
      { type: "setLeaf", path: `${timesPath}[${at}]`, value: { type: "float", value: time } },
      { type: "setLeaf", path: `${valuesPath}[${at}]`, value: leaf },
    );
  }

  return edits;
}

/** One curve key written as matching items in the dynamics' time and value lists. */
export async function commitCurveKey(
  edit: LeafEdit,
  row: BinRow,
  family: ValueFamily,
  at: number,
  key: CurveKey,
): Promise<boolean> {
  const value = curveLeaf(family, key.values);
  if (edit.editProperty === undefined || value === null || !validTime(key.time)) return false;

  return edit.editProperty(row, CURVE_DYNAMICS, [
    { type: "setLeaf", path: `${TIMES}[${at}]`, value: { type: "float", value: key.time } },
    { type: "setLeaf", path: `${VALUES}[${at}]`, value },
  ]);
}

/** Insert one curve key while keeping the parallel time and value lists in step. */
export async function insertCurveKey(
  edit: LeafEdit,
  row: BinRow,
  family: ValueFamily,
  at: number,
  key: CurveKey,
): Promise<boolean> {
  const value = curveLeaf(family, key.values);
  if (edit.editProperty === undefined || value === null || !validTime(key.time)) return false;

  const item = { index: at, key: null, class: null };
  const edits: ValueEdit[] = [
    { type: "ensureProperty", path: "", field: nameHash("times") },
    { type: "ensureProperty", path: "", field: nameHash("values") },
    { type: "insertItem", path: TIMES, item },
    { type: "insertItem", path: VALUES, item },
    { type: "setLeaf", path: `${TIMES}[${at}]`, value: { type: "float", value: key.time } },
    { type: "setLeaf", path: `${VALUES}[${at}]`, value },
  ];

  return edit.editProperty(row, CURVE_DYNAMICS, edits);
}

/** Remove one curve key as a single undoable edit of both parallel lists. */
export async function removeCurveKey(edit: LeafEdit, row: BinRow, at: number): Promise<boolean> {
  return removeCurveKeys(edit, row, [at]);
}

/** Remove selected curve keys in one undoable edit of both parallel lists. */
export async function removeCurveKeys(
  edit: LeafEdit,
  row: BinRow,
  selected: readonly number[],
): Promise<boolean> {
  if (edit.editProperty === undefined) return false;

  const indices = [...new Set(selected)]
    .filter((at) => at >= 0)
    .sort((left, right) => right - left);
  if (indices.length === 0) return false;

  const edits = indices.flatMap<ValueEdit>((at) => [
    { type: "removeItem", path: `${TIMES}[${at}]` },
    { type: "removeItem", path: `${VALUES}[${at}]` },
  ]);

  return edit.editProperty(row, CURVE_DYNAMICS, edits);
}

/** Where a new key belongs in the curve's time order. */
export function insertionIndex(keys: readonly CurveKey[], time: number): number {
  const after = keys.findIndex((key) => key.time > time);
  return after < 0 ? keys.length : after;
}

/** A useful first value for Add key, beside the selected key and on the current curve. */
export function suggestedCurveKey(
  keys: readonly CurveKey[],
  constant: BinValue | null,
  family: ValueFamily,
  selected: number,
): CurveKey {
  if (keys.length === 0) {
    return { time: 0, values: constantValues(constant, family) };
  }

  const current = keys[Math.min(Math.max(selected, 0), keys.length - 1)] ?? keys[0]!;
  const next = keys[selected + 1];
  let time: number;
  if (next !== undefined) {
    time = (current.time + next.time) / 2;
  } else if (current.time < 1) {
    time = (current.time + 1) / 2;
  } else {
    time = current.time + 0.25;
  }

  return { time, values: keysAt(keys, time) };
}

function curveLeaf(family: ValueFamily, values: readonly number[]): LeafValue | null {
  if (!values.every(validFloat)) return null;
  if (family === "scalar") {
    const [value] = values;
    return values.length === 1 && value !== undefined ? { type: "float", value } : null;
  }

  const validWidth = family === "color" ? values.length === 3 || values.length === 4 : true;
  return validWidth && values.length > 1 ? { type: "vector", values: [...values] } : null;
}

function constantValues(constant: BinValue | null, family: ValueFamily): number[] {
  if (constant?.type === "float" && constant.value !== null) return [constant.value];
  if (constant?.type === "vector") {
    const values = constant.values.filter((value): value is number => value !== null);
    if (values.length === constant.values.length) return values;
  }
  if (constant?.type === "color") {
    return [constant.r, constant.g, constant.b, constant.a];
  }

  if (family === "scalar") return [0];
  if (family === "color") return [0, 0, 0, 1];
  return [0, 0, 0];
}

function childPath(parent: string, child: string): string {
  return parent === "" ? child : `${parent}.${child}`;
}

function validTime(value: number): boolean {
  return validFloat(value);
}

function validFloat(value: number): boolean {
  return Number.isFinite(value) && Number.isFinite(Math.fround(value));
}
