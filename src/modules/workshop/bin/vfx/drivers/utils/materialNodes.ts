import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";

/**
 * The classes a material node stands for: a material, and each struct that holds one. A classic
 * emitter holds its custom material in `VfxMaterialDefinitionData`, and a render component in one
 * of the two `VfxMaterialContainer` classes no table names, `0xd2807c60` embedding it and
 * `0x44ad896b` linking it.
 */
export const MATERIAL_CLASSES: ReadonlySet<string> = new Set([
  ...["StaticMaterialDef", "VfxMaterialContainer", "VfxMaterialDefinitionData"].map((name) =>
    nameHash(name),
  ),
  "0xd2807c60",
  "0x44ad896b",
]);

const STATIC_MATERIAL = nameHash("StaticMaterialDef");

/** A material, or a struct holding one, which draws as a material node of its own. */
export function holdsMaterial(value: VfxValue): boolean {
  if (value.type !== "struct") return false;
  if (MATERIAL_CLASSES.has(value.classHash)) return true;
  return value.fields.some(
    ({ value: held }) => held.type === "struct" && MATERIAL_CLASSES.has(held.classHash),
  );
}

/**
 * Where a material node's `StaticMaterialDef` is read: an object of its own, by entry hash,
 * or a struct embedded at a property path.
 *
 * An embedded material's `entry` is the object the path runs under, and null for the system
 * object the graph is drawn for.
 */
export type MaterialRef =
  | { readonly type: "linked"; readonly entry: string }
  | { readonly type: "embedded"; readonly entry: string | null; readonly path: string };

/**
 * The `StaticMaterialDef` a material struct is, links or embeds, with `path` the struct's own
 * property path, and null for none.
 */
export function materialOf(
  value: Extract<VfxValue, { type: "struct" }>,
  path: string,
  entry: string | null = null,
): MaterialRef | null {
  if (value.classHash === STATIC_MATERIAL) {
    if (value.object !== null) return { type: "linked", entry: value.object.entry };
    return { type: "embedded", entry, path };
  }

  /* A struct the read inlined from another object starts that object's own path. */
  const [under, from] = value.object === null ? [entry, path] : [value.object.entry, ""];
  const container = MATERIAL_CLASSES.has(value.classHash);
  for (const { hash, value: held } of value.fields) {
    if (held.type === "link" && container) return { type: "linked", entry: held.hash };
    if (held.type !== "struct" || !MATERIAL_CLASSES.has(held.classHash)) continue;

    const segment = hash.slice(2);
    const found = materialOf(held, from === "" ? segment : `${from}.${segment}`, under);
    if (found !== null) return found;
  }
  return null;
}
