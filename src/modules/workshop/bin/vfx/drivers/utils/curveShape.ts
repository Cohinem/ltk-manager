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

/** A value node's shape, which its strip draws. A colour's row draws its band already. */
export function stripShape(item: ValueItem): "keys" | "tables" | null {
  const shape = curveShape(item.curve, classFamily(item.classHash) === "color");
  return shape === "band" ? null : shape;
}
