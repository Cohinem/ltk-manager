import { useQuery } from "@tanstack/react-query";

import { api, type AppError, type ChecksumMismatchInfo } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { libraryKeys } from "./keys";

/**
 * Read the checksum mismatches the most recent overlay build found in a single
 * mod. A mismatch marks a badly-packed archive: its container claimed a
 * checksum its own bytes don't have. Advisory only — the overlay carries the
 * recomputed value, so the mod still works. Returns `[]` when the mod's
 * containers told the truth (or the mod wasn't part of the last build). Reads
 * from a shared batch query, so many subscribers is a single IPC call.
 */
export function useModChecksumMismatches(modId: string) {
  return useQuery<Record<string, ChecksumMismatchInfo[]>, AppError, ChecksumMismatchInfo[]>({
    queryKey: libraryKeys.checksumMismatches(),
    queryFn: async () => {
      const result = await api.getChecksumMismatches();
      return unwrapForQuery(result);
    },
    staleTime: 5 * 60 * 1000,
    select: (data) => data[modId] ?? [],
  });
}
