import { useEffect } from "react";

import { usePatcherSessionStore } from "@/stores";

import { usePatcherStatus } from "./usePatcherStatus";

/**
 * Lower the shared `stopping` flag once the patcher has actually stopped.
 *
 * The counterpart to `useStopPatcher` raising it. Must be mounted for the whole
 * app lifetime rather than beside the button: the patcher can be stopped from
 * any page and by a global hotkey, and a flag left raised would leave every stop
 * control spinning forever.
 *
 * Keyed on the status query rather than on a timer, so the spinner lasts exactly
 * as long as the unwind does.
 */
export function useClearStoppingOnIdle() {
  const { data: status } = usePatcherStatus();
  const stopping = usePatcherSessionStore((s) => s.stopping);
  const setStopping = usePatcherSessionStore((s) => s.setStopping);

  const isRunning = status?.running ?? false;

  useEffect(() => {
    if (stopping && !isRunning) setStopping(false);
  }, [stopping, isRunning, setStopping]);
}
