import type { DriverNode } from "../../engine/drivers/node";
import { socketList } from "./entryLists";
import type { GraphItem, StructItem } from "./graphItems";
import { fieldAlias, itemSubtitle, itemTitle, pathAlias } from "./nodeText";
import { rowValueWidth, VALUE_WIDTH } from "./rowWidth";
import { LABEL_TEXT, type MeasureText, META_TEXT, ROW_TEXT } from "./textWidth";

/** The number of fields a node of an unknown class lists before it counts the rest. */
export const UNKNOWN_FIELD_LINES = 8;

/** The narrowest and the widest a column of nodes draws. */
const MIN_NODE_WIDTH = 232;
const MAX_NODE_WIDTH = 440;

/** A header's padding, collapse caret, glyph and reveal button, and one chip beside a title. */
const HEADER_CHROME = 104;
const CHIP_WIDTH = 72;

/** A port row's padding and kind label, and a driver subtitle's kind label. */
const PORT_CHROME = 64;

/** The pop-out button beside a driver embedded in a socket. */
const EMBED_BUTTON_WIDTH = 24;
const KIND_LABEL_WIDTH = 36;

/** The field a value of 1 to 4 components edits in, the label beside a stored one, and padding. */
const VALUE_LABEL_WIDTH = 64;
const BODY_CHROME = 16;

/** A struct node's name column, from the inspector's 9rem up, and its value column. */
const STRUCT_NAME_WIDTH = { min: 144, max: 248 } as const;
const STRUCT_VALUE_WIDTH = { min: 200, max: 300 } as const;

/** A name's gutter and padding, and a class picker's caret and padding. */
const NAME_CHROME = 32;

/** An easing body's function name beside its time. */
const EASING_LINE_WIDTH = 200;

/** The indent of a list entry's name under its row. */
const ENTRY_INDENT = 12;

/** A struct node's own struct and every struct folded into it as a section, outermost first. */
function sectionsOf(item: StructItem): StructItem[] {
  return item.nested === null ? [item] : [item, ...sectionsOf(item.nested)];
}

/** A struct node's width: its name column beside its widest value. */
export function structWidth(item: StructItem, measure: MeasureText): number {
  const rows = sectionsOf(item).flatMap((section) =>
    section.rows.flatMap((row) => [row, ...(socketList(item, row.input)?.rows ?? [])]),
  );
  const value = Math.max(STRUCT_VALUE_WIDTH.min, ...rows.map(rowValueWidth));
  return Math.ceil(structNameWidth(item, measure) + value + BODY_CHROME);
}

/**
 * A struct node's name column: as wide as its longest row name, and no narrower than the
 * inspector's own column.
 */
export function structNameWidth(item: StructItem, measure: MeasureText): number {
  const names = sectionsOf(item).flatMap((section) =>
    section.rows.flatMap((row) => [
      measure(fieldAlias(row.name, row.key.startsWith("0x") ? row.key : null), LABEL_TEXT),
      ...(row.entries ?? []).map((entry) => measure(entry.key, ROW_TEXT) + ENTRY_INDENT),
    ]),
  );
  const longest = Math.max(0, ...names);
  const natural = Math.ceil(longest) + NAME_CHROME;
  return Math.min(STRUCT_NAME_WIDTH.max, Math.max(STRUCT_NAME_WIDTH.min, natural));
}

/** The width a node's header, ports and driver body ask for, within a column's bounds. */
export function naturalWidth(item: GraphItem, measure: MeasureText): number {
  const title = measure(itemTitle(item), LABEL_TEXT) + chipCount(item) * CHIP_WIDTH;
  const kind = item.type === "driver" ? KIND_LABEL_WIDTH : 0;
  const subtitle = measure(itemSubtitle(item), META_TEXT) + kind;
  const header = HEADER_CHROME + Math.max(title, subtitle);
  const ports = item.ports.map(
    (port) =>
      PORT_CHROME +
      measure(pathAlias(port.label), ROW_TEXT) +
      (port.embed?.type === "driver"
        ? bodyWidth(port.embed.node, measure) + EMBED_BUTTON_WIDTH
        : 0),
  );
  const body = item.type === "driver" ? bodyWidth(item.node, measure) : 0;

  const natural = Math.max(header, body, ...ports);
  return Math.ceil(Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, natural)));
}

/** The chips a header draws beside its title: disabled, or a trust level. */
function chipCount(item: GraphItem): number {
  if (item.type === "emitter") return item.disabled ? 1 : 0;
  if (item.type !== "driver") return 0;
  return item.diagnostics.length > 0 || item.node.type === "unknown" ? 1 : 0;
}

function bodyWidth(node: DriverNode, measure: MeasureText): number {
  switch (node.type) {
    case "constant":
      return BODY_CHROME + valueWidth(node.value);
    case "curve":
      if (node.curve.keys.length > 0) return 0;
      return BODY_CHROME + valueWidth(node.curve.constant);
    case "operator":
      return widest(node.stored.map((each) => VALUE_LABEL_WIDTH + valueWidth(each.value)));
    case "random":
      return BODY_CHROME + VALUE_LABEL_WIDTH + valueWidth(node.range);
    case "easing":
      return BODY_CHROME + EASING_LINE_WIDTH;
    case "unknown": {
      if (node.value.type !== "struct") return 0;
      const shown = node.value.fields.slice(0, UNKNOWN_FIELD_LINES);
      return widest(
        shown.map((field) => 2 * KIND_LABEL_WIDTH + measure(field.name ?? field.hash, META_TEXT)),
      );
    }
    case "property":
    case "empty":
      return 0;
  }
}

/** The widest of a body's lines, with the body's padding. Zero for a body of no lines. */
function widest(lines: readonly number[]): number {
  return lines.length === 0 ? 0 : BODY_CHROME + Math.max(...lines);
}

function valueWidth(value: readonly number[]): number {
  return VALUE_WIDTH[Math.min(value.length, 4)] ?? 0;
}
