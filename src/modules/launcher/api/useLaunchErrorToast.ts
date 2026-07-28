import { useCallback } from "react";

import { useToast } from "@/components";
import type { AppError, LauncherError } from "@/lib/tauri";
import { hasErrorCode } from "@/utils/errors";

interface LaunchErrorMessage {
  title: string;
  description: string;
}

/**
 * Each launch failure has a different remedy, so each gets its own wording.
 *
 * Note what is deliberately absent: nothing offers to start a second Riot
 * Client when the running one is unreachable. Riot's process singleton is an
 * exclusive lock on the lockfile, and a second client that cannot hand off its
 * argv within five seconds kills the first - mid-champion-select, in the worst
 * case. Opening the client by hand is the only safe recovery.
 */
function launchErrorMessage(error: AppError): LaunchErrorMessage {
  if (hasErrorCode(error, "RIOT_CLIENT_NOT_FOUND")) {
    return {
      title: "Can't find your Riot Client",
      description:
        "Check that your League installation path is set correctly in Settings - the manager reads it to work out which Riot Client owns your install.",
    };
  }

  if (hasErrorCode(error, "RIOT_CLIENT_UNREACHABLE")) {
    return {
      title: "Couldn't reach the Riot Client",
      description:
        "It's running but didn't accept the launch request. Bring it up manually and try again.",
    };
  }

  if (hasErrorCode(error, "LAUNCH_REFUSED")) {
    return refusalMessage(error);
  }

  return { title: "Couldn't launch League", description: error.message };
}

/**
 * The Riot Client answered, and its answer is the remedy.
 *
 * The backend already retried these for half a minute, so one arriving here is
 * a standing condition rather than a client that was still waking up - which is
 * why the wording tells the player to go and clear it rather than to try again.
 */
function refusalMessage(error: AppError): LaunchErrorMessage {
  // Launcher failures carry the whole `LauncherError` as their context, so the
  // generated union narrows it - no schema needed to read one field off it.
  const context = error.context as LauncherError | undefined;
  const riotErrorCode = context?.kind === "LAUNCH_REFUSED" ? context.riotErrorCode : undefined;

  if (riotErrorCode === "eula_not_accepted") {
    return {
      title: "Riot's Terms of Service need accepting",
      description:
        "Open the Riot Client and accept the Terms of Service, then press Play again. The Riot Client won't start League until you have.",
    };
  }

  // Riot's own prose is better than anything generic we could write for a
  // condition we have not seen before, so it goes through unedited.
  return { title: "The Riot Client refused to launch League", description: error.message };
}

/** Returns a callback that surfaces a launch failure with the right wording. */
export function useLaunchErrorToast() {
  const toast = useToast();

  return useCallback(
    (error: AppError) => {
      const { title, description } = launchErrorMessage(error);
      toast.error(title, description);
      console.error("Failed to launch League:", error);
    },
    [toast],
  );
}
