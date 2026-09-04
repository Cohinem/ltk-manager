import type { LaunchProgress } from "@/lib/tauri";
import { useTauriProgress } from "@/lib/useTauriProgress";

/**
 * Stages that end a launch. Anything else means one is still in flight.
 *
 * `stopped` belongs here for the same reason `error` does - the request is over
 * - and nowhere near an error dialog, because the user is the one who ended it.
 */
const TERMINAL_STAGES = ["launched", "alreadyRunning", "stopped", "error"];

/**
 * Follow a launch request while it runs.
 *
 * `launch_league` blocks for as long as the handoff takes - up to a minute when
 * the Riot Client has to boot from the tray - so the mutation's pending flag
 * says only "something is happening". These events say what.
 */
export function useLaunchProgress(): LaunchProgress | null {
  const { progress } = useTauriProgress<LaunchProgress>("launch-progress", {
    terminalStages: TERMINAL_STAGES,
    // Long enough for "League is starting" to be read rather than glimpsed.
    clearDelay: 4000,
  });

  return progress;
}
