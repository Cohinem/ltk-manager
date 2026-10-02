import { useCallback, useMemo } from "react";

import type { WadBlocklistEntry } from "@/lib/tauri";

import { useLoadedSettings, useUpdateSettings } from "../api";

export interface UseWadBlocklistResult {
  blocklist: WadBlocklistEntry[];
  /** Append an entry. Returns `false` if an equivalent entry already exists. */
  add: (entry: WadBlocklistEntry) => boolean;
  removeAt: (index: number) => void;
  clear: () => void;
}

/**
 * CRUD surface for the `wadBlocklist` slice of `Settings`, saved as each change lands.
 *
 * `add` treats two entries as equivalent when they share the same `kind` and a
 * case-insensitive value match. Exact and Regex entries with the same literal
 * value are allowed to coexist because they block different things.
 */
export function useWadBlocklist(): UseWadBlocklistResult {
  const settings = useLoadedSettings();
  const update = useUpdateSettings();
  const blocklist = useMemo(() => settings.wadBlocklist ?? [], [settings.wadBlocklist]);

  const replace = useCallback(
    (next: WadBlocklistEntry[]) => {
      update({ wadBlocklist: next });
    },
    [update],
  );

  const add = useCallback(
    (entry: WadBlocklistEntry): boolean => {
      const needle = entry.value.toLowerCase();
      const isDuplicate = blocklist.some(
        (e) => e.kind === entry.kind && e.value.toLowerCase() === needle,
      );
      if (isDuplicate) return false;
      replace([...blocklist, entry]);
      return true;
    },
    [blocklist, replace],
  );

  const removeAt = useCallback(
    (index: number) => {
      replace(blocklist.filter((_, i) => i !== index));
    },
    [blocklist, replace],
  );

  const clear = useCallback(() => {
    replace([]);
  }, [replace]);

  return { blocklist, add, removeAt, clear };
}
