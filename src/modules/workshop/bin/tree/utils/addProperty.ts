import type { AddableField, KindShape, NewProperty, PropertyKind } from "@/lib/tauri";

import { nameHash } from "../../shared/utils/binHash";
import { shapeTag } from "../../values/utils/kindTag";

/** What the add line offers for the text typed into it. */
export type AddSuggestion =
  | { readonly kind: "declared"; readonly field: AddableField }
  | {
      readonly kind: "custom";
      readonly field: string;
      readonly shape: KindShape;
      readonly class: string | null;
    };

/** Every kind a typed field names, in ritobin's words. */
const KINDS: ReadonlySet<string> = new Set<PropertyKind>([
  "bool",
  "i8",
  "u8",
  "i16",
  "u16",
  "i32",
  "u32",
  "i64",
  "u64",
  "f32",
  "vec2",
  "vec3",
  "vec4",
  "mtx44",
  "rgba",
  "string",
  "hash",
  "file",
  "link",
  "flag",
  "embed",
  "pointer",
  "list",
  "list2",
  "option",
  "map",
]);

function kindOf(text: string): PropertyKind | null {
  const trimmed = text.trim().toLowerCase();
  return KINDS.has(trimmed) ? (trimmed as PropertyKind) : null;
}

/**
 * A field typed the way ritobin writes one: `name: kind`, `name: list[hash]`,
 * `name: map[hash,string]`, `name: embed = ClassName`. Null for text of another shape.
 */
export function parseTypedField(text: string): Extract<AddSuggestion, { kind: "custom" }> | null {
  const match =
    /^\s*([^:\s][^:]*?)\s*:\s*([a-z0-9]+)\s*(?:\[\s*([a-z0-9]+)\s*(?:,\s*([a-z0-9]+)\s*)?\])?\s*(?:=\s*(\S+)\s*)?$/i.exec(
      text,
    );
  if (match === null) return null;
  const [, field = "", head = "", first, second, className] = match;

  const kind = kindOf(head);
  if (kind === null) return null;
  const inner = first === undefined ? null : kindOf(first);
  const outer = second === undefined ? null : kindOf(second);
  if ((first !== undefined && inner === null) || (second !== undefined && outer === null)) {
    return null;
  }

  let shape: KindShape;
  if (kind === "map") {
    if (inner === null || outer === null) return null;
    shape = { kind, key: inner, value: outer };
  } else if (kind === "list" || kind === "list2" || kind === "option") {
    if (inner === null || outer !== null) return null;
    shape = { kind, key: null, value: inner };
  } else {
    if (inner !== null) return null;
    shape = { kind, key: null, value: null };
  }

  const classed =
    kind === "embed" || kind === "pointer" || shape.value === "embed" || shape.value === "pointer";
  if (className !== undefined && !classed) return null;
  if (kind === "embed" && className === undefined) return null;
  return { kind: "custom", field: field.trim(), shape, class: className ?? null };
}

/** The declared fields whose name or hash holds `search`, the name's prefix matches first. */
export function matchingFields(fields: readonly AddableField[], search: string): AddableField[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") return [...fields];
  const found = fields.filter(
    (field) => field.hash.includes(needle) || (field.name?.toLowerCase().includes(needle) ?? false),
  );
  const leads = (field: AddableField) => (field.name?.toLowerCase().startsWith(needle) ? 0 : 1);
  return found.sort((a, b) => leads(a) - leads(b));
}

/** What the add line lists: a typed field first where the text reads as one, then the declared fields it matches. */
export function suggestionsFor(fields: readonly AddableField[], text: string): AddSuggestion[] {
  const typed = parseTypedField(text);
  const search = typed === null ? text : typed.field;
  const declared = matchingFields(fields, search).map((field): AddSuggestion => ({
    kind: "declared",
    field,
  }));
  if (typed === null) return declared;
  const shadowed = declared.some(
    (each) =>
      each.kind === "declared" && each.field.name?.toLowerCase() === typed.field.toLowerCase(),
  );
  return shadowed ? declared : [typed, ...declared];
}

/** The property a suggestion sends. */
export function propertyOf(suggestion: AddSuggestion): NewProperty {
  if (suggestion.kind === "declared") return { kind: "declared", field: suggestion.field.hash };
  return {
    kind: "custom",
    field: suggestion.field,
    shape: suggestion.shape,
    class: suggestion.class,
  };
}

/** The field hash a suggestion adds, as eight hex digits, which the new row's path ends in. */
export function fieldWire(suggestion: AddSuggestion): string {
  if (suggestion.kind === "declared") return suggestion.field.hash.slice(2);
  const text = suggestion.field.trim();
  if (/^0x[0-9a-f]{8}$/i.test(text)) return text.slice(2).toLowerCase();
  return nameHash(text).slice(2);
}

/** The shape a suggestion adds, which decides whether the new row holds properties of its own. */
export function shapeOf(suggestion: AddSuggestion): KindShape {
  return suggestion.kind === "declared" ? suggestion.field.shape : suggestion.shape;
}

/** A suggestion as the list writes it: the field, then its kind in ritobin's words. */
export function suggestionLabel(suggestion: AddSuggestion): string {
  const name =
    suggestion.kind === "declared"
      ? (suggestion.field.name ?? suggestion.field.hash)
      : suggestion.field;
  return `${name}: ${shapeTag(shapeOf(suggestion))}`;
}
