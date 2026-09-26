import { classFamily } from "../../../values/utils/valueRows";
import type { ValueCurve } from "../../engine/model/model";
import type { ValueItem } from "./graphItems";

/** The box a node plots a curve in, which the strip or the plate stretches to its own shape. */
export const CURVE_BOX = { width: 100, height: 60, margin: 0.08 } as const;

/** How a curve draws as a picture: a colour band, its keys' lines, its tables' lines, or not. */
export type CurveShape = "band" | "keys" | "tables" | null;

export function curveShape(curve: ValueCurve, color: boolean): CurveShape {
  if (color) return "band";
  if (curve.keys.length > 1) return "keys";
  if (curve.tables.some((table) => table.keys.length > 1)) return "tables";
  return null;
}

/** A value node's shape: its curve as its body, its tables beside its editor, or neither. */
export function valueShape(item: ValueItem): CurveShape {
  return curveShape(item.curve, classFamily(item.classHash) === "color");
}

/** The lines a value node's body takes: its curve over two, else its editor on one. */
export function valueLines(item: ValueItem): number {
  return valueShape(item) === "keys" ? 2 : 1;
}
