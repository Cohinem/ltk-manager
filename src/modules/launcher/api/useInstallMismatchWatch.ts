import { useCallback, useEffect } from "react";

import { api, isOk } from "@/lib/tauri";
import { useTauriEvent } from "@/lib/useTauriEvent";
import { usePatcherStatus } from "@/modules/patcher";
import { useInstallMismatchStore } from "@/stores";

/**
 * Asks the backend whether the League the client runs is the install the
 * overlay was built for, at the moments the answer can change: the patcher
 * starting, a League session opening while it runs, and the DLL attaching to
 * a game while it runs.
 *
 * Per "The install mismatch dialog" in docs/ux/LEAGUE_DIAGNOSTICS.md. Mount
 * once at the root. The backend is silent without a client, a session, or a
 * registry entry for the configured path, and so is this. The attach is the
 * sign of a session the client opened with no watcher on it, which is every
 * Classic-mode game.
 */
export function useInstallMismatchWatch() {
  const { data: status } = usePatcherStatus();
  const raise = useInstallMismatchStore((s) => s.raise);
  const reset = useInstallMismatchStore((s) => s.reset);

  const running = status?.running ?? false;

  const check = useCallback(async () => {
    const result = await api.launcher.checkInstallMismatch();
    if (isOk(result) && result.value) raise(result.value);
  }, [raise]);

  // The phase reaching `patching` is the start, whichever surface asked for it.
  const patching = status?.phase === "patching";
  useEffect(() => {
    if (!patching) return;
    reset();
    void check();
  }, [patching, reset, check]);

  const checkWhileRunning = () => {
    if (running) void check();
  };
  useTauriEvent<unknown>("session-started", checkWhileRunning);
  useTauriEvent<unknown>("patcher-game-attached", checkWhileRunning);
}
