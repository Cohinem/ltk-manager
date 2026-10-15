import type { BinEdit, LeafValue, PropertyEdit, VfxField, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";

/** The value classes that hold a constant and a curve of keys. */
const VALUE_CLASSES: ReadonlySet<string> = new Set(
  [
    "ValueColor",
    "ValueColorRgb",
    "ValueFloat",
    "ValueVector2",
    "ValueVector3",
    "IntegratedValueFloat",
    "IntegratedValueVector2",
    "IntegratedValueVector3",
  ].map(nameHash),
);

const CONSTANT = nameHash("constantValue");
const DYNAMICS = nameHash("dynamics");
const VALUES = nameHash("values");

/** The most edits one property edit and one grouped edit take, per `property_edit.rs`. */
const MAX_PROPERTY_EDITS = 64;
const MAX_GROUPED_PROPERTIES = 512;

/** One number or vector of a field that an adjustment changes, and its hash path. */
export interface Leaf<Kind> {
  readonly kind: Kind;
  /** The hash path of the struct that holds the field. */
  readonly holder: string;
  /** The field, `0x` and eight hex digits. */
  readonly field: string;
  /** The hash path of the leaf under the field, empty for the field itself. */
  readonly path: string;
  /** `true` if the leaf is one number rather than a vector. */
  readonly scalar: boolean;
  readonly values: readonly number[];
}

/** Returns the kind of `field` in a struct of `fields`, and null for a field that stays. */
export type Pick<Kind> = (field: VfxField, fields: readonly VfxField[]) => Kind | null;

/** Returns the new values of `leaf`. */
export type Visit<Kind> = (leaf: Leaf<Kind>) => readonly number[];

type Address<Kind> = Omit<Leaf<Kind>, "scalar" | "values">;

function step(hash: string): string {
  return hash.slice(2);
}

function join(parent: string, child: string): string {
  return parent === "" ? child : `${parent}.${child}`;
}

function mapLeaf<Kind>(value: VfxValue, at: Address<Kind>, visit: Visit<Kind>): VfxValue {
  if (value.type === "number" && value.value !== null) {
    const [next = value.value] = visit({ ...at, scalar: true, values: [value.value] });
    return { type: "number", value: next };
  }
  if (value.type !== "vector" || value.values.some((each) => each === null)) return value;

  const values = visit({ ...at, scalar: false, values: value.values as number[] });
  return { type: "vector", values: [...values] };
}

/** Returns the field's value with each of its leaves replaced by what `visit` returns. */
function mapField<Kind>(value: VfxValue, at: Address<Kind>, visit: Visit<Kind>): VfxValue {
  if (value.type !== "struct") return mapLeaf(value, at, visit);
  if (!VALUE_CLASSES.has(value.classHash)) return value;

  const fields = value.fields.map((each) => {
    if (each.hash === CONSTANT) {
      return { ...each, value: mapLeaf(each.value, { ...at, path: step(CONSTANT) }, visit) };
    }
    if (each.hash !== DYNAMICS || each.value.type !== "struct") return each;

    const dynamics = each.value.fields.map((inner) => {
      if (inner.hash !== VALUES || inner.value.type !== "container") return inner;

      const base = `${step(DYNAMICS)}.${step(VALUES)}`;
      const items = inner.value.items.map((item, index) =>
        mapLeaf(item, { ...at, path: `${base}[${index}]` }, visit),
      );
      return { ...inner, value: { type: "container" as const, items } };
    });
    return { ...each, value: { ...each.value, fields: dynamics } };
  });
  return { ...value, fields };
}

/**
 * Returns `value` with each leaf of each picked field replaced by what `visit` returns.
 *
 * The walk stops at an object that a link reached, so a child system keeps its values.
 */
export function mapLeaves<Kind>(
  value: VfxValue,
  pick: Pick<Kind>,
  visit: Visit<Kind>,
  at = "",
  top = true,
): VfxValue {
  if (value.type === "container") {
    const items = value.items.map((item, index) =>
      mapLeaves(item, pick, visit, `${at}[${index}]`, false),
    );
    return { ...value, items };
  }
  if (value.type !== "struct" || (!top && value.object !== null)) return value;

  const fields = value.fields.map((field) => {
    const kind = pick(field, value.fields);
    const mapped =
      kind === null
        ? mapLeaves(field.value, pick, visit, join(at, step(field.hash)), false)
        : mapField(field.value, { kind, holder: at, field: field.hash, path: "" }, visit);
    return { ...field, value: mapped };
  });
  return { ...value, fields };
}

function leafValue(scalar: boolean, values: readonly number[]): LeafValue {
  return scalar
    ? { type: "float", value: values[0] ?? null }
    : { type: "vector", values: [...values] };
}

/**
 * Returns the edits that write what `visit` returns for each picked leaf of `root`, the root
 * being the object `entry`.
 *
 * A leaf that `visit` leaves equal takes no edit. Each edit stays under the limits of one grouped
 * edit, so a system of more leaves than one edit holds takes several.
 */
export function leafEdits<Kind>(
  entry: string,
  root: VfxValue,
  pick: Pick<Kind>,
  visit: Visit<Kind>,
): BinEdit[] {
  const byProperty = new Map<string, PropertyEdit>();
  mapLeaves(root, pick, (leaf) => {
    const next = visit(leaf);
    if (next.every((each, at) => each === leaf.values[at])) return next;

    const key = `${leaf.holder}|${leaf.field}`;
    const property = byProperty.get(key) ?? {
      entry,
      holder: leaf.holder,
      field: leaf.field,
      edits: [],
    };
    byProperty.set(key, property);
    property.edits.push({ type: "setLeaf", path: leaf.path, value: leafValue(leaf.scalar, next) });
    return next;
  });

  const properties = [...byProperty.values()].flatMap((property) =>
    chunks(property.edits, MAX_PROPERTY_EDITS).map((edits) => ({ ...property, edits })),
  );
  return chunks(properties, MAX_GROUPED_PROPERTIES).map((edits) => ({
    kind: "editProperties",
    edits,
  }));
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) {
    out.push(items.slice(at, at + size));
  }
  return out;
}
