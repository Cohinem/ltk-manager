import { useEffect } from "react";

import { useUpdaterCheckForUpdate } from "@/stores";

/**
 * Check for an update shortly after the app mounts.
 *
 * Skipped in dev: a dev build reports the workspace version, which is whatever
 * release is current, so the check offers an update to the version already
 * running - and does it on every hot reload. The store's `checkForUpdate` is
 * left alone so an explicit check still works from the console.
 */
export function useUpdateCheck({ checkOnMount = true, delayMs = 3000 } = {}) {
  const checkForUpdate = useUpdaterCheckForUpdate();

  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!checkOnMount) return;

    const timeoutId = setTimeout(() => {
      checkForUpdate();
    }, delayMs);

    return () => clearTimeout(timeoutId);
  }, [checkOnMount, delayMs, checkForUpdate]);
}
