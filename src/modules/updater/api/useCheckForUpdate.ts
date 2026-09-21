import { useCallback } from "react";

import { useUpdaterStore } from "@/stores";

import { updaterClient, updaterErrorMessage } from "./client";

/** Ask the update server what it has, and hand the answer to the store. */
export function useCheckForUpdate() {
  const startCheck = useUpdaterStore((s) => s.startCheck);
  const reportCheck = useUpdaterStore((s) => s.reportCheck);
  const failCheck = useUpdaterStore((s) => s.failCheck);

  return useCallback(async () => {
    const { checking, updating } = useUpdaterStore.getState();
    if (checking || updating) return;

    startCheck();
    const result = await updaterClient().check();
    if (result.ok) {
      reportCheck(result.value);
    } else {
      const message = updaterErrorMessage(result.error);
      console.error("Update check failed:", message);
      failCheck(message);
    }
  }, [failCheck, reportCheck, startCheck]);
}
