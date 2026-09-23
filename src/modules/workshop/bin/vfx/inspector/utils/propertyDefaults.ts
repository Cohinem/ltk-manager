import type { BinRow, BinValue, FieldSchema, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";
import { fieldHash } from "../../../tree/utils/binRows";
import { parseDefault } from "./defaultValue";

/** Constructor equality on the authored subtree, including curves and random tables. */
export function matchesDefault(value: VfxValue, expected: unknown): boolean {
  if (expected === undefined) {
    return false;
  }

  switch (value.type) {
    case "bool":
    case "string":
      return value.value === expected;
    case "number":
      return sameNumber(value.value, expected);
    case "vector":
    case "matrix":
      return sameVector(value.values, expected);
    case "hash":
    case "link":
      return sameHash(value.hash, expected);
    case "asset":
      return value.path === expected;
    case "null":
    case "none":
      return expected === null;
    case "container":
      return (
        Array.isArray(expected) &&
        value.items.length === expected.length &&
        value.items.every((item, index) => matchesDefault(item, expected[index]))
      );
    case "map":
      return isRecord(expected) && value.entries.length === 0 && Object.keys(expected).length === 0;
    case "struct": {
      if (!isRecord(expected)) {
        return false;
      }

      const defaults = new Map(
        Object.entries(expected).map(([name, child]) => [nameHash(name), child]),
      );

      return value.fields.every(
        (field) =>
          defaults.has(field.hash) && matchesDefault(field.value, defaults.get(field.hash)),
      );
    }
    default:
      return false;
  }
}

/** Only proven defaults fold. Unknown or partially read authored values stay visible. */
export function rowHasDefault(
  row: BinRow,
  schema: readonly FieldSchema[] | undefined,
  emitter: VfxValue | null | undefined,
): boolean {
  if (row.declared?.mismatch) {
    return false;
  }

  const hash = fieldHash(row.path);
  const definition = schema?.find((field) => field.hash === hash);
  const expected = parseDefault(definition?.defaultValue);
  if (expected === undefined) {
    return false;
  }

  const value =
    emitter?.type === "struct"
      ? emitter.fields.find((field) => field.hash === hash)?.value
      : undefined;

  if (value?.type === "struct" && value.classHash !== definition?.classHash) {
    return false;
  }

  return value === undefined
    ? rowMatchesDefault(row.value, expected)
    : matchesDefault(value, expected);
}

/** A component with no authored departures from its constructor values. */
export function componentHasDefaults(
  value: VfxValue,
  schema: readonly FieldSchema[] | undefined,
): boolean {
  if (value.type !== "struct") {
    return false;
  }

  return value.fields.every((field) => {
    const definition = schema?.find((item) => item.hash === field.hash);
    if (field.value.type === "struct" && field.value.classHash !== definition?.classHash) {
      return false;
    }

    return matchesDefault(field.value, parseDefault(definition?.defaultValue));
  });
}

function rowMatchesDefault(value: BinValue, expected: unknown): boolean {
  switch (value.type) {
    case "bool":
    case "string":
      return value.value === expected;
    case "float":
      return sameNumber(value.value, expected);
    case "integer":
      return (
        typeof expected === "number" &&
        Number.isSafeInteger(expected) &&
        value.text === String(expected)
      );
    case "vector":
    case "matrix":
      return sameVector(value.values, expected);
    case "color":
      return sameVector([value.r, value.g, value.b, value.a], expected);
    case "hash":
    case "objectLink":
    case "wadChunkLink":
      return sameHash(value.hash, expected);
    case "null":
      return expected === null;
    case "optional":
      return !value.present && expected === null;
    case "container":
      return value.len === 0 && Array.isArray(expected) && expected.length === 0;
    case "map":
      return value.len === 0 && isRecord(expected) && Object.keys(expected).length === 0;
    default:
      return false;
  }
}

function sameNumber(value: number | null, expected: unknown): boolean {
  return (
    typeof value === "number" &&
    typeof expected === "number" &&
    Number.isFinite(value) &&
    (value === expected || value === Math.fround(expected))
  );
}

function sameVector(values: readonly (number | null)[], expected: unknown): boolean {
  if (!Array.isArray(expected)) {
    return false;
  }

  const cells: unknown[] = expected.flat();
  return (
    values.length === cells.length &&
    values.every((value, index) => sameNumber(value, cells[index]))
  );
}

function sameHash(hash: string, expected: unknown): boolean {
  if (typeof expected === "number") {
    return Number.isSafeInteger(expected) && Number(hash) === expected;
  }

  return typeof expected === "string" && hash.toLowerCase() === expected.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
