import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api, type AppError } from "@/lib/tauri";
import { usePatcherSessionStore } from "@/stores";
import { unwrapForQuery } from "@/utils/query";

import { patcherKeys } from "./keys";

/**
 * Ask the patcher to stop.
 *
 * The mutation resolves as soon as the backend has set its stop flag, which is
 * not when the patcher has stopped - so the shared `stopping` flag is raised
 * here and lowered by `useClearStoppingOnIdle` once the session actually ends.
 * A caller that keyed off `isPending` alone would show a stopping state for a
 * few milliseconds of a multi-second wait.
 */
export function useStopPatcher() {
  const queryClient = useQueryClient();
  const setStopping = usePatcherSessionStore((s) => s.setStopping);

  return useMutation<void, AppError, void>({
    mutationFn: async () => {
      const result = await api.stopPatcher();
      return unwrapForQuery(result);
    },
    onMutate: () => {
      setStopping(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: patcherKeys.status() });
    },
    // Nothing is unwinding if the request itself failed, so the flag must come
    // straight back down - `NotRunning` is the ordinary case here, from a stop
    // racing a session that had already ended.
    onError: () => {
      setStopping(false);
    },
  });
}
