import type { BankNode, NodeProperty } from "@/lib/tauri";

/** The value that an object without the property plays with, as the backend removes it. */
export const PROPERTY_DEFAULTS: Readonly<Record<NodeProperty, number>> = {
  volume: 0,
  makeUpGain: 0,
  pitch: 0,
  lpf: 0,
  hpf: 0,
  delay: 0,
  loopCount: 1,
};

/** Wwise shows a playlist weight as the stored value divided by this. */
const WEIGHT_SCALE = 1000;

/** The digits after the point that a plate shows. */
const DECIMALS = 3;

/** The most nodes that the child picker lists for one query. */
const PICKER_LIMIT = 50;

/** The highest object ID, a `u32`. */
const MAX_ID = 0xffff_ffff;

/** Returns `value` with at most three decimals and no trailing zeros. */
export function formatValue(value: number): string {
  const scale = 10 ** DECIMALS;
  const rounded = Math.round(value * scale) / scale;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/**
 * Returns the number that `text` holds for `property`.
 *
 * Returns the property's default if the text is empty, and null if it is not a number.
 */
export function parseValue(text: string, property: NodeProperty): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return PROPERTY_DEFAULTS[property];

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Returns a stored playlist weight in the units Wwise shows. */
export function weightText(weight: number): string {
  return formatValue(weight / WEIGHT_SCALE);
}

/** Returns the stored weight that `text` holds, or null if it is not a number of zero or more. */
export function parseWeight(text: string): number | null {
  const value = Number(text.trim());
  if (text.trim() === "" || !Number.isFinite(value) || value < 0) return null;

  return Math.round(value * WEIGHT_SCALE);
}

/** Returns the decimal object or source ID that `text` holds, with or without a leading `#`. */
export function parseId(text: string): number | null {
  const digits = text.trim().replace(/^#/, "");
  if (!/^\d+$/.test(digits)) return null;

  const id = Number(digits);
  return id <= MAX_ID ? id : null;
}

/**
 * Returns the nodes whose decimal ID or kind name contains `query`, leaving out `exclude`.
 *
 * Returns the first fifty, in the order of `nodes`.
 */
export function matchingNodes(
  nodes: readonly BankNode[],
  query: string,
  exclude: ReadonlySet<number>,
): BankNode[] {
  const needle = query.trim().replace(/^#/, "").toLowerCase();
  const matches: BankNode[] = [];
  for (const node of nodes) {
    if (exclude.has(node.id)) continue;

    const found =
      needle === "" ||
      String(node.id).includes(needle) ||
      node.kindName.toLowerCase().includes(needle);
    if (!found) continue;

    matches.push(node);
    if (matches.length === PICKER_LIMIT) break;
  }
  return matches;
}
