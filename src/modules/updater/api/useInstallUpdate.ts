import { useCallback } from "react";

import { useUpdaterStore } from "@/stores";

import { updaterClient, updaterErrorMessage } from "./client";
import { downloadUpdate } from "./downloadUpdate";

/** Finish the download if it is still running, then install and relaunch into the update. */
export function useInstallUpdate() {
  const startInstall = useUpdaterStore((s) => s.startInstall);
  const failInstall = useUpdaterStore((s) => s.failInstall);

  return useCallback(async () => {
    const { update, updating } = useUpdaterStore.getState();
    if (!update || updating) return;

    startInstall();
    const downloaded = await downloadUpdate();
    const installed = downloaded.ok ? await updaterClient().install() : downloaded;
    if (!installed.ok) {
      const message = updaterErrorMessage(installed.error);
      console.error("Update installation failed:", message);
      failInstall(message);
    }
  }, [failInstall, startInstall]);
}
