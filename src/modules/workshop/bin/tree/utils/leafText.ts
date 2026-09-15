import type { BinValue, EditRejection, LeafValue } from "@/lib/tauri";

/**
 * What a reader typed, as the value a leaf edit sends or the refusal it would meet.
 *
 * The frontend turns down what JSON cannot carry and what a byte cannot hold, so the
 * common mistake never round-trips. The backend decides the rest. "Validation" in
 * docs/ux/BIN_EDITOR.md.
 */
export type TypedLeaf =
  | { readonly ok: true; readonly leaf: LeafValue }
  | { readonly ok: false; readonly rejection: EditRejection };

function typed(leaf: LeafValue): TypedLeaf {
  return { ok: true, leaf };
}

function refused(rejection: EditRejection): TypedLeaf {
  return { ok: false, rejection };
}

export function boolLeaf(value: boolean): TypedLeaf {
  return typed({ type: "bool", value });
}

/** The digits as typed. The integer's kind is the backend's to check. */
export function integerLeaf(text: string): TypedLeaf {
  return typed({ type: "integer", text: text.trim() });
}

/** The finite number `text` writes, or null. */
function finite(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

export function floatLeaf(text: string): TypedLeaf {
  const value = finite(text);
  if (value === null) return refused({ reason: "notFinite" });
  return typed({ type: "float", value });
}

/** `values` with the component `at` replaced by `text`, or null where one is not finite. */
function replaced(values: readonly (number | null)[], at: number, text: string): number[] | null {
  const component = finite(text);
  if (component === null) return null;
  const next: number[] = [];
  for (const [index, held] of values.entries()) {
    const cell = index === at ? component : held;
    if (cell === null) return null;
    next.push(cell);
  }
  return next;
}

/** The vector `values` with the component `at` replaced by `text`. */
export function vectorLeaf(
  values: readonly (number | null)[],
  at: number,
  text: string,
): TypedLeaf {
  const next = replaced(values, at, text);
  if (next === null) return refused({ reason: "notFinite" });
  return typed({ type: "vector", values: next });
}

/** The matrix `values`, row-major, with the cell `at` replaced by `text`. */
export function matrixLeaf(
  values: readonly (number | null)[],
  at: number,
  text: string,
): TypedLeaf {
  const next = replaced(values, at, text);
  if (next === null) return refused({ reason: "notFinite" });
  return typed({ type: "matrix", values: next });
}

/** A string as typed, spaces and all. */
export function stringLeaf(text: string): TypedLeaf {
  return typed({ type: "string", value: text });
}

/** A name or its hex, for a `hash`, a `link` or a `file`. Nothing typed names nothing. */
export function hashedLeaf(type: "hash" | "objectLink" | "wadChunkLink", text: string): TypedLeaf {
  if (text.trim() === "") return refused({ reason: "malformedHash" });
  return typed({ type, text: text.trim() });
}

/** The colour with the channel `at`, in `rgba` order, replaced by `text`. */
export function colorLeaf(
  color: Extract<BinValue, { type: "color" }>,
  at: number,
  text: string,
): TypedLeaf {
  const trimmed = text.trim();
  const channel = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!(channel >= 0 && channel <= 255)) return refused({ reason: "outOfRange", kind: "u8" });
  const channels = [color.r, color.g, color.b, color.a].map((held, index) =>
    index === at ? channel : held,
  );
  const [r = 0, g = 0, b = 0, a = 0] = channels;
  return typed({ type: "color", r, g, b, a });
}
