import { m } from "@/i18n";

import { nameHash } from "../../../shared/utils/binHash";
import type { DriverNode } from "../../engine/drivers/node";
import { driverClass } from "../../engine/drivers/registry";
import type { GraphItem, InputItem, ValueItem } from "./graphItems";

const EMITTER_CLASS = "VfxShimmerEmitterDefinitionData";

/** The class of a graph item: its name where anything names it, and its hash. */
export interface ItemClass {
  readonly name: string | null;
  readonly hash: string;
}

/** The name a node's header leads with: an emitter's name, a field, a driver's role. */
export function itemTitle(item: GraphItem): string {
  switch (item.type) {
    case "preview":
      return m.workshop_bin_pane_preview_label();
    case "emitter":
    case "master":
      return item.name;
    case "component":
      return item.slot;
    case "struct":
      return item.label;
    case "file":
      return fileName(item.path);
    case "value":
      if (item.curve.keys.length > 0) return m.workshop_bin_driver_curve_label();
      return m.workshop_bin_driver_random_label();
    case "driver":
      return driverTitle(item.node);
  }
}

/** The class a node's header names under its title, and empty where the title is the class. */
export function itemSubtitle(item: GraphItem): string {
  if (item.type === "driver" && item.node.type === "unknown") return "";
  if (item.type === "file") return item.path;

  const held = itemClass(item);
  return held === null ? "" : (held.name ?? held.hash);
}

/** The summary an input row of a master or struct node shows for the node connected to it. */
export function inputSummary(input: InputItem): string {
  if (input.type === "value") return valueSummary(input);
  if (input.type === "file") return fileName(input.path);

  switch (input.shape) {
    case "struct":
      return input.className ?? input.classHash ?? "";
    case "list":
      return m.workshop_bin_items_label({ count: input.rows.length });
    case "map":
      return m.workshop_bin_entries_label({ count: input.rows.length });
  }
}

/** A keyed value's key count, and Random where it carries probability tables. */
export function valueSummary(item: ValueItem): string {
  const { keys, tables } = item.curve;
  const parts = [];
  if (keys.length > 0) parts.push(m.workshop_bin_driver_curve_keys_label({ count: keys.length }));
  if (tables.length > 0) parts.push(m.workshop_bin_driver_random_label());
  return parts.join(" · ");
}

/** The class a graph item stands for, and null for the preview, a list and an empty pointer. */
export function itemClass(item: GraphItem): ItemClass | null {
  switch (item.type) {
    case "preview":
    case "file":
      return null;
    case "emitter":
      return { name: EMITTER_CLASS, hash: nameHash(EMITTER_CLASS) };
    case "component":
      return item.classHash === "" ? null : { name: item.className, hash: item.classHash };
    case "master":
    case "value":
      return item.classHash === "" ? null : { name: item.className, hash: item.classHash };
    case "struct":
      return item.classHash === null ? null : { name: item.className, hash: item.classHash };
    case "driver":
      return driverNodeClass(item.node);
  }
}

function driverNodeClass(node: DriverNode): ItemClass | null {
  switch (node.type) {
    case "empty":
      return null;
    case "unknown":
      if (node.value.type !== "struct") return null;
      return { name: node.value.class ?? null, hash: node.value.classHash };
    case "constant":
    case "curve":
    case "operator":
    case "random":
    case "easing":
    case "property": {
      const name = driverClass(node.classHash)?.name ?? node.classHash;
      return { name: name === node.classHash ? null : name, hash: node.classHash };
    }
  }
}

function driverTitle(node: DriverNode): string {
  switch (node.type) {
    case "constant":
      return m.workshop_bin_driver_constant_label();
    case "curve":
      if (node.curve.keys.length === 0) return m.workshop_bin_driver_curve_flat_label();
      return m.workshop_bin_driver_curve_label();
    case "operator":
      return m.workshop_bin_driver_operator_label({ operator: node.operator });
    case "random":
      return m.workshop_bin_driver_random_label();
    case "easing":
      return m.workshop_bin_driver_easing_label();
    case "property":
      return m.workshop_bin_driver_property_label();
    case "unknown":
      if (node.value.type === "struct") return node.value.class ?? node.value.classHash;
      return m.workshop_bin_driver_unknown_label();
    case "empty":
      return m.workshop_bin_driver_empty_label();
  }
}

/** A value as a driver writes it: one number bare, several in parentheses. */
export function formatValues(values: readonly number[]): string {
  const text = values.map(formatNumber);
  return text.length === 1 ? text[0]! : `(${text.join(", ")})`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

/** The last segment of a path, which names the file. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}
