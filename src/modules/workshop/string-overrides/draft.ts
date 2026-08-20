import type { OverrideEntry } from "./types";

/** Per-entry problems that block a save, keyed by entry id. */
export function validateEntries(entries: readonly OverrideEntry[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();

  for (const entry of entries) {
    const key = entry.key.trim();
    /* The game matches field names case-insensitively, so two keys differing
       only in case collide. */
    const folded = key.toLowerCase();

    if (!key) {
      errors[entry.id] = "Field name cannot be empty";
    } else if (seen.has(folded)) {
      errors[entry.id] = "Duplicate field name";
    }
    seen.add(folded);
  }

  return errors;
}

/**
 * Whether the filter keeps an entry on screen: it matches the key, the
 * replacement, or the current in-game text the row shows beneath it.
 */
export function matchesOverrideFilter(
  entry: OverrideEntry,
  original: string | undefined,
  query: string,
): boolean {
  /* A row whose key was edited away stays visible whatever the filter says,
     because it carries the error blocking the save. */
  if (!entry.key.trim()) return true;

  const term = query.trim().toLowerCase();
  if (!term) return true;

  if (entry.key.toLowerCase().includes(term)) return true;
  if (entry.value.toLowerCase().includes(term)) return true;
  return original !== undefined && original.toLowerCase().includes(term);
}

/**
 * The draft's saveable content, one string per distinct state on disk.
 *
 * Sorted and stripped of unkeyed rows, so reordering entries or holding a
 * half-made row does not read as a change worth writing.
 */
export function serializeDraft(entries: readonly OverrideEntry[]): string {
  const pairs = entries
    .filter((entry) => entry.key.trim().length > 0)
    .map((entry) => [entry.key.trim(), entry.value] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(pairs);
}
