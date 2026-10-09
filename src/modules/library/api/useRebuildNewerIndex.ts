import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, type AppError } from "@/lib/tauri";
import { mutationFn } from "@/utils/query";

import { libraryKeys } from "./keys";

/** Set aside a library index that a newer app version wrote, and rebuild the library from disk. */
export function useRebuildNewerIndex() {
  const client = useQueryClient();

  return useMutation<null, AppError, void>({
    mutationFn: mutationFn(api.rebuildNewerLibraryIndex),
    onSuccess: () => client.invalidateQueries({ queryKey: libraryKeys.all }),
  });
}
