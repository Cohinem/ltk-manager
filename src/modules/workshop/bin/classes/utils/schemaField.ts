import type { FieldSchema } from "@/lib/tauri";

import { shapeTag } from "../../values/utils/kindTag";

type Rgba = readonly [number, number, number, number];

/** A schema default as its row draws it: the text, and a colour where it is one. */
export interface DefaultText {
  readonly text: string;
  /** Channels from 0 to 1, for a swatch beside the text. */
  readonly rgba: Rgba | null;
}

/** How a colour default writes its channels: 0 to 1 for a value family, 0 to 255 for `rgba`. */
export type ColorScale = "unit" | "byte";

/**
 * The schema's constructor default `json` in the row's own notation, or null where the card
 * shows no default.
 *
 * A value family is its constant. A struct, a pointer, a container and an absent option have
 * no line, since their default is their class's own. `color` marks a default that is a colour.
 */
export function defaultText(json: string, color: ColorScale | null): DefaultText | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }

  if (isRecord(value) && "constantValue" in value) value = value.constantValue;
  if (typeof value === "number") return { text: formatNumber(value), rgba: null };
  if (typeof value === "boolean") return { text: String(value), rgba: null };
  if (typeof value === "string") return { text: JSON.stringify(value), rgba: null };
  if (!isNumbers(value) || value.length === 0) return null;

  return { text: value.map(formatNumber).join(", "), rgba: colorOf(value, color) };
}

/**
 * Whether a row's label says the same words as the field's name, so the card needs no title
 * above the name. Case, spacing and the engine's `m` prefix do not count.
 */
export function sameWords(label: string, name: string): boolean {
  const words = (text: string) => text.replace(/^m(?=[A-Z])/, "").replace(/[^A-Za-z0-9]/g, "");
  return words(label).toLowerCase() === words(name).toLowerCase();
}

/**
 * The type the field had before its current one, and the patch it changed at. Null where
 * every revision has the current type.
 */
export function earlierType(field: FieldSchema): { tag: string; patch: string | null } | null {
  const current = field.revisions.at(-1);
  if (current?.shape == null) return null;

  const tag = shapeTag(current.shape);
  const earlier = field.revisions
    .slice(0, -1)
    .map((revision) => (revision.shape === null ? null : shapeTag(revision.shape)))
    .filter((shown) => shown !== null && shown !== tag)
    .at(-1);
  if (earlier == null) return null;

  return { tag: earlier, patch: current.patch };
}

function colorOf(channels: readonly number[], color: ColorScale | null): Rgba | null {
  if (color === null || channels.length !== 4) return null;

  const scale = color === "byte" ? 255 : 1;
  const [r, g, b, a] = channels.map((channel) => channel / scale);
  return [r!, g!, b!, a!];
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}
