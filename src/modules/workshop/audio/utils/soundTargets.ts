import type { SoundTarget } from "@/lib/tauri";

/** The most targets that the picker lists for one query. */
const MATCH_LIMIT = 50;

/** Returns the field path of `target` for a person: the object, then the path to the field. */
export function targetLabel(target: SoundTarget): string {
  const path = target.row.property?.label ?? "";
  return path === "" ? target.row.object : `${target.row.object} ${path}`;
}

/**
 * Returns the targets whose bin, object or field path contains every word of `query`, without
 * case, the empty fields first, up to 50.
 */
export function matchingTargets(targets: readonly SoundTarget[], query: string): SoundTarget[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = targets.filter((target) => {
    const text = `${target.row.bin} ${targetLabel(target)} ${target.value}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });

  return [...matches]
    .sort((a, b) => Number(a.value !== "") - Number(b.value !== ""))
    .slice(0, MATCH_LIMIT);
}
