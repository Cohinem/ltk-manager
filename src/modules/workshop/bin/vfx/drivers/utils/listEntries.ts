import type { VfxValue } from "@/lib/tauri";

import type { ListEntry } from "./graphItems";
import { fileName, formatValues } from "./nodeText";

/** The values an entry writes after its name, so a sampler's addressing and filters stay off. */
const SHOWN_VALUES = 2;

/**
 * The items of a list or map as lines of the node holding it, and null for any other value.
 *
 * An item's name is its first string field, as a parameter, a sampler and a switch each
 * carry one.
 */
export function listEntries(value: VfxValue): ListEntry[] | null {
  if (value.type === "container") {
    return value.items.map((item, index) => entryOf(item, `[${index}]`));
  }
  if (value.type === "map") return value.entries.map((entry) => entryOf(entry.value, entry.key));
  return null;
}

function entryOf(value: VfxValue, place: string): ListEntry {
  if (value.type !== "struct") return { key: place, text: valueText(value) };

  const named = value.fields.find((field) => field.value.type === "string");
  const rest = value.fields
    .filter((field) => field !== named)
    .map((field) => valueText(field.value))
    .filter((text) => text !== "")
    .slice(0, SHOWN_VALUES);
  const key = named?.value.type === "string" ? named.value.value : place;

  return { key, text: rest.join(" · ") };
}

function valueText(value: VfxValue): string {
  switch (value.type) {
    case "bool":
      return String(value.value);
    case "number":
      return formatValues([value.value ?? Number.NaN]);
    case "vector":
    case "matrix":
      return formatValues(value.values.map((each) => each ?? Number.NaN));
    case "string":
      return value.value;
    case "hash":
    case "link":
      return value.name ?? value.hash;
    case "asset":
      return fileName(value.path);
    case "struct":
      return value.class ?? value.classHash;
    case "container":
      return `[${value.items.length}]`;
    case "map":
      return `{${value.entries.length}}`;
    case "null":
    case "none":
    case "undrawn":
      return "";
  }
}
