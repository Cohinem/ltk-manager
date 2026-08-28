import { useQuery } from "@tanstack/react-query";

import { api, type AppError, type ModCheckVerdict } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { libraryKeys } from "./keys";

/**
 * Batch-fetch every remembered mod health verdict in a single IPC call.
 * Individual badges select their own mod's entry via `useCheckVerdict`.
 */
export function useCheckVerdicts() {
  return useQuery<Record<string, ModCheckVerdict>, AppError>({
    queryKey: libraryKeys.checkVerdicts(),
    queryFn: async () => {
      const result = await api.getCheckVerdicts();
      return unwrapForQuery(result);
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The remembered health verdict for a single mod, or `null` for a mod that
 * has never been checked. Reads from the shared batch query — no extra IPC.
 */
export function useCheckVerdict(modId: string) {
  return useQuery<Record<string, ModCheckVerdict>, AppError, ModCheckVerdict | null>({
    queryKey: libraryKeys.checkVerdicts(),
    queryFn: async () => {
      const result = await api.getCheckVerdicts();
      return unwrapForQuery(result);
    },
    staleTime: 5 * 60 * 1000,
    select: (data) => data[modId] ?? null,
  });
}
