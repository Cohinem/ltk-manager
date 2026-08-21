import { useMutation } from "@tanstack/react-query";

import { api, type AppError } from "@/lib/tauri";
import { usePlaySessionStore } from "@/stores";
import { unwrapForQuery } from "@/utils/query";

/**
 * Call off the launch that is in flight.
 *
 * The backend checks the stop flag between the steps of its wait, so a cancel
 * can lag by one in-flight request - which is why the step goes to `cancelling`
 * rather than straight back to idle. The launch itself reports `STOPPED`, which
 * `useLaunchErrorToast` deliberately says nothing about.
 *
 * Stopping abandons the wait and not the launch: a request the Riot Client
 * already accepted still starts a game.
 */
export function useCancelLaunch() {
  const setStep = usePlaySessionStore((s) => s.setStep);

  return useMutation<boolean, AppError, void>({
    mutationFn: async () => {
      const result = await api.cancelLaunch();
      return unwrapForQuery(result);
    },
    onMutate: () => {
      setStep("cancelling");
    },
  });
}
