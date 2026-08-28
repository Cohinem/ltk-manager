import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/components";
import { api, type AppError, type ModCheckVerdict } from "@/lib/tauri";
import { hasErrorCode } from "@/utils/errors";
import { unwrapForQuery } from "@/utils/query";

import { libraryKeys } from "./keys";

/**
 * Re-check one mod's health on demand and refresh its remembered verdict.
 */
export function useCheckMod() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<ModCheckVerdict, AppError, string>({
    mutationFn: async (modId) => {
      const result = await api.checkMod(modId);
      return unwrapForQuery(result);
    },
    onSuccess: (verdict) => {
      // Patch the shared batch cache so the badge updates immediately.
      queryClient.setQueryData<Record<string, ModCheckVerdict>>(
        libraryKeys.checkVerdicts(),
        (old) => (old ? { ...old, [verdict.modId]: verdict } : { [verdict.modId]: verdict }),
      );
    },
    onError: (error) => {
      if (hasErrorCode(error, "MOD_NOT_FOUND")) {
        toast.error("Mod no longer exists in the library");
        return;
      }
      toast.error(error.message ?? "Failed to check mod");
    },
  });
}
