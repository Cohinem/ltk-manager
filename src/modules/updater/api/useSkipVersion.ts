import { useCallback } from "react";

import { useUpdaterStore } from "@/stores";

import { updaterClient } from "./client";

/** Skip the release on offer, or take the skip back, dropping an installer a skip leaves unwanted. */
export function useSkipVersion() {
  const setSkipVersion = useUpdaterStore((s) => s.setSkipVersion);

  return useCallback(
    (skip: boolean) => {
      setSkipVersion(skip);
      if (skip) void updaterClient().discard();
    },
    [setSkipVersion],
  );
}
