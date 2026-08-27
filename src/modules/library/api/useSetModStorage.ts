import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, type AppError, type InstalledMod, type ModStorage } from "@/lib/tauri";
import { unwrapForQuery } from "@/utils/query";

import { libraryKeys } from "./keys";

interface SetModStorageVariables {
  modId: string;
  storage: ModStorage;
}

/**
 * Switch where one mod's content is read from: its archive, or an unpacked tree.
 */
export function useSetModStorage() {
  const queryClient = useQueryClient();

  return useMutation<InstalledMod, AppError, SetModStorageVariables>({
    mutationFn: async ({ modId, storage }) =>
      unwrapForQuery(await api.setModStorage(modId, storage)),
    onSuccess: (updated) => {
      queryClient.setQueryData<InstalledMod[]>(libraryKeys.mods(), (old) =>
        old?.map((mod) => (mod.id === updated.id ? updated : mod)),
      );
    },
    onSettled: (_updated, _error, { modId }) => {
      queryClient.invalidateQueries({ queryKey: libraryKeys.mods() });
      // The tree the overlay reads was rewritten, so the cached scan of it is
      // about a directory that no longer exists.
      queryClient.invalidateQueries({ queryKey: libraryKeys.wadReport(modId) });
    },
  });
}
