import { valueLines } from "./curveShape";
import {
  bodyLines,
  FIELD_PADDING,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  VALUE_HEADER_HEIGHT,
} from "./driverLayout";
import type { GraphItem } from "./graphItems";

/** The depth of a node's right output socket below its top edge, level with what it outputs. */
export function outputTop(item: GraphItem): number {
  if (item.type === "value") {
    return VALUE_HEADER_HEIGHT + FIELD_PADDING + (valueLines(item) * LINE_HEIGHT) / 2;
  }

  if (item.type === "driver") {
    const lines = bodyLines(item.node);
    if (lines === 0) return HEADER_HEIGHT / 2;

    return HEADER_HEIGHT + (item.ports.length + lines / 2) * LINE_HEIGHT;
  }

  return HEADER_HEIGHT / 2;
}
