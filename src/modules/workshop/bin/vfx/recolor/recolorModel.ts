import type { BinEdit, PropertyEdit, VfxSystem, VfxValue } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";

/** The emitter fields that hold a tint, so `erosionMapChannelMixer` and the palette weights stay. */
const COLOR_FIELDS: ReadonlySet<string> = new Set(
  [
    "color",
    "birthColor",
    "colorModulate",
    "mAnimatedColorWithDistance",
    "SeparateLingerColor",
    "fresnelColor",
    "reflectionFresnelColor",
  ].map(nameHash),
);

const VALUE_CLASSES: ReadonlySet<string> = new Set([
  nameHash("ValueColor"),
  nameHash("ValueColorRgb"),
]);

const CONSTANT = nameHash("constantValue");
const DYNAMICS = nameHash("dynamics");
const VALUES = nameHash("values");

/** The most edits one property edit and one grouped edit take, per `property_edit.rs`. */
const MAX_PROPERTY_EDITS = 64;
const MAX_GROUPED_PROPERTIES = 512;

/** One color of the system, and the hash path of its property. */
export interface ColorLeaf {
  /** The hash path of the struct that holds the color field. */
  readonly holder: string;
  /** The color field, `0x` and eight hex digits. */
  readonly field: string;
  /** The hash path of the color under the field, empty for the field itself. */
  readonly path: string;
  readonly values: readonly number[];
}

/** Returns the color `values` with the hue turned by `degrees`. Alpha is unchanged. */
export function shiftHue(values: readonly number[], degrees: number): number[] {
  const [r, g, b, ...rest] = values;
  if (r === undefined || g === undefined || b === undefined) return [...values];

  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma === 0 || Math.min(r, g, b) < 0) return [...values];

  let hue: number;
  if (max === r) {
    hue = ((g - b) / chroma) % 6;
  } else if (max === g) {
    hue = (b - r) / chroma + 2;
  } else {
    hue = (r - g) / chroma + 4;
  }
  hue = (((hue + degrees / 60) % 6) + 6) % 6;

  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const low = max - chroma;
  const sector = Math.floor(hue);
  const rgb = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][sector] ?? [chroma, x, 0];
  return [...rgb.map((channel) => channel + low), ...rest];
}

function step(hash: string): string {
  return hash.slice(2);
}

function join(parent: string, child: string): string {
  return parent === "" ? child : `${parent}.${child}`;
}

function numbers(value: VfxValue | undefined): number[] | null {
  if (value?.type !== "vector" || value.values.length < 3) return null;
  return value.values.every((each) => each !== null) ? (value.values as number[]) : null;
}

type Visit = (leaf: ColorLeaf) => readonly number[];

function mapLeaf(value: VfxValue, leaf: Omit<ColorLeaf, "values">, visit: Visit): VfxValue {
  const values = numbers(value);
  return values === null ? value : { type: "vector", values: [...visit({ ...leaf, values })] };
}

/** Returns the color field's value with each of its colors replaced by what `visit` returns. */
function mapColorField(value: VfxValue, holder: string, field: string, visit: Visit): VfxValue {
  if (value.type === "vector") return mapLeaf(value, { holder, field, path: "" }, visit);
  if (value.type !== "struct" || !VALUE_CLASSES.has(value.classHash)) return value;

  const fields = value.fields.map((each) => {
    if (each.hash === CONSTANT) {
      return {
        ...each,
        value: mapLeaf(each.value, { holder, field, path: step(CONSTANT) }, visit),
      };
    }
    if (each.hash !== DYNAMICS || each.value.type !== "struct") return each;

    const dynamics = each.value.fields.map((inner) => {
      if (inner.hash !== VALUES || inner.value.type !== "container") return inner;

      const base = `${step(DYNAMICS)}.${step(VALUES)}`;
      const items = inner.value.items.map((item, at) =>
        mapLeaf(item, { holder, field, path: `${base}[${at}]` }, visit),
      );
      return { ...inner, value: { type: "container" as const, items } };
    });
    return { ...each, value: { ...each.value, fields: dynamics } };
  });
  return { ...value, fields };
}

/**
 * Returns `value` with each tint of the system replaced by what `visit` returns.
 *
 * The walk stops at an object that a link reached, so a child system keeps its colors.
 */
export function mapColors(value: VfxValue, visit: Visit, at = "", top = true): VfxValue {
  if (value.type === "container") {
    const items = value.items.map((item, index) =>
      mapColors(item, visit, `${at}[${index}]`, false),
    );
    return { ...value, items };
  }
  if (value.type !== "struct" || (!top && value.object !== null)) return value;

  const fields = value.fields.map((field) => {
    const mapped = COLOR_FIELDS.has(field.hash)
      ? mapColorField(field.value, at, field.hash, visit)
      : mapColors(field.value, visit, join(at, step(field.hash)), false);
    return { ...field, value: mapped };
  });
  return { ...value, fields };
}

/** Returns `root` with the hue of each tint turned by `degrees`. */
export function recoloredRoot(root: VfxValue, degrees: number): VfxValue {
  return mapColors(root, (leaf) => shiftHue(leaf.values, degrees));
}

/**
 * Returns the edits that turn the hue of each tint of `system` by `degrees`.
 *
 * A color that the shift leaves equal takes no edit. Each edit stays under the limits of one
 * grouped edit, so a system of more tints than one edit holds takes several.
 */
export function recolorEdits(system: VfxSystem, degrees: number): BinEdit[] {
  const byProperty = new Map<string, PropertyEdit>();
  mapColors(system.root, (leaf) => {
    const shifted = shiftHue(leaf.values, degrees);
    if (shifted.every((each, at) => each === leaf.values[at])) return shifted;

    const key = `${leaf.holder}|${leaf.field}`;
    const property = byProperty.get(key) ?? {
      entry: system.entry,
      holder: leaf.holder,
      field: leaf.field,
      edits: [],
    };
    byProperty.set(key, property);
    property.edits.push({
      type: "setLeaf",
      path: leaf.path,
      value: { type: "vector", values: shifted },
    });
    return shifted;
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
