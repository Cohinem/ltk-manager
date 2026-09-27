import type { VfxValue } from "@/lib/tauri";

import { nameHash } from "../../../shared/utils/binHash";

/** The classes a material node stands for: a material, and the container that holds one. */
export const MATERIAL_CLASSES: ReadonlySet<string> = new Set(
  ["StaticMaterialDef", "VfxMaterialContainer"].map((name) => nameHash(name)),
);

const STATIC_MATERIAL = nameHash("StaticMaterialDef");

/** A material, or a struct holding one, which draws as a material node of its own. */
export function holdsMaterial(value: VfxValue): boolean {
  if (value.type !== "struct") return false;
  if (MATERIAL_CLASSES.has(value.classHash)) return true;
  return value.fields.some(
    ({ value: held }) => held.type === "struct" && MATERIAL_CLASSES.has(held.classHash),
  );
}

/** The `StaticMaterialDef` a material struct is or links, by entry hash, and null for none. */
export function materialEntry(value: Extract<VfxValue, { type: "struct" }>): string | null {
  if (value.classHash === STATIC_MATERIAL) return value.object?.entry ?? null;

  const container = MATERIAL_CLASSES.has(value.classHash);
  for (const { value: held } of value.fields) {
    if (held.type === "link" && container) return held.hash;
    if (held.type !== "struct" || !MATERIAL_CLASSES.has(held.classHash)) continue;

    const entry = materialEntry(held);
    if (entry !== null) return entry;
  }
  return null;
}
